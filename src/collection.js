// Woodhouse.Collection
// ---
// Extends Backbone.Collection and sets default model class to Woodhouse.Model
import Model from './model';

var Collection = Backbone.Collection.extend({
  model: Model,

  // Move a model from index `from` to index `to`
  move: function(from, to) {
    var models = this.models;
    models.splice(to, 0, models.splice(from, 1)[0]);
    this.trigger('sort', this);
    return this;
  }
});

export default Collection;
