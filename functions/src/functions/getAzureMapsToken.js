const { app } = require('@azure/functions');
const { ClientSecretCredential } = require('@azure/identity');

app.http('getAzureMapsToken', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (req, context) => {
    try {
      const tenantId = process.env.AZURE_TENANT_ID;
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;

      if (!tenantId || !clientId || !clientSecret) {
        return { status: 500, body: 'Missing env vars (AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET)' };
      }

      const scope = 'https://atlas.microsoft.com/.default';

      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      const token = await credential.getToken(scope);

      return {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store'
        },
        body: token.token
      };
    } catch (e) {
      context.log('getAzureMapsToken error:', e);
      return { status: 500, body: 'Failed to acquire Azure Maps token' };
    }
  }
});
