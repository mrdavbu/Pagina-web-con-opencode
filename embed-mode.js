/* embed-mode.js — dentro de un iframe (?embed=1) oculta menú/encabezado fijo y el botón «Volver». */
(function () {
  if (window.self === window.top && !/[?&]embed=1/.test(location.search)) return;
  var s = document.createElement('style');
  s.textContent = '.back-bar{display:none!important}:root{--header-height:0px!important}body{padding-top:0!important}.page-wrap{padding-top:24px!important}';
  document.head.appendChild(s);
  function hideNav() {
    document.querySelectorAll('header,nav,[class*="nav"],[class*="header"]').forEach(function (el) {
      var p = getComputedStyle(el).position;
      if ((p === 'fixed' || p === 'sticky') && el.getBoundingClientRect().top < 20) el.style.display = 'none';
    });
  }
  window.addEventListener('load', function () { hideNav(); setTimeout(hideNav, 500); });
})();
