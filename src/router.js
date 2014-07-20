// Woodhouse.Router
// ---
// Extends Backbone.Router
Woodhouse.Router = Backbone.Router.extend({
  navigate: function(route, options) {
    options = options || {};

    // Don't navigate if route didn't change
    if (Backbone.history.fragment === route) {
      return this;
    }

    // Determine whether we should navigate
    if (!this.shouldNavigate(options)) {
      return this;
    }

    // This aborts all pending XHRs when Backbone tries to navigate
    _.each(Woodhouse.xhrs, function(xhr) {
      if (xhr.readyState && xhr.readyState > 0 && xhr.readyState < 4) {
        Woodhouse.log('XHR aborted due to router navigation');
        xhr.abort();
      }
    });
    Woodhouse.xhrs = [];
    if (options.force) {
      Backbone.history.fragment = null;
    }

    Backbone.history.navigate(route, options);
  },

  shouldNavigate: function(options) {
    return true;
  },
});
