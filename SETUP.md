# DQ Vertex Proxy — Guía de instalación

## Qué es esto
Un servidor proxy que conecta tu app HTML con Google Vertex AI.
Vertex AI tiene rate limits mucho más altos que Google AI Studio → no más saturación.

## Coste estimado
- Hosting proxy: GRATIS (Render free tier)
- Vertex AI: ~$0.04-0.08 por imagen generada
- 50 fotos/día = ~$2-4/día

---

## PASO 1: Google Cloud (5 min)

1. Ve a **https://console.cloud.google.com**
2. Crea un proyecto nuevo (o usa uno existente)
3. Apunta el **Project ID** (no el nombre, el ID — lo ves en la cabecera)

### Activar Vertex AI API
4. Ve a **APIs & Services → Library**
5. Busca **"Vertex AI API"**
6. Dale a **Enable**

### Crear Service Account
7. Ve a **IAM & Admin → Service Accounts**
8. **Create Service Account**
   - Nombre: `dq-vertex-proxy`
   - Role: **Vertex AI User**
9. Click en la cuenta creada → **Keys → Add Key → Create new key → JSON**
10. Se descarga un archivo `.json` — **guárdalo bien, es tu contraseña**

---

## PASO 2: Desplegar el proxy en Render (5 min)

1. Ve a **https://github.com** y crea un repositorio nuevo llamado `dq-vertex-proxy`
2. Sube los 4 archivos de esta carpeta:
   - `server.js`
   - `package.json`
   - `render.yaml`
   - `.gitignore`

3. Ve a **https://render.com** → Sign up con GitHub
4. **New → Web Service → Connect a repository** → selecciona `dq-vertex-proxy`
5. Render detecta el `render.yaml` automáticamente
6. En **Environment Variables**, configura:
   - `GCP_PROJECT_ID` → tu Project ID de Google Cloud
   - `GCP_LOCATION` → `europe-west1`
   - `GCP_SERVICE_ACCOUNT_KEY` → abre el JSON descargado en un editor de texto, copia TODO el contenido y pégalo aquí
7. Dale a **Deploy**

8. Cuando termine, Render te da una URL tipo:
   `https://dq-vertex-proxy-xxxx.onrender.com`
   
   Esa es tu URL del proxy.

---

## PASO 3: Configurar la app HTML

En tu app DQ-Parfois-Compositor.html (o la de Bershka), añade la URL del proxy en el campo correspondiente. 

La app enviará las fotos al proxy → el proxy las envía a Vertex AI → devuelve el resultado.

---

## PASO 4: Probar

1. Abre la URL del proxy en el navegador: `https://tu-proxy.onrender.com`
2. Deberías ver: `{"status":"ok","project":"tu-project-id","location":"europe-west1"}`
3. Si ves eso, está funcionando. Abre la app y procesa una foto.

---

## Solución de problemas

**"Authentication failed"** → El JSON de la service account está mal pegado. Cópialo de nuevo completo.

**"GCP_PROJECT_ID not configured"** → No has puesto la variable de entorno en Render.

**"Vertex AI API has not been used"** → No has activado la API de Vertex AI en Google Cloud (Paso 1, punto 5-6).

**"Permission denied"** → La service account no tiene el role "Vertex AI User". Ve a IAM y añádelo.

**El proxy tarda en arrancar** → Render free tier "duerme" después de 15 min sin uso. La primera petición tarda ~30s en despertar.

---

## Notas
- Render free tier duerme tras 15 min de inactividad. La primera llamada tarda en despertar.
- Si necesitas que no duerma: Render paid ($7/mes) o usar Railway/Fly.io.
- Puedes usar el mismo proxy para la app de Parfois Y la de Bershka.
- El proxy no guarda ninguna imagen — todo pasa en memoria y se descarta.
