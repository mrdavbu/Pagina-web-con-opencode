// api/scrape/manual.js
// Endpoint para carga manual de productos desde sitios que no permiten scraping
// (Homecenter, Sodimac, Yaxa, etc.)
//
// El usuario pega la URL del producto y opcionalmente texto/HTML pegado manualmente.
// La función extrae lo que puede (título desde <title>, meta description) y devuelve
// un objeto pre-llenado que el usuario completa con los 8 campos clave.
//
// También acepta POST con datos completos para guardar productos manuales en KV.

const cheerio = require('cheerio');

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-CO,es;q=0.9'
      },
      redirect: 'follow',
      // Timeout corto porque algunos sitios tardan
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    return null;
  }
}

function extractMeta($, url) {
  // Open Graph y meta tags son la mejor fuente cuando no hay scraping
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDescription = $('meta[property="og:description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const metaDescription = $('meta[name="description"]').attr('content');
  const htmlTitle = $('title').first().text().trim();
  const canonical = $('link[rel="canonical"]').attr('href') || url;

  return {
    titulo_sugerido: ogTitle || htmlTitle || '',
    descripcion_sugerida: ogDescription || metaDescription || '',
    imagen_sugerida: ogImage || '',
    url_canonica: canonical
  };
}

async function prefill(url) {
  const html = await fetchHtml(url);
  if (!html) {
    return {
      success: false,
      error: 'No se pudo acceder a la URL. Probablemente el sitio bloquea scraping. Pega el HTML manualmente o completa los campos a mano.',
      prefill: { url_fuente: url }
    };
  }

  const $ = cheerio.load(html);
  const meta = extractMeta($, url);

  // Intentar detectar precio en el HTML pegado (regex de respaldo)
  const priceMatch = html.match(/[\$€£]\s?([\d]{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?)/);
  const precio_sugerido = priceMatch ? parseFloat(priceMatch[1].replace(/[^\d]/g, '')) : null;

  // Detectar fuente
  let fuente_sugerida = 'Sitio externo';
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    fuente_sugerida = hostname;
  } catch (e) {}

  return {
    success: true,
    prefill: {
      url_fuente: url,
      nombre: meta.titulo_sugerido,
      descripcion: meta.descripcion_sugerida,
      imagen: meta.imagen_sugerida,
      precio_cop: precio_sugerido,
      fuente: fuente_sugerida,
      campos_pendientes: [
        'precio_cop', 'material_principal', 'capacidad_plantas',
        'dimensiones_cm', 'metodo_bombeo', 'energia_requerida',
        'tipo_sistema', 'pais_origen', 'rating_promedio',
        'reviews_texto', 'notas_investigacion'
      ],
      fecha_extraccion: new Date().toISOString(),
      metodo_extraccion: 'manual-prefill'
    }
  };
}

// Recibe un producto manual completo (POST) y lo valida
function validateManualProduct(data) {
  const required = ['nombre', 'url_fuente', 'precio_cop', 'material_principal', 'metodo_bombeo'];
  const missing = required.filter(k => !data[k]);
  return {
    valid: missing.length === 0,
    missing: missing,
    normalized: {
      id: data.id || `manual-${data.url_fuente.split('/').filter(Boolean).pop() || Date.now()}`,
      ...data,
      fecha_extraccion: data.fecha_extraccion || new Date().toISOString(),
      metodo_extraccion: 'manual-usuario'
    }
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, url } = req.query;

  try {
    if (action === 'prefill' && url) {
      const result = await prefill(url);
      return res.status(result.success ? 200 : 400).json(result);
    }

    if (action === 'validate' && req.method === 'POST') {
      const body = req.body || {};
      const result = validateManualProduct(body);
      return res.status(result.valid ? 200 : 400).json(result);
    }

    return res.status(400).json({
      success: false,
      error: 'Usa ?action=prefill&url=... o POST ?action=validate con el JSON del producto'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
