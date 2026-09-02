// api/products.js
// Endpoint unificado para la bitácora:
//   - GET  /api/products        -> lista todos los productos del catálogo curado
//   - GET  /api/products?fuente=X  -> filtra por fuente
//   - GET  /api/products?categoria=X -> filtra por categoría
//   - GET  /api/products?q=X     -> búsqueda en el catálogo
//   - GET  /api/products?refresh=mercadolibre&q=X  -> dispara scraping y devuelve resultados
//   - GET  /api/products?sources=ml,indulife        -> combina múltiples fuentes
//   - POST /api/products         -> guarda un producto nuevo (manual o scrapeado)
//
// En producción, los datos scrapeados se pueden cachear en Vercel KV (futuro).
// Por ahora, el catálogo base vive en data/productos-colombia.json.

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'productos-colombia.json');
const FUENTES_PATH = path.join(__dirname, '..', 'data', 'fuentes.json');

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { productos: [], categorias: [] };
  }
}

function loadFuentes() {
  try {
    return JSON.parse(fs.readFileSync(FUENTES_PATH, 'utf-8'));
  } catch {
    return { sitios: [] };
  }
}

function searchInCatalog(productos, query) {
  if (!query) return productos;
  const q = query.toLowerCase();
  return productos.filter(p =>
    (p.nombre || '').toLowerCase().includes(q) ||
    (p.marca || '').toLowerCase().includes(q) ||
    (p.material_principal || '').toLowerCase().includes(q) ||
    (p.tipo_sistema || '').toLowerCase().includes(q)
  );
}

// Scrapers disponibles (carga lazy)
const scrapers = {
  mercadolibre: () => require('./scrape/mercadolibre.js'),
  indulife: () => require('./scrape/indulife.js'),
  'woo-generic': () => require('./scrape/woo-generic.js'),
  manual: () => require('./scrape/manual.js')
};

async function callScraper(source, params) {
  const fn = scrapers[source];
  if (!fn) return [];
  try {
    const handler = fn();
    const mockReq = { method: 'GET', query: params, body: params.body || null };
    let responseData = null;
    const mockRes = {
      setHeader: () => {},
      status: (code) => ({ json: (data) => { responseData = { status: code, data }; return mockRes; }, end: () => {} }),
      json: (data) => { responseData = { status: 200, data }; }
    };
    await handler(mockReq, mockRes);
    // Fix: paréntesis correctos - si hay productos los devuelve, si no prefill, si no []
    const productos = responseData?.data?.productos;
    const prefill = responseData?.data?.prefill;
    if (Array.isArray(productos) && productos.length > 0) return productos;
    if (prefill) return [prefill];
    return [];
  } catch (err) {
    console.error(`[scraper ${source}] error:`, err.message);
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const data = loadData();
  const fuentes = loadFuentes();
  const { fuente, categoria, q, refresh, sources, id, format } = req.query;

  // GET formato CSV
  if (format === 'csv') {
    const headers = ['id', 'nombre', 'marca', 'fuente', 'precio_cop', 'material_principal', 'capacidad_plantas', 'metodo_bombeo', 'energia_requerida', 'tipo_sistema', 'rating_promedio', 'url_fuente'];
    const rows = [headers.join(',')];
    for (const p of data.productos) {
      rows.push(headers.map(h => {
        const v = p[h];
        const s = v === null || v === undefined ? '' : String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      }).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="productos-hidroponia-co.csv"');
    return res.status(200).end(rows.join('\n'));
  }

  // GET detalle de un producto
  if (id) {
    const p = data.productos.find(x => x.id === id);
    if (!p) return res.status(404).json({ success: false, error: 'No encontrado' });
    return res.status(200).json({ success: true, producto: p });
  }

  // GET /api/products?sources=mercadolibre&q=... -> combina scraping + catálogo
  if (sources || refresh) {
    const sourceList = (sources || refresh || '').split(',').map(s => s.trim()).filter(Boolean);
    let allResults = [];

    // Catálogo curado que coincida
    let catalogFiltered = searchInCatalog(data.productos, q);
    if (fuente) catalogFiltered = catalogFiltered.filter(p => p.fuente?.toLowerCase().includes(fuente.toLowerCase()));
    if (categoria) catalogFiltered = catalogFiltered.filter(p => p.categoria === categoria);
    allResults = [...catalogFiltered];

    // Scraping de las fuentes pedidas
    for (const src of sourceList) {
      if (!scrapers[src]) continue;
      const scraped = await callScraper(src, { action: 'search', q, limit: 20 });
      // Guard: scraped puede ser undefined/null si el scraper falla
      if (!Array.isArray(scraped)) continue;
      // Normalizar productos scrapeados para que tengan los campos mínimos
      const normalized = scraped.map(p => ({
        ...p,
        id: p.id || `${src}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        nombre: p.nombre || 'Producto sin nombre',
        fuente: p.fuente || src,
        precio_cop: p.precio_cop || null,
        marca: p.marca || '—',
        material_principal: p.material_principal || '—',
        capacidad_plantas: p.capacidad_plantas || null,
        metodo_bombeo: p.metodo_bombeo || '—',
        energia_requerida: p.energia_requerida ?? null,
        url_fuente: p.url_fuente || '#',
        categoria: p.categoria || 'kit-interior',
        rating_promedio: p.rating_promedio || null,
        numero_reviews: p.numero_reviews || 0
      }));
      allResults = [...allResults, ...normalized];
    }

    return res.status(200).json({
      success: true,
      count: allResults.length,
      productos: allResults,
      fuentes_consultadas: sourceList,
      timestamp: new Date().toISOString()
    });
  }

  // GET /api/products?stats=1 -> estadísticas agregadas
  if (req.query.stats === '1') {
    const stats = {
      total: data.productos.length,
      por_fuente: {},
      por_categoria: {},
      por_material: {},
      rango_precios: { min: null, max: null, promedio: null },
      con_electricidad: 0,
      sin_electricidad: 0,
      con_ceramica: 0
    };
    const precios = [];
    for (const p of data.productos) {
      stats.por_fuente[p.fuente] = (stats.por_fuente[p.fuente] || 0) + 1;
      stats.por_categoria[p.categoria] = (stats.por_categoria[p.categoria] || 0) + 1;
      const mat = (p.material_principal || '').toLowerCase();
      stats.por_material[mat] = (stats.por_material[mat] || 0) + 1;
      if (p.precio_cop) precios.push(p.precio_cop);
      if (p.energia_requerida === true) stats.con_electricidad++;
      if (p.energia_requerida === false) stats.sin_electricidad++;
      if (mat.includes('cerámica') || mat.includes('barro') || mat.includes('ceramica')) stats.con_ceramica++;
    }
    if (precios.length) {
      stats.rango_precios.min = Math.min(...precios);
      stats.rango_precios.max = Math.max(...precios);
      stats.rango_precios.promedio = Math.round(precios.reduce((a, b) => a + b, 0) / precios.length);
    }
    return res.status(200).json({ success: true, stats, metadata: data.metadata });
  }

  // GET /api/products?fuentes=1 -> devuelve la config de fuentes
  if (req.query.fuentes === '1') {
    return res.status(200).json({ success: true, fuentes });
  }

  // GET listado normal con filtros
  let productos = data.productos;
  if (fuente) productos = productos.filter(p => p.fuente?.toLowerCase().includes(fuente.toLowerCase()));
  if (categoria) productos = productos.filter(p => p.categoria === categoria);
  if (q) productos = searchInCatalog(productos, q);

  // Ordenamiento
  const sort = req.query.sort;
  if (sort === 'precio-asc') productos.sort((a, b) => (a.precio_cop || 0) - (b.precio_cop || 0));
  if (sort === 'precio-desc') productos.sort((a, b) => (b.precio_cop || 0) - (a.precio_cop || 0));
  if (sort === 'rating') productos.sort((a, b) => (b.rating_promedio || 0) - (a.rating_promedio || 0));
  if (sort === 'nombre') productos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  return res.status(200).json({
    success: true,
    count: productos.length,
    total_catalogo: data.productos.length,
    productos: productos,
    categorias: data.categorias,
    campos_comparacion: data.campos_comparacion,
    timestamp: new Date().toISOString()
  });
};
