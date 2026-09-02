// api/scrape/indulife.js
// Scraper para INDULIFE (ex El Aeropónico) - growshop colombiano.
// Tecnología: WordPress + WooCommerce.
// Estrategia:
//   1) Búsqueda vía query string estándar WP (?s=)
//   2) Detalle de producto individual
//   3) Catálogo general de la tienda
//
// Si los selectores cambian, el sistema degrada gracefully y devuelve lo que pudo.

const cheerio = require('cheerio');

const BASE = 'https://indulife.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'es-CO,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  return await res.text();
}

function parsePrice(text) {
  if (!text) return null;
  // Formato COP: $ 250.000 o 250000
  const cleaned = text.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : null;
}

function extractProductFromCard($, $el) {
  const titulo = $el.find('h2.woocommerce-loop-product__title, h2.product-title, h3').first().text().trim();
  const link = $el.find('a.woocommerce-LoopProduct-link, a.product-link').first().attr('href');
  const precioTxt = $el.find('span.price, .price').first().text().trim();
  const precio = parsePrice(precioTxt);
  const img = $el.find('img').first();
  const thumbnail = img.attr('data-src') || img.attr('src');
  const slug = link ? link.split('/').filter(Boolean).pop() : null;

  if (!titulo || !link) return null;
  return {
    id: `indulife-${slug || titulo.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}`,
    nombre: titulo,
    fuente: 'INDULIFE',
    url_fuente: link,
    thumbnail: thumbnail?.replace('http://', 'https://'),
    precio_cop: precio,
    moneda: 'COP',
    fecha_extraccion: new Date().toISOString(),
    metodo_extraccion: 'html-wp'
  };
}

// ============================================================
// Búsqueda de productos
// ============================================================
async function search(query, limit = 20) {
  const url = `${BASE}/?s=${encodeURIComponent(query)}&post_type=product`;
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const items = [];

    // Selector principal WooCommerce
    $('li.product').each((i, el) => {
      if (items.length >= limit) return false;
      const p = extractProductFromCard($, $(el));
      if (p) items.push(p);
    });

    // Fallback: cualquier contenedor con título de producto
    if (items.length === 0) {
      $('.product, .woocommerce-product').each((i, el) => {
        if (items.length >= limit) return false;
        const p = extractProductFromCard($, $(el));
        if (p) items.push(p);
      });
    }

    return items;
  } catch (err) {
    console.error('[INDULIFE search]', err.message);
    return [];
  }
}

// ============================================================
// Catálogo completo (paginación)
// ============================================================
async function getCatalog(page = 1, perPage = 24) {
  const url = `${BASE}/tienda/page/${page}/?per_page=${perPage}`;
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const items = [];

    $('li.product').each((i, el) => {
      const p = extractProductFromCard($, $(el));
      if (p) items.push(p);
    });

    return items;
  } catch (err) {
    console.error('[INDULIFE catalog]', err.message);
    return [];
  }
}

// ============================================================
// Detalle de producto
// ============================================================
async function getProduct(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const titulo = $('h1.product_title, h1').first().text().trim();
    const precioTxt = $('p.price, .price').first().text().trim();
    const precio = parsePrice(precioTxt);
    const sku = $('.sku').text().trim() || null;
    const stockTxt = $('.stock').text().trim();
    const stock = stockTxt.includes('Agotado') ? 0 : (parseInt(stockTxt.match(/\d+/)?.[0]) || null);
    const descripcion = $('.woocommerce-product-details__short-description, #tab-description').text().trim();
    const imagenes = [];
    $('img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src.includes('uploads') && !imagenes.includes(src)) {
        imagenes.push(src.replace('http://', 'https://'));
      }
    });

    // Atributos / categorías
    const categorias = [];
    $('.posted_in a, .product_meta a[href*="product_cat"]').each((i, el) => {
      categorias.push($(el).text().trim());
    });

    // Tabla de atributos técnicos
    const atributos = {};
    $('.woocommerce-product-attributes tr, table.shop_attributes tr').each((i, el) => {
      const label = $(el).find('th').text().trim();
      const value = $(el).find('td').text().trim();
      if (label && value) atributos[label] = value;
    });

    return {
      id: `indulife-${sku || titulo.toLowerCase().replace(/\s+/g, '-').slice(0, 50)}`,
      nombre: titulo,
      fuente: 'INDULIFE',
      url_fuente: url,
      precio_cop: precio,
      moneda: 'COP',
      sku: sku,
      stock: stock,
      descripcion: descripcion,
      categorias: categorias,
      atributos_tecnicos: atributos,
      imagenes: imagenes,
      fecha_extraccion: new Date().toISOString(),
      metodo_extraccion: 'html-detalle'
    };
  } catch (err) {
    console.error('[INDULIFE getProduct]', err.message);
    return null;
  }
}

// ============================================================
// Handler de Vercel Function
// ============================================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, q, url, page } = req.query;

  try {
    if (action === 'search' && q) {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const productos = await search(q, limit);
      return res.status(200).json({
        success: true,
        count: productos.length,
        productos: productos,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'catalog') {
      const p = Math.max(1, parseInt(page) || 1);
      const productos = await getCatalog(p, 24);
      return res.status(200).json({
        success: true,
        page: p,
        count: productos.length,
        productos: productos
      });
    }

    if (action === 'product' && url) {
      const producto = await getProduct(url);
      if (!producto) return res.status(404).json({ success: false, error: 'No se pudo extraer' });
      return res.status(200).json({ success: true, producto: producto });
    }

    return res.status(400).json({
      success: false,
      error: 'Usa ?action=search&q=X, ?action=catalog, o ?action=product&url=...'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
