/* dashboard-embed.js — visor de dashboards incrustado (sin salir de la página).
   Uso: <div data-dashboard-embed></div>  ·  Abrir una pestaña: location.hash = '#dashboards=mercado' */
(function () {
  var TABS = [
    { id: 'mercado',     icon: '📊', label: 'Mercado',            src: 'hidroponia-dashboard/dashboard.html' },
    { id: 'comparador',  icon: '🔬', label: 'Comparador',         src: 'comparador.html' },
    { id: 'referentes',  icon: '🎨', label: 'Referentes de diseño', src: 'dashboard-diseno.html' }
  ];
  var css = '.dbe{--g:var(--green-600,var(--green,#2E7D52));--ln:var(--border-subtle,var(--line,rgba(46,125,82,.2)));--tx:var(--text-main,var(--text,#1A3320));' +
    'background:#fff;border:1px solid var(--ln);border-radius:16px;overflow:hidden;margin:0 0 32px;box-shadow:0 4px 16px rgba(26,51,32,.08)}' +
    '.dbe-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--ln);background:rgba(46,125,82,.06)}' +
    '.dbe-tab{font:600 14px/1 "Space Grotesk",system-ui,sans-serif;color:var(--tx);background:#fff;border:1px solid var(--ln);border-radius:999px;padding:10px 16px;cursor:pointer}' +
    '.dbe-tab[aria-selected="true"]{background:var(--g);border-color:var(--g);color:#fff}' +
    '.dbe-sp{flex:1}.dbe-act{font:600 13px/1 "Space Grotesk",system-ui,sans-serif;color:var(--g);background:none;border:0;cursor:pointer;text-decoration:none;padding:8px}' +
    '.dbe-frame{position:relative;height:min(78vh,860px);background:#EFF6F1}.dbe.dbe-tall .dbe-frame{height:calc(100vh - 80px)}' +
    '.dbe-frame iframe{width:100%;height:100%;border:0;display:block}' +
    '.dbe-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:500 15px "Space Grotesk",sans-serif;color:var(--tx);pointer-events:none}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function build(root) {
    var cur = null;
    root.classList.add('dbe');
    root.innerHTML = '<div class="dbe-bar" role="tablist"></div><div class="dbe-frame"><div class="dbe-load">Selecciona un dashboard…</div></div>';
    var bar = root.querySelector('.dbe-bar'), frame = root.querySelector('.dbe-frame');
    TABS.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'dbe-tab'; b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.id = t.id;
      b.textContent = t.icon + ' ' + t.label;
      b.onclick = function () { open(t.id); };
      bar.appendChild(b);
    });
    bar.insertAdjacentHTML('beforeend', '<span class="dbe-sp"></span><button class="dbe-act" type="button" data-a="size">⤢ Ampliar</button><a class="dbe-act" data-a="ext" target="_blank" rel="noopener">↗ Pestaña nueva</a>');
    bar.querySelector('[data-a=size]').onclick = function (e) {
      var tall = root.classList.toggle('dbe-tall'); e.target.textContent = tall ? '⤡ Reducir' : '⤢ Ampliar';
      if (tall) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    function open(id) {
      var t = TABS.filter(function (x) { return x.id === id; })[0]; if (!t || cur === id) return;
      cur = id;
      bar.querySelectorAll('.dbe-tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.id === id)); });
      bar.querySelector('[data-a=ext]').href = t.src;
      frame.innerHTML = '<div class="dbe-load">Cargando ' + t.label + '…</div>';
      var f = document.createElement('iframe');
      f.title = 'Dashboard · ' + t.label; f.loading = 'lazy';
      f.onload = function () { var l = frame.querySelector('.dbe-load'); if (l) l.remove(); };
      f.src = t.src + (t.src.indexOf('?') < 0 ? '?' : '&') + 'embed=1';
      frame.appendChild(f);
    }
    root._dbeOpen = open;
    var m = /dashboards=([a-z]+)/.exec(location.hash); open(m ? m[1] : TABS[0].id);
  }
  function init() {
    var nodes = document.querySelectorAll('[data-dashboard-embed]');
    nodes.forEach(build);
    // Cualquier enlace con data-dbe-tab abre esa pestaña y baja hasta el visor
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-dbe-tab]'); if (!a || !nodes.length) return;
      e.preventDefault(); nodes[0]._dbeOpen(a.dataset.dbeTab); nodes[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
