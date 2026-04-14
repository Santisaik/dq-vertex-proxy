const express = require('express');
const cors = require('cors');
const { GoogleAuth } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;

// Config
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'europe-west1';
const MODELS = [
  'gemini-3-pro-image-preview',
];

// Auth - se configura automáticamente con GOOGLE_APPLICATION_CREDENTIALS o con la variable de entorno
let auth;
if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
  // Key JSON como variable de entorno (para Render/Railway)
  const keyData = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
  auth = new GoogleAuth({
    credentials: keyData,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
} else {
  // Archivo local (desarrollo)
  auth = new GoogleAuth({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', project: PROJECT_ID, location: LOCATION });
});

// Endpoint principal: generar imagen
app.post('/generate', async (req, res) => {
  const { parts, generationConfig, safetySettings } = req.body;

  if (!parts || !Array.isArray(parts)) {
    return res.status(400).json({ error: 'Missing or invalid parts array' });
  }

  if (!PROJECT_ID) {
    return res.status(500).json({ error: 'GCP_PROJECT_ID not configured' });
  }

  // Obtener token de acceso
  let accessToken;
  try {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    accessToken = tokenResponse.token;
  } catch (e) {
    console.error('Auth error:', e.message);
    return res.status(500).json({ error: 'Authentication failed: ' + e.message });
  }

  // Intentar con cada modelo
  for (let m = 0; m < MODELS.length; m++) {
    const model = MODELS[m];
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;

    try {
      console.log(`[${new Date().toISOString()}] Calling ${model}...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: generationConfig || {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { imageSize: '4K' },
            temperature: 0.8
          },
          safetySettings: safetySettings || [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ]
        })
      });

      clearTimeout(timeout);

      if (response.status === 503 || response.status === 429) {
        console.log(`${model} saturado (${response.status}), siguiente modelo...`);
        continue;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error(`${model} error:`, err.error?.message || response.status);
        if (m < MODELS.length - 1) continue;
        return res.status(response.status).json({ error: err.error?.message || `HTTP ${response.status}` });
      }

      const data = await response.json();

      // Buscar imagen en la respuesta
      if (data.candidates?.[0]?.content?.parts) {
        for (const part of data.candidates[0].content.parts) {
          if (part.inlineData) {
            console.log(`✅ ${model} OK`);
            return res.json({
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType,
              model
            });
          }
        }
      }

      // Safety block
      const reason = data.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY' || reason === 'OTHER') {
        return res.status(400).json({ error: `Blocked by safety filter (${reason})` });
      }

      console.log(`${model}: no image in response`);
      if (m < MODELS.length - 1) continue;
      return res.status(500).json({ error: 'No image generated' });

    } catch (e) {
      if (e.name === 'AbortError') {
        console.log(`${model} timeout`);
        if (m < MODELS.length - 1) continue;
        return res.status(504).json({ error: 'Timeout (180s)' });
      }
      console.error(`${model} exception:`, e.message);
      if (m < MODELS.length - 1) continue;
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(500).json({ error: 'All models failed' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   DQ Vertex Proxy                    ║
║   Port: ${PORT}                          ║
║   Project: ${PROJECT_ID || 'NOT SET'}
║   Location: ${LOCATION}
╚══════════════════════════════════════╝
  `);
});
