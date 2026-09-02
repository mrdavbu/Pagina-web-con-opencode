// api/scrape/woo-generic.js
// Scraper genérico para sitios WordPress + WooCommerce.
// Funciona con: Pevgrow, INDULIFE, y otros growshops CO que usen WooCommerce.
//
// Parámetros:
//   - domain: ejemplo "pevgrow.com" o "indulife.com"
//   - selectors (opcional): override de selectores si la tienda usa tema custom

const cheerio = require('cheerio');

const DEFAULT_SELECTORS = {
  listItem: 'li.product, .product',
  title: 'h2.woocommerce-loop-product__title, h2.product-title, .product-title',
  link: 'a.woocommerce-LoopProduct-link, a.product-link, a[href*="/product"]',
  price: 'span.price, .price',
  image: 'img',
  detailTitle: 'h1.product_title, h1',
  detailPrice: 'p.price, .price',
  detailDesc: '.woocommerce-product-details__short-description, #tab-description, .description',
  detailSku: '.sku',
  detailStock: '.stock',
  detailAttrTable: '.woocommerce-product-attributes tr, table.shop_attributes tr'
};

function getSelectors(custom) {
  return { ...DEFAULT_SELECTORS, ...(custom || {}) };
}

async function fetchHtml(url, userAgent) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
  const cleaned = text.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num);
}

function extractCard($, $el, source) {
  const $s = getSelectors();
  const titulo = $el.find($s.title).first().text().trim();
  const link = $el.find($s.link).first().attr('href');
  const precioTxt = $el.find($s.price).first().text().trim();
  const precio = parsePrice(precioTxt);
  const $img = $el.find($s.image).first();
  const thumbnail = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src');

  if (!titulo || !link) return null;
  return {
    id: `${source}-${link.split('/').filter(Boolean).pop()}`,
    nombre: titulo,
    fuente: source,
    url_fuente: link,
    thumbnail: thumbnail?.replace('http://', 'https://'),
    precio_cop: precio,
    precio_texto_original: precioTxt,
    moneda: 'COP',
    fecha_extraccion: new Date().toISOString(),
    metodo_extraccion: 'html-woo-generic'
  };
}

async function searchWoo(domain, query, limit, source) {
  const url = `https://${domain}/?s=${encodeURIComponent(query)}&post_type=product`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const $s = getSelectors();
  const items = [];

  $($s.listItem).each((i, el) => {
    if (items.length >= limit) return false;
    const p = extractCard($, $(el), source);
    if (p) items.push(p);
  });

  return items;
}

async function getCatalogWoo(domain, page, source) {
  const url = `https://${domain}/page/${page}/?post_type=product`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const $s = getSelectors();
  const items = [];

  $($s.listItem).each((i, el) => {
    const p = extractCard($, $(el), source);
    if (p) items.push(p);
  });

  return items;
}

async function getProductWoo(url, source) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const $s = getSelectors();

  const titulo = $($s.detailTitle).first().text().trim();
  const precioTxt = $($s.detailPrice).first().text().trim();
  const precio = parsePrice(precioTxt);
  const sku = $($s.detailSku).first().text().trim() || null;
  const stockTxt = $($s.detailStock).first().text().trim();
  const stock = stockTxt.toLowerCase().includes('agotado') ? 0 : (parseInt(stockTxt.match(/\d+/)?.[0]) || null);
  const descripcion = $($s.detailDesc).first().text().trim();

  const imagenes = [];
  $('img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && src.includes('uploads') && !imagenes.includes(src)) {
      imagenes.push(src.replace('http://', 'https://'));
    }
  });

  const atributos = {};
  $($s.detailAttrTable).each((i, el) => {
    const label = $(el).find('th').text().trim();
    const value = $(el).find('td').text().trim();
    if (label && value) atributos[label] = value;
  });

  return {
    id: `${source}-${sku || url.split('/').filter(Boolean).pop()}`,
    nombre: titulo,
    fuente: source,
    url_fuente: url,
    precio_cop: precio,
    precio_texto_original: precioTxt,
    moneda: 'COP',
    sku: sku,
    stock: stock,
    descripcion: descripcion,
    atributos_tecnicos: atributos,
    imagenes: imagenes,
    fecha_extraccion: new Date().toISOString(),
    metodo_extraccion: 'html-woo-detalle'
  };
}

// ============================================================
// Handler
// ============================================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, domain, source, q, url, page } = req.query;

  if (!domain || !source) {
    return res.status(400).json({
      success: false,
      error: 'Faltan parámetros. Requiere: domain=tu-dominio.com y source=Nombre Fuente'
    });
  }

  try {
    if (action === 'search' && q) {
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);
      const productos = await searchWoo(domain, q, limit, source);
      return res.status(200).json({
        success: true,
        count: productos.length,
        productos,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'catalog') {
      const p = Math.max(1, parseInt(page) || 1);
      const productos = await getCatalogWoo(domain, p, source);
      return res.status(200).json({
        success: true,
        page: p,
        count: productos.length,
        productos
      });
    }

    if (action === 'product' && url) {
      const producto = await getProductWoo(url, source);
      return res.status(200).json({ success: true, producto });
    }

    return res.status(400).json({
      success: false,
      error: 'Usa ?action=search&q=X, ?action=catalog&page=1, o ?action=product&url=...'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
