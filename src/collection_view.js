// Collection View
// ---
//
// Mostly inspired by Marionette

import View from './view';

var CollectionView = View.extend({
  render: function() {
    View.prototype.render.apply(this, arguments);

    this.renderList();

    return this;
  },

  // TODO optimize with document fragments
  renderList: function() {
    this.collection.each(function(model) {
      var itemView = new this.ItemView({
        model: model
      });
      this.addSubview(itemView);
      $(this.listEl)
        .append(itemView.el);
    }, this);

    return this;
  }
});

export default CollectionView;
