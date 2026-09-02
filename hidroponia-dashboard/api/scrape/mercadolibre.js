// api/scrape/mercadolibre.js
// Scraper de MercadoLibre Colombia.
// Estrategia dual:
//   1) API oficial pública (https://api.mercadolibre.com) - NO requiere token para búsquedas básicas
//   2) Fallback HTML con cheerio si la API falla
//
// Limitación conocida: MercadoLibre tiene Datadome que puede bloquear. La API oficial
// es mucho más estable y devuelve JSON estructurado.

const cheerio = require('cheerio');

const SITE_ID = 'MCO'; // MercadoLibre Colombia
const API_BASE = `https://api.mercadolibre.com/sites/${SITE_ID}`;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ============================================================
// Búsqueda de productos por query
// ============================================================
async function search(query, limit = 20) {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': pickUserAgent(),
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return (data.results || []).map(normalizeFromApi);
  } catch (err) {
    console.error('[ML search] API falló, intentando HTML:', err.message);
    return await searchHtml(query, limit);
  }
}

function normalizeFromApi(item) {
  return {
    id: `ml-${item.id}`,
    nombre: item.title,
    marca: item.attributes?.find(a => a.id === 'BRAND')?.value_name || 'Genérica',
    fuente: 'MercadoLibre CO',
    url_fuente: item.permalink,
    thumbnail: item.thumbnail?.replace('http://', 'https://'),
    precio_cop: item.price,
    moneda: 'COP',
    disponible: item.available_quantity > 0,
    envio_gratis: item.shipping?.free_shipping || false,
    condicion: item.condition, // "new" | "used"
    ventas_totales: item.sold_quantity,
    rating_promedio: null, // La API de búsqueda no incluye rating, requiere item detail
    numero_reviews: null,
    categoria_ml: item.category_id,
    fecha_extraccion: new Date().toISOString(),
    metodo_extraccion: 'api-oficial'
  };
}

// ============================================================
// Detalle de producto + reviews
// ============================================================
async function getProduct(itemId) {
  const url = `${API_BASE}/items/${itemId}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': pickUserAgent() }
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const item = await res.json();

    // Reviews (separado, requiere autenticación para algunos mercados)
    const reviews = await getReviews(itemId).catch(() => []);

    return {
      ...normalizeFromApi(item),
      descripcion: stripHtml(item.description?.plain_text || item.description || ''),
      atributos: (item.attributes || []).map(a => ({
        id: a.id,
        nombre: a.name,
        valor: a.value_name
      })),
      imagenes: (item.pictures || []).map(p => p.url?.replace('http://', 'https://')),
      precio_original: item.original_price || null,
      stock: item.available_quantity,
      reviews: reviews,
      fecha_extraccion: new Date().toISOString(),
      metodo_extraccion: 'api-oficial-detalle'
    };
  } catch (err) {
    console.error('[ML getProduct] API falló:', err.message);
    return null;
  }
}

async function getReviews(itemId) {
  // La API de reviews MCO es: /items/{id}/reviews?access_token=...
  // Sin token, retorna 403. Devolvemos array vacío y marcamos el flag.
  try {
    const res = await fetch(`${API_BASE}/items/${itemId}/reviews`, {
      headers: { 'User-Agent': pickUserAgent() }
    });
    if (res.status === 403) {
      return { error: 'requiere-token', reviews: [] };
    }
    if (!res.ok) return [];
    const data = await res.json();
    return (data.reviews || []).map(r => ({
      rating: r.rate,
      titulo: r.title,
      comentario: r.comment,
      fecha: r.date_created,
      likes: r.likes
    }));
  } catch {
    return [];
  }
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ============================================================
// Fallback: HTML scraping del listado
// ============================================================
async function searchHtml(query, limit = 20) {
  const url = `https://listado.mercadolibre.com.co/${encodeURIComponent(query.replace(/\s+/g, '-'))}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': pickUserAgent(),
        'Accept-Language': 'es-CO,es;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTML ${res.status}`);
    const html = await res.text();

    // Detección de Datadome block
    if (html.includes('datadome') || html.includes('Access Denied')) {
      throw new Error('Bloqueado por Datadome');
    }

    const $ = cheerio.load(html);
    const items = [];

    $('.ui-search-layout__item').each((i, el) => {
      if (items.length >= limit) return false;
      const $el = $(el);

      const titulo = $el.find('h3.ui-search-item__title').text().trim();
      const precioTxt = $el.find('span.andes-money-amount__fraction').first().text().trim();
      const precio = parseInt(precioTxt.replace(/\D/g, ''), 10) || null;
      const link = $el.find('a.ui-search-link').attr('href') || '';
      const itemId = link.match(/MCO-(\d+)/)?.[1] || `unknown-${i}`;
      const thumbnail = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src');

      if (titulo && precio) {
        items.push({
          id: `ml-${itemId}`,
          nombre: titulo,
          fuente: 'MercadoLibre CO',
          url_fuente: link,
          thumbnail: thumbnail?.replace('http://', 'https://'),
          precio_cop: precio,
          moneda: 'COP',
          fecha_extraccion: new Date().toISOString(),
          metodo_extraccion: 'html-fallback'
        });
      }
    });

    return items;
  } catch (err) {
    console.error('[ML searchHtml] falló:', err.message);
    return [];
  }
}

// ============================================================
// Handler de Vercel Function
// ============================================================
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, q, id } = req.query;

  try {
    if (action === 'search' && q) {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const results = await search(q, limit);
      return res.status(200).json({
        success: true,
        count: results.length,
        productos: results,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'product' && id) {
      const producto = await getProduct(id);
      if (!producto) {
        return res.status(404).json({ success: false, error: 'Producto no encontrado' });
      }
      return res.status(200).json({
        success: true,
        producto: producto
      });
    }

    return res.status(400).json({
      success: false,
      error: 'Parámetros inválidos. Usa ?action=search&q=tu-busqueda o ?action=product&id=MLM123'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
