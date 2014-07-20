// Javascript extensions
// ---

// Moves an array element from one index to another
Array.prototype.move = function(from, to) {
  this.splice(to, 0, this.splice(from, 1)[0]);
};

// Computed Properties
Function.prototype.property = function() {
  var args = Array.prototype.slice.call(arguments);
  this.properties = args;
  return this;
};
