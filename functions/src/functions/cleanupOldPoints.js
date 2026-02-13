const { app } = require('@azure/functions');
const { BlobServiceClient } = require("@azure/storage-blob");

app.timer('cleanupOldPoints', {
  schedule: '0 0 * * * *', // ogni ora
  handler: async (myTimer, context) => {
    try {
      const connStr = process.env.STORAGE_CONN;
      const mainContainerName = process.env.NOISE_CONTAINER || "quietplace-data";
      const archiveName = "quietplace-history";

      const blobService = BlobServiceClient.fromConnectionString(connStr);
      const mainContainer = blobService.getContainerClient(mainContainerName);
      const archiveContainer = blobService.getContainerClient(archiveName);
      await archiveContainer.createIfNotExists();

      let removed = 0;

      for await (const blob of mainContainer.listBlobsFlat()) {
        const block = mainContainer.getBlockBlobClient(blob.name);
        const buffer = await block.downloadToBuffer();
        const data = JSON.parse(buffer.toString('utf8'));

        const timestamp = new Date(data.timestamp || 0);
        const now = new Date();
        const hoursPassed = (now - timestamp) / (1000 * 60 * 60);

        const expired = hoursPassed > 24;
        const inactive = data.active === false;

        // Se è scaduto o inattivo → archivia e rimuovi
        if (expired || inactive) {
          data.active = false;
          const updated = JSON.stringify(data);

          await archiveContainer.uploadBlockBlob(
            blob.name,
            Buffer.from(updated),
            Buffer.byteLength(updated),
            { overwrite: true }
          );

          await block.delete();
          removed++;
        }
      }

      context.log(`Pulizia completata: ${removed} punti archiviati in quietplace-history.`);
    } catch (err) {
      context.log("Errore nella pulizia:", err.message);
    }
  }
});
