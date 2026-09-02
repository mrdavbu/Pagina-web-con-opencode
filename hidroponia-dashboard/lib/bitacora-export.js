// lib/bitacora-export.js
// Convierte un set de productos a formato Markdown optimizado para pegar
// como entrada en la bitácora. También genera HTML para el botón "guardar en bitácora".

// ============================================================
// Genera Markdown para una entrada de la bitácora
// ============================================================
function generateEntry(productos, metadata = {}) {
  if (!productos || productos.length === 0) {
    return '';
  }

  const fecha = metadata.fecha || new Date().toISOString().split('T')[0];
  const titulo = metadata.titulo || `Benchmarking de mercado colombiano — ${fecha}`;
  const categoria = metadata.categoria || 'investigacion'; // match con categorías de bitácora
  const tags = metadata.tags || ['benchmarking', 'mercado', 'cerámica', 'sostenibilidad'];
  const resumen = metadata.resumen || generarResumen(productos);

  let md = '';

  // Frontmatter estilo (no es YAML real, es metadata visible)
  md += `# ${titulo}\n\n`;
  md += `**Categoría:** ${categoria}  \n`;
  md += `**Fecha:** ${fecha}  \n`;
  md += `**Productos comparados:** ${productos.length}  \n`;
  md += `**Fuentes consultadas:** ${[...new Set(productos.map(p => p.fuente))].join(', ')}\n\n`;

  md += `## Resumen ejecutivo\n\n${resumen}\n\n`;

  // Tabla comparativa principal
  md += `## Tabla comparativa\n\n`;
  md += '| Producto | Marca | Precio (COP) | Material | # Plantas | Bombeo | Energía |\n';
  md += '|---|---|---|---|---|---|---|\n';
  for (const p of productos) {
    md += `| [${escapeMarkdown(p.nombre || 'Sin nombre')}](${p.url_fuente || '#'}) | ${p.marca || '—'} | ${formatPrecio(p.precio_cop)} | ${p.material_principal || '—'} | ${p.capacidad_plantas || '—'} | ${p.metodo_bombeo || '—'} | ${p.energia_requerida ? '⚡ Sí' : '🌱 No'} |\n`;
  }
  md += '\n';

  // Hallazgos por categoría
  const hallazgos = generarHallazgos(productos);
  if (hallazgos.length) {
    md += `## Hallazgos clave\n\n`;
    hallazgos.forEach(h => { md += `- ${h}\n`; });
    md += '\n';
  }

  // Detalle por producto
  md += `## Detalle por producto\n\n`;
  for (const p of productos) {
    md += `### ${p.nombre || 'Producto sin nombre'}\n\n`;
    md += `- **Marca:** ${p.marca || '—'}\n`;
    md += `- **Fuente:** ${p.fuente || '—'}`;
    if (p.url_fuente) md += ` ([ver en sitio](${p.url_fuente}))`;
    md += '\n';
    if (p.precio_cop) md += `- **Precio:** ${formatPrecio(p.precio_cop)} COP\n`;
    if (p.material_principal) md += `- **Material:** ${p.material_principal}\n`;
    if (p.capacidad_plantas) md += `- **Capacidad:** ${p.capacidad_plantas} plantas\n`;
    if (p.capacidad_litros) md += `- **Volumen:** ${p.capacidad_litros} L\n`;
    if (p.dimensiones_cm) {
      const d = p.dimensiones_cm;
      md += `- **Dimensiones:** ${d.ancho || '?'} × ${d.alto || '?'} × ${d.profundidad || '?'} cm\n`;
    }
    if (p.metodo_bombeo) md += `- **Método de bombeo:** ${p.metodo_bombeo}\n`;
    if (p.energia_requerida !== undefined) md += `- **Energía requerida:** ${p.energia_requerida ? 'Sí' : 'No'}\n`;
    if (p.tipo_sistema) md += `- **Tipo de sistema:** ${p.tipo_sistema}\n`;
    if (p.pais_origen) md += `- **Origen:** ${p.pais_origen}\n`;
    if (p.rating_promedio) md += `- **Rating:** ${p.rating_promedio}/5 (${p.numero_reviews || 0} reseñas)\n`;
    if (p.disponibilidad) md += `- **Disponibilidad CO:** ${p.disponibilidad}\n`;
    if (p.garantia_meses) md += `- **Garantía:** ${p.garantia_meses} meses\n`;
    if (p.notas_investigacion) {
      md += `\n> 📝 **Nota de investigación:** ${p.notas_investigacion}\n`;
    }
    if (p.reviews_destacadas && p.reviews_destacadas.length) {
      md += `\n**Reseñas destacadas:**\n`;
      p.reviews_destacadas.forEach(r => { md += `> "${r}"\n`; });
    }
    md += '\n---\n\n';
  }

  md += `\n\n*Entrada generada automáticamente desde el dashboard de comparación — ${fecha}*\n`;

  return md;
}

// ============================================================
// Genera HTML que se inyecta en la bitácora
// ============================================================
function generateEntryHTML(productos, metadata = {}) {
  const fecha = metadata.fecha || new Date().toISOString().split('T')[0];
  const titulo = metadata.titulo || `Benchmarking ${fecha}`;

  // Estructura HTML compatible con el formato de la bitácora
  const rows = productos.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.nombre || 'Sin nombre')}</strong><br><small>${p.marca || ''}</small></td>
      <td>${formatPrecio(p.precio_cop)}</td>
      <td>${escapeHtml(p.material_principal || '—')}</td>
      <td>${p.capacidad_plantas || '—'}</td>
      <td>${escapeHtml(p.metodo_bombeo || '—')}</td>
      <td>${p.energia_requerida ? '⚡' : '🌱'}</td>
      <td>${p.rating_promedio ? '⭐ ' + p.rating_promedio : '—'}</td>
    </tr>
  `).join('');

  return `<h2>${escapeHtml(titulo)}</h2>
<p><em>Comparación de ${productos.length} productos — ${fecha}</em></p>
<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
  <thead>
    <tr style="background:#1a4d2e;color:white">
      <th>Producto</th><th>Precio (COP)</th><th>Material</th><th># Plantas</th>
      <th>Bombeo</th><th>Energía</th><th>Rating</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p><small>Generado desde <a href="./dashboard.html">dashboard comparativo</a></small></p>`;
}

// ============================================================
// Helpers
// ============================================================
function formatPrecio(cop) {
  if (!cop) return '—';
  return '$' + cop.toLocaleString('es-CO');
}

function escapeMarkdown(s) {
  if (!s) return '';
  return String(s).replace(/([|`*_{}[\]<>])/g, '\\$1');
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generarResumen(productos) {
  const total = productos.length;
  const plasticos = productos.filter(p => (p.material_principal || '').toLowerCase().includes('plást') || (p.material_principal || '').toLowerCase().includes('plast') || (p.material_principal || '').toLowerCase().includes('pvc') || (p.material_principal || '').toLowerCase().includes('abs'));
  const ceramica = productos.filter(p => (p.material_principal || '').toLowerCase().includes('cerám') || (p.material_principal || '').toLowerCase().includes('ceram') || (p.material_principal || '').toLowerCase().includes('barro') || (p.material_principal || '').toLowerCase().includes('terracota'));
  const conElectricidad = productos.filter(p => p.energia_requerida === true);
  const sinElectricidad = productos.filter(p => p.energia_requerida === false);
  const precios = productos.map(p => p.precio_cop).filter(Boolean);

  let resumen = `Se compararon **${total} productos** del mercado hidropónico colombiano. `;
  resumen += `**${plasticos.length}** están fabricados principalmente en plástico y `;
  resumen += `**${ceramica.length}** en cerámica/terracota. `;
  resumen += `En cuanto a dependencia energética: **${conElectricidad.length}** requieren electricidad constante y `;
  resumen += `**${sinElectricidad.length}** funcionan de forma pasiva. `;
  if (precios.length) {
    const min = Math.min(...precios);
    const max = Math.max(...precios);
    resumen += `Rango de precios: desde ${formatPrecio(min)} hasta ${formatPrecio(max)} COP. `;
  }
  return resumen;
}

function generarHallazgos(productos) {
  const hallazgos = [];

  // Hueco de mercado: cerámica modular sin electricidad
  const ceramicaModular = productos.filter(p =>
    (p.material_principal || '').toLowerCase().includes('cerám') &&
    p.energia_requerida === false &&
    p.capacidad_plantas > 1
  );
  if (ceramicaModular.length === 0) {
    hallazgos.push('🚨 **HUECO DE MERCADO:** No existe en el mercado colombiano un sistema de cerámica modular con múltiples plantas y sin dependencia eléctrica. Esta es la oportunidad directa para tu proyecto.');
  }

  // Concentración de plástico
  const plasticoPorcentaje = (productos.filter(p => (p.material_principal || '').toLowerCase().includes('plást') || (p.material_principal || '').toLowerCase().includes('pvc')).length / productos.length) * 100;
  if (plasticoPorcentaje > 60) {
    hallazgos.push(`♻️ **SOSTENIBILIDAD:** ${plasticoPorcentaje.toFixed(0)}% de los productos del mercado están hechos de plástico, confirmando la relevancia de una alternativa en cerámica.`);
  }

  // Brecha de precio
  const ceramica = productos.filter(p => (p.material_principal || '').toLowerCase().includes('cerám') || (p.material_principal || '').toLowerCase().includes('barro'));
  const plasticos = productos.filter(p => (p.material_principal || '').toLowerCase().includes('plást') || (p.material_principal || '').toLowerCase().includes('pvc') || (p.material_principal || '').toLowerCase().includes('abs'));
  if (ceramica.length && plasticos.length) {
    const promedioCeramica = ceramica.reduce((a, p) => a + (p.precio_cop || 0), 0) / ceramica.length;
    const promedioPlastico = plasticos.reduce((a, p) => a + (p.precio_cop || 0), 0) / plasticos.length;
    if (promedioPlastico && promedioCeramica) {
      const ratio = promedioCeramica / promedioPlastico;
      hallazgos.push(`💰 **PRECIO:** En promedio, los productos en cerámica cuestan ${ratio.toFixed(1)}× lo que cuestan los de plástico. Factor clave para definir pricing de tu propuesta.`);
    }
  }

  // Productos importados vs locales
  const importados = productos.filter(p => p.pais_origen && p.pais_origen.toLowerCase().match(/importado|china|estados|francia|estados unidos|eeuu|ee.uu/));
  if (importados.length > productos.length / 2) {
    hallazgos.push(`🌎 **PRODUCCIÓN LOCAL:** La mayoría de los productos del mercado son importados. Existe espacio para producción local colombiana con valor agregado (diseño + cerámica).`);
  }

  return hallazgos;
}

// Exporta también para el dashboard (window.BitacoraExport)
if (typeof window !== 'undefined') {
  window.BitacoraExport = { generateEntry, generateEntryHTML };
}

if (typeof module !== 'undefined') {
  module.exports = { generateEntry, generateEntryHTML };
}
