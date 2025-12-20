const { app } = require('@azure/functions');
const { BlobServiceClient } = require("@azure/storage-blob");

app.http('listNoise', {
  route: 'points',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const connStr = process.env.STORAGE_CONN;
      const containerName = process.env.NOISE_CONTAINER || "quietplace-data";

      if (!connStr) {
        return { status: 500, jsonBody: { error: "STORAGE_CONN non configurato." } };
      }

      const blobService = BlobServiceClient.fromConnectionString(connStr);
      const containerClient = blobService.getContainerClient(containerName);

      const features = [];

      for await (const blob of containerClient.listBlobsFlat()) {
        try {
          const block = containerClient.getBlockBlobClient(blob.name);
          const buffer = await block.downloadToBuffer();
          const text = buffer.toString('utf8');
          const p = JSON.parse(text);

          if (
            Number.isFinite(p?.lat) &&
            Number.isFinite(p?.lon) &&
            Number.isFinite(p?.decibel)
          ) {
            // Mostra solo i punti con active=true o senza il campo (retrocompatibile)
            const isActive = p.active !== false;
            if (!isActive) return;

            features.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [Number(p.lon), Number(p.lat)] },
              properties: {
                decibel: Number(p.decibel),
                color: p.color || null,
                timestamp: p.timestamp || null,
                id: p.id || null,
                reason: p.reason ?? null,
                active: true
              }
            });
          }

        } catch (e) {
          context.log("Blob non valido:", blob.name);
        }
      }

      features.sort((a, b) => {
        const ta = new Date(a.properties.timestamp || 0).getTime();
        const tb = new Date(b.properties.timestamp || 0).getTime();
        return tb - ta;
      });

      const geojson = { type: "FeatureCollection", features };
      return { status: 200, jsonBody: geojson };

    } catch (err) {
      context.log("Errore interno listNoise:", err?.message || err);
      return { status: 500, jsonBody: { error: "Errore interno nel caricamento dei punti." } };
    }
  }
});
