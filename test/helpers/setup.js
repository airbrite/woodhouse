// Some setup since karma doesn't add #qunit-fixture to its html
(function() {
  var fixture = document.createElement('div');
  fixture.id = "qunit-fixture";
  document.body.appendChild(fixture);

  // Expose Woodhouse as global for QUnit
  window.Woodhouse = require('woodhouse');
})();
