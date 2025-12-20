const { app } = require('@azure/functions');
const { BlobServiceClient } = require("@azure/storage-blob");

app.http('zones', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (req, ctx) => {
    try {
      const connStr = process.env.STORAGE_CONN;
      const blobService = BlobServiceClient.fromConnectionString(connStr);
      const container = blobService.getContainerClient("quietplace-zones");
      const blob = container.getBlockBlobClient("zones.json");
      const buffer = await blob.downloadToBuffer();
      return {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"   
        },
        body: buffer.toString("utf8")
      };
    } catch (err) {
      ctx.log("Errore getZones:", err.message);
      return { status: 404, body: "zones.json non trovato" };
    }
  }
});
