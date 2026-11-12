/* shared-nav.js - Enlace de compatibilidad con js/design-system.js */
(function() {
  if (typeof window.HydroUI !== 'undefined') {
    return;
  }
  var s = document.createElement('script');
  s.src = 'js/design-system.js';
  s.async = false;
  document.head.appendChild(s);
})();
