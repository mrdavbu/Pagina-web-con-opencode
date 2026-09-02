/* shared-nav.js - Navegación compartida de secciones del proyecto */
(function navInit() {
  var SECTIONS = [
    { id: 'inicio',     href: 'index.html',        icon: '🏠', label: 'Inicio' },
    { id: 'investigar', href: 'investigar.html',   icon: '🔎', label: 'Investigar' },
    { id: 'empatizar',  href: 'empatizar.html',    icon: '🎯', label: 'Empatizar' },
    { id: 'definir',    href: 'definir.html',      icon: '🎛️', label: 'Definir' },
    { id: 'idear',      href: 'idear.html',        icon: '💡', label: 'Idear' },
    { id: 'prototipar', href: 'prototipar.html',   icon: '🧪', label: 'Prototipar' },
    { id: 'validar',    href: 'validar.html',      icon: '✅', label: 'Validar' }
  ];

  var current = document.body.getAttribute('data-section') || 'inicio';

  function render() {
    var bars = document.querySelectorAll('[data-nav]');
    bars.forEach(function (bar) {
      bar.innerHTML = '';
      var ul = document.createElement('ul');
      ul.className = 'nav-list';
      SECTIONS.forEach(function (s) {
        var li = document.createElement('li');
        li.className = s.id === current ? 'active' : '';
        var a = document.createElement('a');
        a.href = s.href;
        a.innerHTML = '<span class="nav-ic">' + s.icon + '</span><span class="nav-tx">' + s.label + '</span>';
        li.appendChild(a);
        ul.appendChild(li);
      });
      bar.appendChild(ul);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
