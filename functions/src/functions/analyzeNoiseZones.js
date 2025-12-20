const { app } = require('@azure/functions');
const { BlobServiceClient } = require("@azure/storage-blob");

// Precisione della griglia (~110 m a 0.001°)
const PRECISION = 3;

// Raggruppa coordinate in “celle”
function cellKey(lat, lon) {
  return `${lat.toFixed(PRECISION)}|${lon.toFixed(PRECISION)}`;
}

// Colore in base ai dB medi
function colorByMeanDb(db) {
  if (db < 55) return "green";
  if (db < 70) return "yellow";
  return "red";
}

app.timer('analyzeNoiseZones', {
  // ogni notte alle 03:00 (UTC)
  schedule: '0 0 3 * * *',
  handler: async (myTimer, context) => {
    try {
      const connStr = process.env.STORAGE_CONN;
      const historyName = "quietplace-history";
      const zonesName = "quietplace-zones";

      const blobService = BlobServiceClient.fromConnectionString(connStr);
      const history = blobService.getContainerClient(historyName);
      const zones = blobService.getContainerClient(zonesName);
      await zones.createIfNotExists();

      const cells = new Map();
      let total = 0;

      // Legge tutti i blob storici
      for await (const blob of history.listBlobsFlat()) {
        if (!blob.name.endsWith(".json")) continue;
        const block = history.getBlockBlobClient(blob.name);
        const buf = await block.downloadToBuffer();
        let p;
        try {
          p = JSON.parse(buf.toString("utf8"));
        } catch { continue; }

        const lat = Number(p?.lat);
        const lon = Number(p?.lon);
        const db = Number(p?.decibel);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(db)) continue;

        const key = cellKey(lat, lon);
        const rec = cells.get(key) || { latSum: 0, lonSum: 0, dbSum: 0, n: 0 };
        rec.latSum += lat;
        rec.lonSum += lon;
        rec.dbSum += db;
        rec.n += 1;
        cells.set(key, rec);
        total++;
      }

      // Calcolo massimi per normalizzare opacità
      let maxCount = 1;
      for (const [, rec] of cells) maxCount = Math.max(maxCount, rec.n);

      const features = [];
      for (const [, rec] of cells) {
        const meanLat = rec.latSum / rec.n;
        const meanLon = rec.lonSum / rec.n;
        const meanDb = rec.dbSum / rec.n;
        const color = colorByMeanDb(meanDb);
        const opacity = Math.min(0.1 + (rec.n / maxCount) * 0.8, 0.9);

        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [meanLon, meanLat] },
          properties: {
            count: rec.n,
            meanDb: Math.round(meanDb),
            color,
            opacity
          }
        });
      }

      const geojson = JSON.stringify({ type: "FeatureCollection", features }, null, 2);
      const out = zones.getBlockBlobClient("zones.json");
      await out.upload(geojson, Buffer.byteLength(geojson), { overwrite: true });

      context.log(`analyzeNoiseZones: ${features.length} celle generate da ${total} segnalazioni.`);
    } catch (err) {
      context.log("Errore analyzeNoiseZones:", err.message);
    }
  }
});
