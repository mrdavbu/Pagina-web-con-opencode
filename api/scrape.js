module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url query param required' });

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return res.status(502).json({ error: `Upstream ${resp.status}` });
    const html = await resp.text();
    const data = extract(html, url);
    data.checkedAt = new Date().toISOString();
    data.url = url;
    data.store = detectStore(url);
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Scrape failed', hint: 'No se pudo acceder a la página. Puedes ingresar los datos manualmente.' });
  }
};

function detectStore(url) {
  if (url.includes('mercadolibre') || url.includes('mercadolibre.com')) return 'Mercado Libre Colombia';
  if (url.includes('hidroponiaindustrial')) return 'Hidroponía Industrial';
  if (url.includes('linio') || url.includes('falabella')) return 'Linio/Falabella';
  if (url.includes('amazon')) return 'Amazon';
  if (url.includes('rappi')) return 'Rappi';
  try { return new URL(url).hostname; } catch { return ''; }
}

function extract(html, url) {
  const r = {
    name: null, price: null, priceLabel: null, material: null,
    capacity: null, dimensions: null, pumping: null, pumpType: null,
    origin: null, automation: null, rating: null, reviewCount: null,
    reviewQuote: null, description: null
  };

  // --- JSON-LD structured data (WooCommerce, Shopify, etc.) ---
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdBlocks) {
    try {
      const ld = JSON.parse(m[1]);
      if (ld['@graph']) {
        for (const item of ld['@graph']) {
          if (item['@type'] === 'Product' || item['@type'] === 'IndividualProduct') {
            if (item.name) r.name = clean(item.name);
            if (item.description) r.description = clean(stripHtml(item.description)).substring(0, 500);
            if (item.offers) {
              const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offer.price) { r.price = parseNum(offer.price); r.priceLabel = fmtCOP(r.price); }
              if (offer.priceCurrency) r.currency = offer.priceCurrency;
            }
            if (item.aggregateRating) {
              r.rating = item.aggregateRating.ratingValue || null;
              r.reviewCount = parseInt(item.aggregateRating.reviewCount) || 0;
            }
          }
          if (item['@type'] === 'ItemList' && item.itemListElement) {
            for (const prod of item.itemListElement) {
              if (prod.item && prod.item.name) r.name = clean(prod.item.name);
            }
          }
        }
      }
      if (ld['@type'] === 'Product') {
        if (ld.name) r.name = clean(ld.name);
        if (ld.description) r.description = clean(stripHtml(ld.description)).substring(0, 500);
        if (ld.offers) {
          const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
          if (offer.price) { r.price = parseNum(offer.price); r.priceLabel = fmtCOP(r.price); }
        }
        if (ld.aggregateRating) {
          r.rating = ld.aggregateRating.ratingValue || null;
          r.reviewCount = parseInt(ld.aggregateRating.reviewCount) || 0;
        }
      }
    } catch {}
  }

  // --- Meta tags ---
  if (!r.name) {
    const tm = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (tm) r.name = clean(tm[1]).replace(/ -$/, '');
  }
  if (!r.description) {
    const dm = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) || html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    if (dm) r.description = clean(stripHtml(dm[1])).substring(0, 500);
  }

  // --- Extract specs from description text ---
  const specText = (r.description || '') + ' ' + html.substring(0, 20000);

  // Material
  const matM = specText.match(/material[:\s]*([^\n.]{3,80})/i);
  if (matM) r.material = clean(matM[1]).replace(/\s*[-–]\s*$/, '');

  // Capacity / plantas
  const capM = specText.match(/(?:cantidad|capacidad|plantas?|cápsulas?|macetas?|sitios?)[^:\n]*:\s*([^\n.]{2,60})/i)
    || specText.match(/(\d+)\s*(?:plantas?|cápsulas?|macetas?|sitios?)/i);
  if (capM) r.capacity = clean(capM[1] || capM[0]);

  // Dimensions
  const dimM = specText.match(/(?:tamaño|dimensiones?|medidas?|tamano)[^:\n]*(?:del producto|exterior)?[:\s]*([^\n.]{4,80})/i)
    || specText.match(/(\d{2,4}[\s*×xX]\d{2,4}[\s*×xX]\d{2,4}\s*(?:mm|cm|m)?(?:\s*[\(\)].*?)?)/i);
  if (dimM) r.dimensions = clean(dimM[1] || dimM[0]);

  // Pumping / energy
  const pumpM = specText.match(/(?:consumo|bomba|bombeo|riego|power|watt)[^:\n]*:\s*([^\n.]{3,100})/i)
    || specText.match(/(\d+[\s]*[-–]\d+\s*[vV]\s*[;,]\s*\d+\s*[wW])/i);
  if (pumpM) r.pumping = clean(pumpM[1] || pumpM[0]);

  // Pump type detection
  if (r.pumping) {
    const pt = r.pumping.toLowerCase();
    if (pt.includes('eléctri') || pt.includes('electric') || pt.includes('bomb') || pt.includes('w') || pt.includes('v'))
      r.pumpType = 'Eléctrico';
    else if (pt.includes('gravedad') || pt.includes('gravity'))
      r.pumpType = 'Gravedad';
    else if (pt.includes('cerám') || pt.includes('poros'))
      r.pumpType = 'Cerámico';
    else if (pt.includes('manual'))
      r.pumpType = 'Manual';
  }

  // Weight
  const weightM = specText.match(/(?:peso|weight)[^:\n]*:\s*([^\n.]{2,30})/i);
  if (weightM) r.dimensions = (r.dimensions ? r.dimensions + ' · ' : '') + clean(weightM[0]);

  // Tank capacity
  const tankM = specText.match(/(?:tanque|tank)[^:\n]*:\s*([^\n.]{2,60})/i);
  if (tankM) r.dimensions = (r.dimensions ? r.dimensions + ' · ' : '') + clean(tankM[0]);

  // --- Mercado Libre specific ---
  if (url.includes('mercadolibre')) {
    // Price from ML fraction
    const pm = html.match(/andes-money-amount__fraction[^>]*>([^<]+)/);
    if (pm && !r.price) { r.price = parseNum(pm[1]); r.priceLabel = fmtCOP(r.price); }
    // Rating
    const rm = html.match(/ui-pdp-review__rating[^>]*>([0-9.,]+)/);
    if (rm) r.rating = parseFloat(rm[1].replace(',', '.'));
    // Reviews
    const cm = html.match(/ui-pdp-review__amount[^>]*>\s*(\d+)/) || html.match(/(\d+)\s*opiniones/);
    if (cm) r.reviewCount = parseInt(cm[1]);
    // Title from page
    const tm2 = html.match(/<h1[^>]*class="ui-pdp-title"[^>]*>([^<]+)<\/h1>/);
    if (tm2 && !r.name) r.name = clean(tm2[1]);
    // Spec table
    const specs = [...html.matchAll(/ui-pdp-specs__column__label[^>]*>([^<]+)<.*?ui-pdp-specs__column__value[^>]*>([^<]+)</gs)];
    for (const s of specs) {
      const key = s[1].toLowerCase(), val = clean(s[2]);
      if (key.includes('material')) r.material = val;
      if (key.includes('capacidad') || key.includes('plantas')) r.capacity = val;
      if (key.includes('dimens') || key.includes('tamaño') || key.includes('medida')) r.dimensions = val;
    }
    // Description
    const descM = html.match(/ui-pdp-description__content[^>]*>([\s\S]*?)<\/div>/);
    if (descM && !r.description) r.description = clean(stripHtml(descM[1])).substring(0, 500);
  }

  // --- WooCommerce (Hidroponía Industrial, etc.) ---
  if (url.includes('hidroponiaindustrial') || html.includes('woocommerce')) {
    // Price
    const pm2 = html.match(/<span class="woocommerce-Price-amount[^"]*"[^>]*>[^<]*<bdi>([^<]+)/);
    if (pm2 && !r.price) { r.price = parseNum(pm2[1]); r.priceLabel = fmtCOP(r.price); }
    // Product description from page
    const descM2 = html.match(/woocommerce-product-details__short-description[^>]*>([\s\S]*?)<\/div>/)
      || html.match(/<div[^>]*class="[^"]*product-short-description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (descM2) {
      const raw = clean(stripHtml(descM2[1]));
      if (raw.length > (r.description||'').length) r.description = raw.substring(0, 500);
    }
    // Re-extract specs from the better description
    const fullSpec = (r.description || '') + ' ' + specText;
    if (!r.material) {
      const m2 = fullSpec.match(/material[:\s]*([^\n.-]{3,80})/i);
      if (m2) r.material = clean(m2[1]).replace(/\s*[-–]\s*$/, '');
    }
    if (!r.capacity) {
      const c2 = fullSpec.match(/cantidad de plantas[:\s]*(\d+)/i) || fullSpec.match(/(\d+)\s*plantas/i);
      if (c2) r.capacity = (c2[1] || c2[0]) + ' plantas';
    }
    if (!r.dimensions) {
      const d2 = fullSpec.match(/(?:tamaño del producto|medidas)[^:\n]*[:\s]*([^\n.]{4,60})/i)
        || fullSpec.match(/(\d{2,4}[″*"xX×]\d{2,4}[″*"xX×]\d{2,4}\s*(?:mm|cm|m)?)/i);
      if (d2) r.dimensions = clean(d2[1] || d2[0]);
    }
    if (!r.pumping) {
      const p2 = fullSpec.match(/consumo de bomba[:\s]*([^\n.]{3,60})/i)
        || fullSpec.match(/(110[-–]\d+\s*[vV]\s*[;,]\s*\d+\s*[wW])/i);
      if (p2) r.pumping = clean(p2[1] || p2[0]);
    }
    if (r.pumping && !r.pumpType) r.pumpType = 'Eléctrico';
    // Origin detection
    if (url.includes('hidroponiaindustrial')) r.origin = 'Nacional (Cundinamarca)';
  }

  // --- Generic fallbacks ---
  if (!r.name) {
    const tm3 = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (tm3) r.name = clean(tm3[1]).replace(/ [-–|].*$/, '');
  }
  if (!r.price) {
    const gp = html.match(/\$\s*([\d.,]+)/);
    if (gp) { r.price = parseNum(gp[1]); r.priceLabel = fmtCOP(r.price); }
  }
  if (!r.rating) {
    const gr = html.match(/(?:rating|estrellas|stars|calificacion)[^>]*>.*?([0-9.,]+)/i);
    if (gr) r.rating = parseFloat(gr[1].replace(',', '.'));
  }
  if (!r.reviewCount) {
    const gc = html.match(/(\d+)\s*(?:opiniones|reviews|reseñas|calificaciones)/i);
    if (gc) r.reviewCount = parseInt(gc[1]);
  }

  return r;
}

function clean(s) { return (s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(); }
function stripHtml(s) { return (s||'').replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim(); }
function parseNum(s) { return parseInt(String(s).replace(/[^0-9]/g, ''), 10) || null; }
function fmtCOP(n) { return n ? '$' + n.toLocaleString('es-CO') : null; }
