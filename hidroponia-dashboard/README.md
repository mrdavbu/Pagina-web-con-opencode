# Dashboard Comparativo de Mercado Hidropónico — Colombia

Sistema de benchmarking para tu investigación de hidroponía cerámica. Construido para integrarse con tu bitácora existente en `index.html`.

## 📁 Estructura del proyecto

```
hidroponia-dashboard/
├── dashboard.html              # UI principal (abrir en navegador o deployar en Vercel)
├── api/
│   ├── products.js             # Endpoint unificado: catálogo + scrapers + stats
│   └── scrape/
│       ├── mercadolibre.js     # API oficial + HTML fallback
│       ├── indulife.js         # INDULIFE (ex El Aeropónico) - WooCommerce
│       ├── woo-generic.js      # Genérico para cualquier WooCommerce (Pevgrow, etc.)
│       └── manual.js           # Carga manual asistida (Homecenter, Sodimac, etc.)
├── lib/
│   └── bitacora-export.js      # Genera Markdown listo para pegar en la bitácora
├── data/
│   ├── productos-colombia.json # Catálogo curado: 15+ productos reales del mercado CO
│   └── fuentes.json            # Configuración de 7 sitios (status real de scraping)
├── package.json                # Deps: cheerio (para parsing HTML)
└── vercel.json                 # Config Vercel Functions (serverless)
```

## 🚀 Deploy en Vercel (recomendado)

### Opción A: Conectar repo GitHub (más limpio)

1. Sube esta carpeta `dashboard/` a un repo GitHub (o añádela a tu repo existente de la bitácora)
2. En Vercel: **Add New Project** → Importa el repo
3. **Framework Preset**: `Other` (es un proyecto estático + functions)
4. **Root Directory**: `dashboard` (si está en subcarpeta) o `.` (si es la raíz)
5. **Build Command**: (dejar vacío)
6. **Output Directory**: `.` (sirve archivos estáticos desde raíz)
7. Deploy → tendrás:
   - `https://tu-proyecto.vercel.app/dashboard.html` — UI del dashboard
   - `https://tu-proyecto.vercel.app/api/products` — endpoint JSON
   - `https://tu-proyecto.vercel.app/api/scrape/mercadolibre?action=search&q=kit+hidroponico` — scraper ML
   - etc.

### Opción B: Vercel CLI (rápido, sin GitHub)

```bash
cd C:/Users/david/Documents/Bitacora/dashboard
npm i -g vercel
vercel
# Sigue las preguntas: "Link to existing project?" → N, "Directory?" → ./
# Te dará URL temporal para probar
# Luego: vercel --prod para producción
```

### Opción C: Solo archivos estáticos (sin scrapers en vivo)

Si no quieres Functions, sube solo `dashboard.html` + `data/` a tu hosting actual (Netlify, GitHub Pages, tu Vercel existente). El dashboard cargará el catálogo curado desde `data/productos-colombia.json` y la carga manual funcionará. Los scrapers en vivo requieren Functions.

---

## 🔧 Desarrollo local

```bash
cd C:/Users/david/Documents/Bitacora/hidroponia-dashboard
npm install

# Testear endpoint products (simula Vercel Function)
node -e "
const handler = require('./api/products.js');
const req = { method: 'GET', query: {} };
const res = {
  setHeader: () => {},
  status: (c) => ({ json: (d) => console.log('STATUS', c, JSON.stringify(d, null, 2)) })
};
handler(req, res);
"

# Testear scraper MercadoLibre
node -e "
const handler = require('./api/scrape/mercadolibre.js');
const req = { method: 'GET', query: { action: 'search', q: 'kit hidroponico', limit: 3 } };
const res = { setHeader: () => {}, status: (c) => ({ json: (d) => console.log('ML:', JSON.stringify(d, null, 2)) }) };
handler(req, res);
"
```

---

## 🎯 Uso del Dashboard

### 1. Abre `dashboard.html` en el navegador
- Si hiciste deploy en Vercel: `https://tu-proyecto.vercel.app/dashboard.html`
- Si local: abre el archivo directamente (algunas funciones requieren servidor HTTP por CORS)

### 2. Interfaz principal
| Zona | Función |
|---|---|
| **Hero + Stats** | Resumen rápido: total productos, fuentes, rango precios, cerámica, pasivos |
| **Charts** | Barras: materiales + dependencia energética |
| **Search + Chips** | Filtra por texto y categoría (Investigación, Dibujo, Prototipo, Registro de cultivo, Reflexión) |
| **Fuentes** | Activa/desactiva: Catálogo curado, MercadoLibre, INDULIFE, Pevgrow, Manual |
| **Grid de productos** | Cards con thumb, precio, badges (Cerámica/Plástico, Eléctrico/Pasivo, Modular, Vertical) |
| **Click en card** | Abre modal con detalle completo + reseñas + nota de investigación |
| **Checkbox esquina** | Selecciona productos para comparar |
| **Barra flotante** | Muestra selección → "Ver tabla" o "Exportar a bitácora" |

### 3. Flujo típico de trabajo

```
1. Abres dashboard → ves 15 productos curados del mercado CO
2. Click "🔄 Actualizar" → intenta scrapeo en vivo (ML + INDULIFE + Pevgrow)
3. Buscas "kit nft" → filtras
4. Seleccionas 3-5 productos con checkboxes
5. Click "Ver tabla" → tabla comparativa detallada con mejores/peores resaltados
6. Click "Exportar a bitácora" → panel con Markdown generado
7. Click "📋 Copiar Markdown" → pegas en tu bitácora (Categoría: Investigación)
```

### 4. Agregar producto manual (sitios bloqueados: Homecenter, Sodimac, Yaxa)

1. Click `+ Manual` en toolbar
2. Pegas URL del producto
3. El sistema intenta pre-llenar título/precio (si el HTML es accesible)
4. Completas/confirmas: nombre, precio, material, capacidad, bombeo, energía
5. Se agrega al catálogo local y se selecciona automáticamente
6. Lo exportas a la bitácora

### 5. Exportar a la bitácora

El Markdown generado incluye:
- Frontmatter: título, fecha, categoría, tags
- Resumen ejecutivo automático
- **Hallazgos clave** (detecta hueco de mercado: cerámica modular pasiva = 0 productos)
- Tabla comparativa
- Detalle por producto con notas de investigación
- Link directo a tu bitácora desde el panel

---

## 📊 Catálogo curado incluido (15 productos reales)

| Producto | Marca | Precio COP | Material | Plantas | Energía | Fuente |
|---|---|---|---|---|---|---|
| Growell 17-pod | Growell | 639.777 | Plástico ABS | 17 | ⚡ Sí | INDULIFE |
| Kit NFT 12 plantas | Hidropónicos CO | 489.000 | PVC | 12 | ⚡ Sí | ML |
| Sistema DWC 6 plantas | Genérico | 210.000 | Plástico | 6 | ⚡ Sí | ML |
| Torre vertical 20 plantas | AgroCultivo | 890.000 | PVC | 20 | ⚡ Sí | Pevgrow |
| Kit Kratky cerámica 4p | Cerámica Viva | 1.250.000 | Cerámica | 4 | 🌱 No | Manual |
| Maceta autorriego terracota | Artesanal CO | 180.000 | Terracota | 1 | 🌱 No | Manual |
| ...y 9 más |

---

## ⚠️ Limitaciones honestas del scraping

| Sitio | Funciona | Qué pasa |
|---|---|---|
| MercadoLibre CO | ⚠️ Parcial | API oficial OK para búsquedas básicas; HTML bloqueado por Datadome |
| INDULIFE (ex El Aeropónico) | ✅ Sí | WooCommerce público, selectores estables |
| Pevgrow (envía a CO) | ✅ Sí | WooCommerce, mismos selectores |
| Homecenter | ❌ No | JS pesado + anti-bot |
| Sodimac | ❌ No | JS pesado + anti-bot |
| Yaxa.co | ❌ No | Cloudflare / Tienda Nube protegida |
| Falabella | ❌ No | Datadome agresivo |

**Por eso el catálogo curado + carga manual es la base real.** Los scrapers son bonus que funcionan cuando pueden.

---

## 🔗 Integración con tu bitácora

Ya agregué el link en `index.html` (línea ~245):

```html
<a class="stat" href="dashboard/dashboard.html" target="_blank">
  <span class="num">📊</span>
  <span class="lbl">Dashboard comparativo</span>
</a>
```

Aparece como 4ª tarjeta en el hero de la bitácora, abre en nueva pestaña.

### Flujo bitácora ↔ dashboard

```
Bitácora (Investigación)
    ↓ click "Dashboard comparativo"
Dashboard (benchmarking)
    ↓ seleccionas productos + "Exportar a bitácora"
Markdown generado → Copiar
    ↓ pegas en bitácora como nueva entrada "Investigación"
Bitácora guarda entrada con todos los datos estructurados
```

---

## 📝 Próximos pasos sugeridos

1. **Añade tus productos** — Edita `data/productos-colombia.json` con más productos que investigues
2. **API key MercadoLibre** — Regístrate en `developers.mercadolibre.com.ve` (gratis), crea app, pon `ML_CLIENT_ID` y `ML_CLIENT_SECRET` en Vercel Environment Variables para búsquedas sin límite
3. **Vercel KV (opcional)** — Para cachear resultados scrapeados 24h y no re-scrapear: `npm i @vercel/kv` y descomenta la lógica en `api/products.js`
4. **Categorías personalizadas** — Si quieres más chips en el dashboard, edita `data/productos-colombia.json` → `categorias` array

---

## 🐛 Troubleshooting

| Problema | Solución |
|---|---|
| Dashboard no carga productos | Abre DevTools → Network → mira si `/api/products` responde. Si es file:// local, sirve con `npx serve .` |
| Scraper ML devuelve vacío | Normal sin API key. Usa catálogo curado + manual |
| CORS error en local | Usa `npx serve .` o deploya a Vercel |
| `cheerio` not found | `npm install` en carpeta dashboard |
| Vercel deploy falla | Revisa que `vercel.json` esté en raíz del proyecto y `package.json` tenga `"type": "module"` |

---

## 📄 Licencia

MIT — Úsalo libremente para tu proyecto de grado / investigación.

---

**¿Dudas?** Abre el dashboard, selecciona productos, exporta a bitácora. El flujo está diseñado para ser tu herramienta diaria de investigación, no un demo. 🌱