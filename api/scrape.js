module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url;
  const type = req.query.type || 'product';
  if (!url) return res.status(400).json({ error: 'url query param required' });

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) return res.status(502).json({ error: `Upstream ${resp.status}` });
    const html = await resp.text();

    let data;
    if (type === 'design') {
      data = extractDesign(html, url);
    } else {
      data = extractProduct(html, url);
    }
    data.checkedAt = new Date().toISOString();
    data.url = url;
    data.source = detectSource(url);
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Scrape failed', hint: 'No se pudo acceder a la página. Ingresa los datos manualmente.' });
  }
};

function detectSource(url) {
  if (url.includes('red-dot.org') || url.includes('reddot')) return 'Red Dot';
  if (url.includes('ifdesign.com') || url.includes('if-design')) return 'iF Design';
  if (url.includes('behance.net') || url.includes('adobe.com')) return 'Behance';
  if (url.includes('dribbble.com')) return 'Dribbble';
  if (url.includes('mercadolibre')) return 'Mercado Libre Colombia';
  if (url.includes('hidroponiaindustrial')) return 'Hidroponía Industrial';
  if (url.includes('a' + 'designaward')) return "A'Design Award";
  try { return new URL(url).hostname.replace('www.',''); } catch { return ''; }
}

function extractDesign(html, url) {
  const r = { name: null, author: null, desc: null, image: null, tags: [], year: null, biblio: null };

  // Name
  r.name = og(html,'title') || h1(html) || title(html);

  // Description
  r.desc = og(html,'description') || meta(html,'description') || '';
  r.desc = clean(stripHtml(r.desc)).substring(0, 600);

  // Image
  r.image = og(html,'image') || '';

  // Author / designer
  const authorPatterns = [
    /(?:design(?:ed)?\s+(?:by|lead|team)[:\s]+)([^<\n]{3,60})/i,
    /(?:author|studio|designer|company)[:\s]+([^\n<]{3,60})/i,
    /(?:credit|creditos?|dise[nñ]o)[:\s]+([^\n<]{3,60})/i,
  ];
  for (const p of authorPatterns) {
    const m = html.match(p);
    if (m) { r.author = clean(m[1]); break; }
  }

  // Year
  const yearM = html.match(/(?:published|publicad[oa]|year|a[nñ]o)[:\s]*(\d{4})/i) || html.match(/(20[12]\d)/);
  if (yearM) r.year = yearM[1];

  // Tags from keywords / categories
  const tagM = html.match(/(?:category|categor[ií]a|tag|keyword)[:\s]*([^<\n]{5,100})/i);
  if (tagM) r.tags = tagM[1].split(/[,|]/).map(t=>clean(t)).filter(t=>t.length>1 && t.length<30).slice(0,6);

  // Award detection
  if (url.includes('red-dot') || html.match(/red\s*dot/i)) r.tags.push('Red Dot');
  if (url.includes('ifdesign') || html.match(/iF\s*Design/i)) r.tags.push('iF Design');
  if (html.match(/a['']Design\s*Award/i)) r.tags.push("A'Design");

  // Bibliography
  const bibPatterns = [
    /(?:reference|referencia|bibliography|bibliograf[ií]a|source|fuente)[:\s]*([^\n]{10,200})/i,
  ];
  for (const p of bibPatterns) {
    const m = html.match(p);
    if (m) { r.biblio = clean(m[1]).substring(0, 300); break; }
  }
  if (!r.biblio && r.author) r.biblio = r.author + (r.year ? ' (' + r.year + ')' : '') + '. ' + (r.name||'') + '.';

  // Translate if mostly English
  r.desc = autoTranslate(r.desc);
  if (r.biblio) r.biblio = autoTranslate(r.biblio);

  return r;
}

function extractProduct(html, url) {
  const r = {
    name: null, price: null, priceLabel: null, material: null,
    capacity: null, dimensions: null, pumping: null, pumpType: null,
    origin: null, automation: null, rating: null, reviewCount: null,
    reviewQuote: null, description: null
  };

  // JSON-LD
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdBlocks) {
    try {
      const ld = JSON.parse(m[1]);
      const graphs = ld['@graph'] || [ld];
      for (const item of graphs) {
        if (item['@type'] === 'Product' || item['@type'] === 'IndividualProduct') {
          if (item.name) r.name = clean(item.name);
          if (item.description) r.description = clean(stripHtml(item.description)).substring(0, 500);
          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer.price) { r.price = parseNum(offer.price); r.priceLabel = fmtCOP(r.price); }
          }
          if (item.aggregateRating) {
            r.rating = item.aggregateRating.ratingValue || null;
            r.reviewCount = parseInt(item.aggregateRating.reviewCount) || 0;
          }
        }
      }
    } catch {}
  }

  // Meta tags
  if (!r.name) r.name = og(html,'title') || h1(html) || title(html);
  if (!r.description) r.description = clean(stripHtml(og(html,'description') || meta(html,'description') || '')).substring(0, 500);

  const specText = (r.description || '') + ' ' + html.substring(0, 20000);

  // Specs
  const matM = specText.match(/material[:\s]*([^\n.]{3,80})/i);
  if (matM) r.material = clean(matM[1]).replace(/\s*[-–]\s*$/, '');
  const capM = specText.match(/(?:cantidad|capacidad|plantas?|c[aá]psulas?|macetas?|sitios?)[^:\n]*:\s*([^\n.]{2,60})/i) || specText.match(/(\d+)\s*(?:plantas?|c[aá]psulas?|macetas?|sitios?)/i);
  if (capM) r.capacity = clean(capM[1] || capM[0]);
  const dimM = specText.match(/(?:tamaño|dimensiones?|medidas?|tamano)[^:\n]*(?:del producto|exterior)?[:\s]*([^\n.]{4,80})/i) || specText.match(/(\d{2,4}[\s*×xX]\d{2,4}[\s*×xX]\d{2,4}\s*(?:mm|cm|m)?(?:\s*[\(\)].*?)?)/i);
  if (dimM) r.dimensions = clean(dimM[1] || dimM[0]);
  const pumpM = specText.match(/(?:consumo|bomba|bombeo|riego|power|watt)[^:\n]*:\s*([^\n.]{3,100})/i) || specText.match(/(\d+[\s]*[-–]\d+\s*[vV]\s*[;,]\s*\d+\s*[wW])/i);
  if (pumpM) r.pumping = clean(pumpM[1] || pumpM[0]);
  if (r.pumping) {
    const pt = r.pumping.toLowerCase();
    if (pt.includes('eléctri') || pt.includes('electric') || pt.includes('bomb') || pt.includes('w') || pt.includes('v')) r.pumpType = 'Eléctrico';
    else if (pt.includes('gravedad') || pt.includes('gravity')) r.pumpType = 'Gravedad';
    else if (pt.includes('cerám') || pt.includes('poros')) r.pumpType = 'Cerámico';
    else if (pt.includes('manual')) r.pumpType = 'Manual';
  }

  // ML specific
  if (url.includes('mercadolibre')) {
    const pm = html.match(/andes-money-amount__fraction[^>]*>([^<]+)/);
    if (pm && !r.price) { r.price = parseNum(pm[1]); r.priceLabel = fmtCOP(r.price); }
    const tm2 = html.match(/<h1[^>]*class="ui-pdp-title"[^>]*>([^<]+)<\/h1>/);
    if (tm2 && !r.name) r.name = clean(tm2[1]);
  }

  // WooCommerce
  if (url.includes('hidroponiaindustrial') || html.includes('woocommerce')) {
    const pm2 = html.match(/<span class="woocommerce-Price-amount[^"]*"[^>]*>[^<]*<bdi>([^<]+)/);
    if (pm2 && !r.price) { r.price = parseNum(pm2[1]); r.priceLabel = fmtCOP(r.price); }
  }

  // Generic price fallback
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

// --- Translation helpers ---
const dict = {
  'design':'diseño','designer':'diseñador','designed by':'diseñado por','company':'empresa',
  'concept':'concepto','award':'premio','winner':'ganador','product design':'diseño de producto',
  'innovation':'innovación','sustainable':'sustentable','sustainability':'sostenibilidad',
  'vertical farming':'agricultura vertical','hydroponic':'hidropónico','hydroponics':'hidroponía',
  'aeroponic':'aeropónico','aeroponics':'aeroponía','indoor':'interior','indoor farming':'agricultura interior',
  'urban farming':'agricultura urbana','modular':'modular','prototype':'prototipo',
  'published':'publicado','research':'investigación','study':'estudio','development':'desarrollo',
  'smart':'inteligente','automated':'automatizado','automation':'automatización',
  'technology':'tecnología','functional':'funcional','functionality':'funcionalidad',
  'materials':'materiales','structure':'estructura','system':'sistema','garden':'jardín',
  'plant':'planta','plants':'plantas','growth':'crecimiento','crop':'cultivo',
  'water':'agua','nutrients':'nutrientes','light':'luz','energy':'energía',
  'space':'espacio','compact':'compacto','efficiency':'eficiencia','efficient':'eficiente',
  'highrise':'rascacielos','tower':'torre','building':'edificio','apartment':'apartamento',
  'living':'vivienda','housing':'vivienda','residential':'residencial',
  'food':'alimento','food production':'producción de alimentos','fresh':'fresco',
  'climate':'clima','temperature':'temperatura','humidity':'humedad',
  'app':'aplicación','mobile':'móvil','camera':'cámara','sensor':'sensor','wifi':'WiFi',
  'aluminum':'aluminio','plastic':'plástico','stainless steel':'acero inoxidable','concrete':'concreto','glass':'vidrio','bamboo':'bambú','wood':'madera',
  'by the jury':'por el jurado','statement':'declaración','the jury':'el jurado',
  'combines':'combina','features':'características','includes':'incluye',
};
function autoTranslate(text) {
  if (!text) return text;
  const words = text.split(/\s+/);
  const engCount = words.filter(w => /^[a-z]+$/.test(w) && w.length > 3 && !dict[w]).length;
  const ratio = engCount / Math.max(words.length, 1);
  if (ratio < 0.4) return text;
  let result = text;
  for (const [en, es] of Object.entries(dict)) {
    const re = new RegExp('\\b' + en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    result = result.replace(re, es);
  }
  return result;
}

// --- HTML extraction helpers ---
function og(html, prop) {
  const m = html.match(new RegExp('<meta[^>]*property="og:' + prop + '"[^>]*content="([^"]+)"', 'i'))
    || html.match(new RegExp('<meta[^>]*content="([^"]+)"[^>]*property="og:' + prop + '"', 'i'));
  return m ? clean(m[1]) : null;
}
function meta(html, name) {
  const m = html.match(new RegExp('<meta[^>]*name="' + name + '"[^>]*content="([^"]+)"', 'i'))
    || html.match(new RegExp('<meta[^>]*content="([^"]+)"[^>]*name="' + name + '"', 'i'));
  return m ? clean(m[1]) : null;
}
function h1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? clean(stripHtml(m[1])) : null;
}
function title(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(stripHtml(m[1])).replace(/ [-–|].*$/, '') : null;
}
function clean(s) { return (s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(); }
function stripHtml(s) { return (s||'').replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim(); }
function parseNum(s) { return parseInt(String(s).replace(/[^0-9]/g, ''), 10) || null; }
function fmtCOP(n) { return n ? '$' + n.toLocaleString('es-CO') : null; }
