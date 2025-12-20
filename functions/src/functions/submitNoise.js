const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const { BlobServiceClient } = require('@azure/storage-blob');

const AZURE_STORAGE_CONNECTION_STRING = process.env['AzureWebJobsStorage'];
const containerName = process.env.NOISE_CONTAINER || "quietplace-data";

function getColor(decibel) {
  if (decibel < 50) return 'green';
  if (decibel < 80) return 'yellow';
  return 'red';
}

app.http('submitNoise', {
  methods: ['POST'],
  authLevel: 'anonymous',
handler: async (request, context) => {
  try {
    const body = await request.json();

    context.log("Body ricevuto:", JSON.stringify(body));

    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const decibel = Number(body.decibel);
    const reason = body.reason && typeof body.reason === "string" ? body.reason.trim() : null;

    context.log("Parsed reason:", reason);

    if (!lat || !lon || !decibel) {
      return { status: 400, body: 'Dati mancanti o non validi.' };
    }

    const point = {
      id: uuidv4(),
      lat,
      lon,
      decibel,
      reason,
      color: getColor(decibel),
      timestamp: new Date().toISOString(),
      active: true
    };

    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();

    const blobName = `${point.timestamp}_${point.id}.json`;
    const content = JSON.stringify(point);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(content, Buffer.byteLength(content));

    context.log("Salvato:", content);

    return { status: 201, body: JSON.stringify({ ok: true, point }) };
  } catch (err) {
    context.log('Errore interno:', err.message);
    return { status: 500, body: JSON.stringify({ error: 'Errore interno nel salvataggio.' }) };
  }
}

});
