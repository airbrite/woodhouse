// Javascript extensions
// ---

// Computed Properties
Function.prototype.property = function() {
  var args = Array.prototype.slice.call(arguments);
  this.properties = args;
  return this;
};
