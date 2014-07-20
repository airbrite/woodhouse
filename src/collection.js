// Woodhouse.Collection
// ---
// Extends Backbone.Collection and sets default model class to Woodhouse.Model
Woodhouse.Collection = Backbone.Collection.extend({
  model: Woodhouse.Model,

  // Proxy for Array's move method and also fires a `sort` event
  move: function() {
    Array.prototype.move.apply(this.models, arguments);
    this.trigger('sort', this);
    return this;
  }
});
