const { app } = require('@azure/functions');
const { BlobServiceClient } = require("@azure/storage-blob");

app.http('updatePointStatus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      const { id, action } = await request.json();
      const connStr = process.env.STORAGE_CONN;
      const mainContainerName = process.env.NOISE_CONTAINER || "quietplace-data";
      const archiveName = "quietplace-history";

      if (!id || !action) {
        return { status: 400, jsonBody: { error: "ID o azione mancanti." } };
      }

      const blobService = BlobServiceClient.fromConnectionString(connStr);
      const mainContainer = blobService.getContainerClient(mainContainerName);
      const archiveContainer = blobService.getContainerClient(archiveName);
      await archiveContainer.createIfNotExists();

      // Cerca il blob corrispondente all'id
      let targetBlob = null;
      for await (const blob of mainContainer.listBlobsFlat()) {
        if (blob.name.includes(id)) {
          targetBlob = blob.name;
          break;
        }
      }

      if (!targetBlob) {
        return { status: 404, jsonBody: { error: "Punto non trovato." } };
      }

      const block = mainContainer.getBlockBlobClient(targetBlob);
      const buffer = await block.downloadToBuffer();
      const data = JSON.parse(buffer.toString('utf8'));

      // === Gestione azioni ===
      if (action === "refresh") {
        // aggiorna timestamp e conferma attivo
        data.timestamp = new Date().toISOString();
        data.active = true;

        const updated = JSON.stringify(data);
        await block.upload(updated, Buffer.byteLength(updated), { overwrite: true });

        context.log(`Punto ${id} aggiornato (refresh).`);
        return { status: 200, jsonBody: { ok: true, action: "refresh" } };
      }

      if (action === "inactive") {
        // imposta come inattivo e sposta subito nello storico
        data.active = false;
        data.timestamp = new Date().toISOString();

        const updated = JSON.stringify(data);
        await archiveContainer.uploadBlockBlob(targetBlob, Buffer.from(updated), Buffer.byteLength(updated), { overwrite: true });
        await block.delete();

        context.log(`Punto ${id} disattivato e spostato in quietplace-history.`);
        return { status: 200, jsonBody: { ok: true, action: "inactive", archived: true } };
      }

      return { status: 400, jsonBody: { error: "Azione non riconosciuta." } };

    } catch (err) {
      context.log("Errore interno updatePointStatus:", err.message);
      return { status: 500, jsonBody: { error: "Errore interno nel salvataggio stato punto." } };
    }
  }
});
