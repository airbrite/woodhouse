// Woodhouse.View
// ---
//
// Properties
// subviews - Array of Woodhouse.View
// superview - Woodhouse.View
//
// Options (arguments passed in to constructor are added to the property `options` object)
// locals - Object or Function - Properties that get mixed into the template context during template evaluation
//
// Prototype
// template - Function - required - compiled template function (handlebars, etc...)
// onBeforeRender - Function - optional
// onRender - Function - optional
// onBeforeRemove - Function - optional
// onRemove - Function - optional

// Principles
// ---
// Render should be able to be called multiple times without side effects.
// The order of the DOM should be declared in templates, not Javascript.
// Calling render again should maintain the state the view was in.
// Rendering twice shouldn’t trash views just to re-construct them again.
// Rending multiple times should properly detach and attach event listeners

Woodhouse.View = Backbone.View.extend({
  constructor: function(options) {
    // this exposes view options to the view initializer
    // this is a backfill since backbone removed the assignment of this.options
    this.options = _.extend({}, this.options, options);
    Backbone.View.prototype.constructor.apply(this, arguments);
  },

  // Because Backbone only allows certain view options to become properties,
  // we store the rest of them in the options property.
  // This is a convenience accessor to get a property that either belongs to the view or is in options
  getOption: function(property) {
    var value;

    if (this.options && (property in this.options) && (this.options[property] !== undefined)) {
      value = this.options[property];
    } else {
      value = this[property];
    }

    return value;
  },

  // Wraps the context with a model or collection for the events system
  wrapContext: function(context) {
    if (context && !_.isFunction(context) && _.isUndefined(context.on)) {
      if (_.isArray(context)) {
        context = new Woodhouse.Collection(context);
      } else if (_.isObject(context)) {
        context = new Woodhouse.Model(context);
      }
    } else if (_.isUndefined(context) || _.isNull(context)) {
      Woodhouse.log("*** Does this ever happen?");
      // Just plane doesn't exist
      context = new Woodhouse.Collection();
    }
    return context;
  },

  getContext: function(options) {
    options = options || {};

    // If a context keypath is provided, override the context relative to the view
    if (options.view) {
      return this[options.view];
    }

    // If binding to a collection instead of model
    if (options.collection) {
      return options.collection;
    }

    // No keypath, return model
    if (_.isUndefined(options.keypath) || _.isNull(options.keypath)) {
      return options.model;
    }

    var context = options.model.get(options.keypath);

    if (!context) {
      if (options.model.relations && _.isArray(options.model.relations)) {
        _.each(options.model.relations, function(relation) {
          if (options.keypath === relation.key) {
            if (relation.type === 'collection') {
              context = new relation.collection();
            } else {
              context = new relation.model();
            }
          }
        }.bind(this));
      }
    }

    // Move wrap context here
    // context = this.wrapContext(context);

    return context;
  },


  // Templating
  // ---
  //
  // Evaluates a compiled template with context
  // TODO allow string templates to be evaluated on-the-fly
  evaluateTemplate: function(template) {
    return template(this.templateContext());
  },

  // Build the template context from model, collection, and locals
  templateContext: function() {
    // Populate model and collection properties with model and collection attributes
    var context = {
      model: this.model ? this.model.toJSON() : {},
      collection: this.collection ? this.collection.toJSON() : {}
    };

    // Mixin template locals
    var locals = this.getOption('locals') || {};
    if (_.isFunction(locals)) {
      locals = locals.call(this);
    }
    _.extend(context, locals);

    return context;
  },


  // View Bindings
  // ---
  //
  // Add bindings declared with the `bind-*` attribute
  // `this` should always refer to the `view`
  //
  // TODO
  // - `bind-focus`
  // - `bind-css`
  //
  // - binding to nested keypaths that don't exist will NOT create them like a set will
  // - example: `bind-val="payment_source.card"` but payment_source does not have the key `card`
  // - pass back options in transformers
  //
  // Options:
  // - `el` is the root DOM element to bind to
  // - `model` is the Model or Collection to bind to
  // - `index` is the integer index when in the loop
  // - `keypathPrefix` is the prefix for keypath when in the loop
  addBindings: function(options) {
    // No el, no bind!
    if (!options.el) {
      return [];
    }


    // Variables
    var $el = $(options.el); // just for convenience
    var bindings = []; // keeps track of all bindings, returned by function


    // Binding functions/handlers
    var fns = {
      // Attr
      // Syntax: `bind-attr-*="keypath"`
      // Direction: Model-to-View
      bindAttr: function(bindEl, attrName, attrValue) {
        // Delayed removal of attributes
        var attributesToRemove;

        // Loop thru all attributes
        _.each(bindEl.attributes, function(attribute) {
          if (attribute.name.indexOf('bind-attr-') < 0) {
            return;
          }

          // Found a [bind-attr-*] attribute
          var $bindEl = $(bindEl);
          var attr = attribute.name.replace('bind-attr-', '');
          var keypath = $bindEl.attr(attribute.name);
          var keypathWithPrefix = (options.keypathPrefix ? options.keypathPrefix + '.' + keypath : keypath).replace('this.', '');
          var modelEvents = 'change:' + keypath;
          var offset = 0;

          // Context
          var context = this.getContext({
            model: options.model,
            view: $bindEl.attr('bind-attr-context')
          });

          // Binding
          var modelToView = function(model, value) {
            // Eval if value is a function
            if (_.isFunction(value)) {
              value = value.call(model);
            }

            // Check for any transformers
            var transformersFn = this.transformers && this.transformers.modelToView;
            if (transformersFn && _.isFunction(transformersFn[keypathWithPrefix])) {
              value = transformersFn[keypathWithPrefix].call(this, value, model);
            }

            $bindEl.attr(attr, value);
          }.bind(this);

          // Delayed removal of attributes
          attributesToRemove = attributesToRemove || [];
          attributesToRemove.push(attribute.name);

          // If all we need is the index
          if (keypath === '$index') {
            var index = options.index + (parseInt($bindEl.attr('bind-index-offset'), 10) || 0);
            var transformersFn = this.transformers && this.transformers.index;
            if (transformersFn && _.isFunction(transformersFn[keypathWithPrefix])) {
              index = transformersFn[keypathWithPrefix].call(this, index);
            }
            return $bindEl.attr(attr, index);
          }

          // Store binding for removal later
          bindings.push({
            object: context,
            events: modelEvents,
            handler: modelToView
          });

          // Bind model-to-view
          context.on(modelEvents, modelToView);
          modelToView(context, context.get(keypath));
        }.bind(this));

        // Delayed removal of attributes
        if (attributesToRemove) {
          _.each(attributesToRemove, function(attributeToRemove) {
            $(bindEl)
              .removeAttr(attributeToRemove);
          });
        }
      }.bind(this),


      // Repeat (ARRAY ONLY)
      // Syntax: `bind-array="keypath"`
      // Direction: N/A
      // Expects an Array not a Collection
      bindArray: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var $parentEl = $bindEl.parent();
        var $childEls = $();
        var direction = $bindEl.attr('bind-array-direction');
        var keypath = attrValue;
        var modelEvents = 'change:' + keypath;

        // Context
        var context = this.getContext({
          model: options.model,
          view: $bindEl.attr('bind-array-context')
        });

        // Remove attribute
        $bindEl.removeAttr(attrName);

        // The binding function
        var modelToView = function(model, value) {
          var $childEl;

          // Eval if value is a function
          if (_.isFunction(value)) {
            value = value.call(model);
          }

          // Clear select container
          $childEls.remove();
          $childEls = $();

          // Value can be either an `array of strings` or a `collection`
          for (var i = 0; i < value.length; i++) {
            // Make a copy of the detached item
            $childEl = $bindEl.clone();

            $childEl.text(value[i]);

            $.merge($childEls, $childEl);
          }

          // Append item to parent container
          if (direction && direction === 'append') {
            $childEls.appendTo($parentEl);
          } else {
            $childEls.prependTo($parentEl);
          }
        }.bind(this);

        // Detach from DOM and cache it
        $bindEl.detach();

        // Store binding for removal later
        bindings.push({
          object: context,
          events: modelEvents,
          handler: modelToView
        });

        // Bind model-to-view
        context.on(modelEvents, modelToView);
        modelToView(context, context.get(keypath));
      }.bind(this),


      // With
      // Syntax: `bind-with="keypath"`
      bindWith: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var keypath = attrValue;
        var childBindings = [];
        var keypathPrefix = options.keypathPrefix ? options.keypathPrefix + '.' + keypath : keypath;

        // Context
        var context = this.getContext({
          model: options.model,
          keypath: keypath,
          view: $bindEl.attr('bind-with-context')
        });

        // Eval if value is a function
        if (_.isFunction(context)) {
          context = context.call(options.model);
        }

        // Remove attribute
        $bindEl.removeAttr(attrName);

        // Remove child bindings
        this.childBindings = _.difference(this.childBindings, childBindings);
        this.removeBindings(childBindings);

        childBindings = childBindings.concat(this.addBindings({
          el: $bindEl,
          model: context,
          keypathPrefix: keypathPrefix
        }));

        // Add child bindings for removal later
        this.childBindings = this.childBindings || [];
        this.childBindings = this.childBindings.concat(childBindings);

        if (childBindings.length > 0) {
          Woodhouse.log("View: %s, Added %d bindings isChild: true, isIf: true", this.cid, childBindings.length);
        }
      }.bind(this),


      // If/Unless
      // Syntax: `bind-if="keypath"`
      bindIfUnless: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var keypath = attrValue;
        var modelEvents = 'change:' + keypath;
        var childBindings = [];

        // Context
        var context = this.getContext({
          model: options.model,
          view: $bindEl.attr('bind-if-context') || $bindEl.attr('bind-unless-context')
        });

        // Remove attribute
        $bindEl.removeAttr(attrName);

        // Make a clone and remove the original element
        var $contents = $bindEl.contents().clone();
        $bindEl.contents().empty().remove();

        // Binding function
        var modelToView = function(model, value) {
          // Remove child bindings
          this.childBindings = _.difference(this.childBindings, childBindings);
          this.removeBindings(childBindings);

          // Clear container
          $bindEl.empty();

          // Eval if value is a function
          if (_.isFunction(value)) {
            value = value.call(model);
          }

          value = Boolean(value);

          if (attrName === 'bind-unless') {
            value = !value;
          }

          // Element should be active
          if (value) {
            var $childEl = $contents.clone();
            $bindEl.append($childEl);

            childBindings = childBindings.concat(this.addBindings({
              el: $childEl,
              model: model
            }));

            // Add child bindings for removal later
            this.childBindings = this.childBindings || [];
            this.childBindings = this.childBindings.concat(childBindings);

            if (childBindings.length > 0) {
              Woodhouse.log("View: %s, Added %d bindings isChild: true, isIf: true", this.cid, childBindings.length);
            }
          }
        }.bind(this);

        // Store binding for removal later
        bindings.push({
          object: context,
          events: modelEvents,
          handler: modelToView
        });


        // Bind model-to-view
        context.on(modelEvents, modelToView);
        modelToView(context, context.get(keypath));
      }.bind(this),


      // Each (COLLECTION ONLY)
      // Syntax: `bind-each="keypath"`
      // Direction: N/A
      // Note: a value of `this` behaves specially
      // Note: this binding needs to be parsed before all other bindings
      bindEach: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var direction = $bindEl.attr('bind-each-direction');
        var keypath = attrValue;
        var addEvents = 'add';
        var removeEvents = 'remove';
        var resetSortEvents = 'reset sort';
        var childBindings = [];
        var childElBindings = [];
        var $childEls = $();

        // Context
        var context = this.getContext({
          model: options.model,
          collection: keypath === 'this' ? options.collection : null,
          keypath: keypath,
          view: $bindEl.attr('bind-each-context')
        });

        // Eval if value is a function
        if (_.isFunction(context)) {
          context = context.call(options.model);
        }

        // Remove attribute
        $bindEl.removeAttr(attrName);

        // Clone and replace
        var $child = $bindEl.children().first().clone();
        $bindEl.children().first().remove();
        var $children = $bindEl.children();

        // Add bindings to rest of the children that aren't repeated (placeholders)
        // This goes to the parent binding because it doesn't get repeated
        bindings = bindings.concat(this.addBindings({
          el: $children,
          model: options.model
        }));

        // Reset and Sort (multiple models at a time)
        var bindResetSort = function(collection, opts) {
          var $childEl;
          var isSelect = $bindEl.is('select');
          var keypathPrefix = options.keypathPrefix ? options.keypathPrefix + '.' + keypath : keypath;

          // Remove child bindings
          this.childBindings = _.difference(this.childBindings, childBindings);
          this.removeBindings(childBindings);

          // Clear parent container
          var previousVal = isSelect ? $bindEl.val() : null;
          $childEls.remove();
          $childEls = $();

          // For each Model (child) in the Collection (parent), add bindings
          for (var i = 0; i < collection.length; i++) {
            // Make a copy of the detached item
            $childEl = $child.clone();

            $.merge($childEls, $childEl);

            // Add bindings to the child
            var newChildBindings = this.addBindings({
              el: $childEl,
              model: collection.at(i),
              index: i,
              keypathPrefix: keypathPrefix
            });
            childBindings = childBindings.concat(newChildBindings);

            childElBindings.push({
              el: $childEl,
              bindings: newChildBindings
            });
          }

          // Append child to parent container
          if (direction && direction === 'prepend') {
            $childEls.prependTo($bindEl);
          } else {
            $childEls.appendTo($bindEl);
          }

          // Restore previous select val
          if (isSelect) {
            $bindEl.val(previousVal);
          }

          // Add child bindings for removal later
          this.childBindings = this.childBindings || [];
          this.childBindings = this.childBindings.concat(childBindings);

          if (childBindings.length > 0) {
            Woodhouse.log("View: %s, Added %d child bindings", this.cid, childBindings.length);
          }
        }.bind(this);

        // Adding one model at a time
        var bindAdd = function(model, collection, opts) {
          var $childEl = $child.clone();
          var index = collection.indexOf(model);
          var keypathPrefix = options.keypathPrefix ? options.keypathPrefix + '.' + keypath : keypath;

          $bindEl.insertAt(index, $childEl);
          $childEls.splice(index, 0, $childEl.get(0));

          // Add bindings to the child
          var newChildBindings = this.addBindings({
            el: $childEl,
            model: model,
            index: index,
            keypathPrefix: keypathPrefix
          });
          childBindings = childBindings.concat(newChildBindings);

          childElBindings.push({
            el: $childEl,
            bindings: newChildBindings
          });

          // Add child bindings for removal later
          this.childBindings = this.childBindings || [];
          this.childBindings = this.childBindings.concat(childBindings);

          if (childBindings.length > 0) {
            Woodhouse.log("View: %s, Added %d bindings isChild: true", this.cid, childBindings.length);
          }
        }.bind(this);

        // Removing one or more models at a time
        var bindRemove = function(model, collection, opts) {
          var index = opts.index;

          // find the child element to remove
          var $removedEl = $($childEls.splice(index, 1));

          // locate any child bindings
          var matchedChildElBinding;
          for (var i = 0, n = childElBindings.length; i < n; i++) {
            if (childElBindings[i].el.is($removedEl)) {
              matchedChildElBinding = childElBindings[i];
              break;
            }
          }

          // remove child bindings
          if (matchedChildElBinding) {
            childBindings = _.difference(childBindings, matchedChildElBinding.bindings);
            this.childBindings = _.difference(this.childBindings, matchedChildElBinding.bindings);
            this.removeBindings(matchedChildElBinding.bindings);
            childElBindings.splice(childElBindings.indexOf(matchedChildElBinding), 1);
          }

          // remove the child element
          $removedEl.remove();
        }.bind(this);

        // Store binding for removal later
        bindings.push({
          object: context,
          events: addEvents,
          handler: bindAdd
        });

        bindings.push({
          object: context,
          events: removeEvents,
          handler: bindRemove
        });

        bindings.push({
          object: context,
          events: resetSortEvents,
          handler: bindResetSort
        });


        // Bind
        context.on(addEvents, bindAdd);
        context.on(removeEvents, bindRemove);
        context.on(resetSortEvents, bindResetSort);
        bindResetSort(context, {});
      }.bind(this),


      // Text/HTML
      // Syntax: `bind-text="keypath"` and `bind-html="keypath"`
      // Direction: Model-to-View, View-to-Model
      // Note: Browser compat on View-to-Model might be poor
      bindTextAndHtml: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var keypath = attrValue;
        var keypathWithPrefix = (options.keypathPrefix ? options.keypathPrefix + '.' + keypath : keypath).replace('this.', '');
        var modelEvents = 'change:' + keypath;
        var viewEvents = 'input';
        var offset = 0;

        // Context
        var context = this.getContext({
          model: options.model,
          view: $bindEl.attr('bind-text-context') || $bindEl.attr('bind-html-context')
        });

        // Remove attribute
        $bindEl.removeAttr(attrName);

        var modelToView = function(model, value) {
          // Eval if value is a function
          if (_.isFunction(value)) {
            value = value.call(model);
          }

          // Check for any transformers
          var transformersFn = this.transformers && this.transformers.modelToView;
          if (transformersFn && _.isFunction(transformersFn[keypathWithPrefix])) {
            value = transformersFn[keypathWithPrefix].call(this, value, model);
          }

          // Set the value for the element if it has changed
          var fn = (attrName === 'bind-html') ? 'html' : 'text';
          if ($bindEl[fn]() !== value) {
            $bindEl[fn](value);
          }

          Woodhouse.log("Binding: %s, Model Attribute Change: %s", attrName, keypathWithPrefix);
        }.bind(this);

        var viewToModel = function(e) {
          var fn = (attrName === 'bind-html') ? 'html' : 'text';
          var value = $bindEl[fn]();

          var transformersFn = this.transformers && this.transformers.viewToModel;
          if (transformersFn && _.isFunction(transformersFn[keypathWithPrefix])) {
            value = transformersFn[keypathWithPrefix].call(this, value);
          }

          if (!_.isFunction(context.get(keypath))) {
            context.set(keypath, value);
          }

          Woodhouse.log("Binding: %s, View Event: %s", attrName, e.type);
        }.bind(this);


        // If all we need is the index
        if (keypath === '$index') {
          var index = options.index + (parseInt($bindEl.attr('bind-index-offset'), 10) || 0);
          var transformersFn = this.transformers && this.transformers.index;
          if (transformersFn && _.isFunction(transformersFn[keypathWithPrefix])) {
            index = transformersFn[keypathWithPrefix].call(this, index);
          }
          return $bindEl.text(index);
        }

        // Store model binding for removal later
        bindings.push({
          object: context,
          events: modelEvents,
          handler: modelToView
        });

        // Store view binding for removal later
        bindings.push({
          object: $bindEl,
          modelEvents: viewEvents,
          handler: viewToModel
        });

        // Bind view-to-model
        $bindEl.on(viewEvents, viewToModel);


        // Bind model-to-view
        context.on(modelEvents, modelToView);
        modelToView(context, context.get(keypath));
      }.bind(this),


      // Val
      // Syntax: `bind-val="keypath"`
      // Direction: Model-to-View, View-to-Model
      // NOTE: Selenium seems to NOT respond well to `textchange`
      bindVal: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var keypath = attrValue;
        var keypathWithPrefix = (options.keypathPrefix ? options.keypathPrefix + '.' + keypath : keypath).replace('this.', '');
        var isSelect = $bindEl.is('select');
        var modelEvents = 'change:' + keypath;
        var viewEvents = isSelect ? 'change' : 'textchange';
        // Override events
        viewEvents = $bindEl.attr('bind-val-events') ? $bindEl.attr('bind-val-events') : viewEvents;

        // Context
        var context = this.getContext({
          model: options.model,
          view: $bindEl.attr('bind-val-context')
        });

        // Remove attribute
        $bindEl.removeAttr(attrName);

        // Binding function
        var modelToView = function(model, value) {
          // Eval if value is a function
          if (_.isFunction(value)) {
            value = value.call(model);
          }

          var transformersFn = this.transformers && this.transformers.modelToView;
          if (transformersFn && _.isFunction(transformersFn[keypathWithPrefix])) {
            value = transformersFn[keypathWithPrefix].call(this, value, model);
          }

          if ($bindEl.val() !== value) {
            $bindEl.val(value);
          }

          Woodhouse.log("Binding: %s, Model Attribute Change: %s", attrName, keypathWithPrefix);
        }.bind(this);

        var viewToModel = function(e) {
          var value = $bindEl.val();

          var transformersFn = this.transformers && this.transformers.viewToModel;
          if (transformersFn && _.isFunction(transformersFn[keypathWithPrefix])) {
            value = transformersFn[keypathWithPrefix].call(this, value);
          }

          if (!_.isFunction(context.get(keypath))) {
            context.set(keypath, value);
          }

          Woodhouse.log("Binding: %s, View Event: %s", attrName, e.type);
        }.bind(this);

        // Store binding for removal later
        bindings.push({
          object: context,
          events: modelEvents,
          handler: modelToView
        });

        // Store binding for removal later
        bindings.push({
          object: $bindEl,
          events: viewEvents,
          handler: viewToModel
        });

        // Bind view-to-model
        $bindEl.on(viewEvents, viewToModel);

        // Bind model-to-view
        context.on(modelEvents, modelToView);
        modelToView(context, context.get(keypath));
      }.bind(this),


      // Checked
      // Syntax: `bind-checked="keypath"`
      // Direction: Model-to-View, View-to-Model
      bindChecked: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var keypath = attrValue;
        var modelEvents = 'change:' + keypath;
        var viewEvents = 'change';

        // Context
        var context = this.getContext({
          model: options.model,
          view: $bindEl.attr('bind-checked-context')
        });

        // Remove attribute
        $bindEl.removeAttr(attrName);

        // Binding function
        var modelToView = function(model, value) {
          // Eval if value is a function
          if (_.isFunction(value)) {
            value = value.call(model);
          }

          value = Boolean(value);

          if ($bindEl.prop('checked') !== value) {
            $bindEl.prop('checked', value);
          }
        }.bind(this);

        var viewToModel = function(e) {
          var value = $bindEl.prop('checked');
          value = Boolean(value);

          if (!_.isFunction(context.get(keypath))) {
            context.set(keypath, value);
          }
        }.bind(this);

        // Store binding for removal later
        bindings.push({
          object: context,
          events: modelEvents,
          handler: modelToView
        });

        // Store binding for removal later
        bindings.push({
          object: $bindEl,
          events: viewEvents,
          handler: viewToModel
        });


        // Bind view-to-model
        $bindEl.on(viewEvents, viewToModel);


        // Bind model-to-view
        context.on(modelEvents, modelToView);
        modelToView(context, context.get(keypath));
      }.bind(this),


      // Visible/Hidden
      // Syntax: `bind-visible="keypath"` and `bind-hidden="keypath"`
      // Direction: Model-to-View
      bindVisibleAndHidden: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var keypath = attrValue;
        var modelEvents = 'change:' + keypath;

        // Context
        var context = this.getContext({
          model: options.model,
          view: $bindEl.attr('bind-visible-context') || $bindEl.attr('bind-hidden-context')
        });

        // Remove attribute
        $bindEl.removeAttr(attrName);

        var modelToView = function(model, value) {
          // Eval if value is a function
          if (_.isFunction(value)) {
            value = value.call(model);
          }

          value = Boolean(value);

          if (attrName === 'bind-hidden') {
            value = !value;
          }

          $bindEl.toggle(value);
        }.bind(this);

        // Store binding for removal later
        bindings.push({
          object: context,
          events: modelEvents,
          handler: modelToView
        });


        // Bind model-to-view
        context.on(modelEvents, modelToView);
        modelToView(context, context.get(keypath));
      }.bind(this),


      // Enable/Disable
      // Syntax: `bind-enabled="keypath"` and `bind-disabled="keypath"`
      // Direction: Model-to-View
      bindEnableAndDisable: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var keypath = attrValue;
        var modelEvents = 'change:' + keypath;

        // Context
        var context = this.getContext({
          model: options.model,
          view: $bindEl.attr('bind-enabled-context') || $bindEl.attr('bind-disabled-context')
        });

        // Remove attribute
        $bindEl.removeAttr(attrName);

        var modelToView = function(model, value) {
          // Eval if value is a function
          if (_.isFunction(value)) {
            value = value.call(model);
          }

          value = Boolean(value);

          if (attrName === 'bind-disabled') {
            value = !value;
          }

          $bindEl.prop('disabled', !value);
        }.bind(this);

        // Store binding for removal later
        bindings.push({
          object: context,
          events: modelEvents,
          handler: modelToView
        });


        // Bind model-to-view
        context.on(modelEvents, modelToView);
        modelToView(context, context.get(keypath));
      }.bind(this),


      // Click/Submit
      // Syntax: `bind-click="fn"` and `bind-submit="fn"`
      // Direction: N/A
      // `context` is ALWAYS the `view`
      bindClickAndSubmit: function(bindEl, attrName, attrValue) {
        var $bindEl = $(bindEl);
        var fn = attrValue;
        var viewEvents = (attrName === 'bind-submit') ? 'submit' : 'click';

        // Override context
        var context = this;

        // If a context keypath is provided, override the context relative to the view
        if ($bindEl.attr('bind-click-context')) {
          context = this[$bindEl.attr('bind-click-context')];
        }
        if ($bindEl.attr('bind-submit-context')) {
          context = this[$bindEl.attr('bind-submit-context')];
        }

        // Remove attribute
        $bindEl.removeAttr(attrName);

        if (!_.isFunction(context[fn])) {
          return;
        }

        var bindFn = function(e) {
          context[fn].call(context, e, options);
        }.bind(this);

        // Store binding for removal later
        bindings.push({
          object: $bindEl,
          events: viewEvents,
          handler: bindFn
        });

        // Initial binding
        $bindEl.on(viewEvents, bindFn);
      }.bind(this),
    };


    // Parse DOM for bindings
    // Get all `bind elements` that match the `binding attributes`
    var $bindEls = $.merge($el, $el.find('*'));
    $bindEls = $bindEls.filter(function(index, el) {
      return !_.isEmpty(this.getBindAttributes(el));
    }.bind(this))
      .not('[bind-each] *')
      .not('[bind-if] *')
      .not('[bind-unless] *');

    // Loop
    // Shift all `bind elements` until empty
    // Bind them in order
    while ($bindEls.length > 0) {
      var bindEl = $bindEls.get(0);
      $bindEls.splice(0, 1);

      // This should not happen
      if (!bindEl) {
        return;
      }

      // All other bindings
      var bindAttrs = [];
      $.each(bindEl.attributes, function(attrIndex, attr) {
        bindAttrs.push({
          name: attr.name,
          value: attr.value
        });
      }.bind(this));

      // Map them to a `binding handler`
      _.each(bindAttrs, function(bindAttr) {
        switch (bindAttr.name) {
          case 'bind-each':
            fns.bindEach.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-array':
            fns.bindArray.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-with':
            fns.bindWith.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-if':
            fns.bindIfUnless.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-unless':
            fns.bindIfUnless.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-text':
            fns.bindTextAndHtml.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-html':
            fns.bindTextAndHtml.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-val':
            fns.bindVal.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-checked':
            fns.bindChecked.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-visible':
            fns.bindVisibleAndHidden.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-hidden':
            fns.bindVisibleAndHidden.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-enabled':
            fns.bindEnableAndDisable.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-disabled':
            fns.bindEnableAndDisable.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-click':
            fns.bindClickAndSubmit.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          case 'bind-submit':
            fns.bindClickAndSubmit.call(this, bindEl, bindAttr.name, bindAttr.value);
            break;
          default:
            // Catch all `bind-attr-*` bindings
            // Map them to the `bindAttr` handler
            var regexAttr = /^bind-attr-.+$/i;
            if (regexAttr.test(bindAttr.name)) {
              fns.bindAttr.call(this, bindEl, bindAttr.name, bindAttr.value);
            }
            break;
        }
      }.bind(this));
    }


    // End bindings
    if (_.isUndefined(options.index) && bindings.length > 0) {
      Woodhouse.log("View: %s, Added %d parent bindings", this.cid, bindings.length);
    }


    // Return all bindings to be released later
    return bindings;
  },


  // Removes all bindings bound with the `bind-*` attribute from current view
  // Should only be called with the view is being cleaned up
  removeBindings: function(bindings) {
    var count = 0,
      isChild = false;

    if (bindings) {
      isChild = true;
    } else {
      bindings = this.bindings || [];
    }

    var binding;
    while (binding = bindings.shift()) {
      if (binding.object && _.isFunction(binding.object.off)) {
        binding.object.off(binding.events, binding.handler);
      }
      count += 1;
    }

    if (count > 0) {
      if (isChild) {
        Woodhouse.log("View: %s, Removed %d child bindings", this.cid, count);
      } else {
        Woodhouse.log("View: %s, Removed %d parent bindings", this.cid, count);
      }
    }
  },

  // TODO
  // NEEDS A TEST
  // This is intended to be called if HTML is injected into the DOM
  // after the initial render of the view. (for ex. using jquery)
  appendBindings: function() {
    var appendedBindings = this.addBindings({
      el: this.$el,
      model: this.model,
      collection: this.collection
    }) || [];
    this.bindings = this.bindings.concat(appendedBindings);
  },


  getBindAttributes: function(node) {
    var attrs = {};
    var regex = /^bind\-(.+)$/;

    if (!node.attributes) {
      return attrs;
    }

    $.each(node.attributes, function(index, attr) {
      if (regex.test(attr.nodeName)) {
        attrs[attr.nodeName] = attr.nodeValue;
      }
    });

    return attrs;
  },

  // View Handling
  // ---
  //
  // Forward all subview events to super view
  // Inspired by Marionette
  forwardChildViewEvents: function(view) {
    var prefix = "subview";

    this.listenTo(view, "all", function() {
      var args = Array.prototype.slice.call(arguments);
      var event = prefix + ":" + args.shift();

      this.trigger(event, args);
    }, this);

    return this;
  },

  // Render should be able to be called multiple times without side effects.
  // If the view has been rendered before, it will cleanup listeners/bindings and remove subviews recursively
  // Render will add listeners/bindings
  render: function(options) {
    Woodhouse.log("Rendering a view", this.cid);

    options = options || {};
    _.defaults(options, {});

    // Flag to determine if the view has been rendered before
    this.isRendered = this.isRendered || false;

    // Cleanup the current view if it has been previous rendered
    if (this.isRendered) {
      // Cleanup subviews, listeners, and bindings
      this.cleanup();
    }

    // This method gets called BEFORE render
    if (_.isFunction(this.onBeforeRender)) {
      this.onBeforeRender();
    }

    // Insert view into the DOM at el
    if (_.isFunction(this.template)) {
      this.$el.html(this.evaluateTemplate(this.template));
    }

    if (options.animate) {
      this.$el.hide()
        .show("fast");
    } else {
      this.$el.show();
    }

    // Add any model <-> view bindings
    this.bindings = this.addBindings({
      el: this.$el,
      model: this.model,
      collection: this.collection
    }) || [];

    this.delegateEvents.call(this);

    // Set view as rendered
    this.isRendered = true;

    // This method gets called AFTER render
    // This is a good place to add subviews
    if (_.isFunction(this.onRender)) {
      this.onRender();
    }

    return this;
  },

  cleanup: function() {
    // Remove subviews
    this.removeSubviews();

    // Remove any model <-> view bindings
    this.removeBindings();
    if (this.childBindings) {
      this.removeBindings(this.childBindings);
    }

    this.undelegateEvents.call(this);

    // Stop listening to any listenTo events
    this.stopListening();
  },

  // Remove will cleanup any listeners/bindings and remove subviews recursively
  remove: function(options) {
    Woodhouse.log("Removing a view", this.cid);

    options = options || {};
    _.defaults(options, {});

    // This method gets called BEFORE remove
    if (_.isFunction(this.onBeforeRemove)) {
      this.onBeforeRemove();
    }

    // Cleanup subviews, listeners, and bindings
    this.cleanup();

    // Remove current view el from the DOM
    var duration = 0;
    if (options.animate) {
      duration = "fast";
    }
    this.$el.hide(duration, function() {
      this.$el.remove();
    }.bind(this));

    // Set view as NOT rendered
    this.isRendered = false;

    // This method gets called AFTER remove
    if (_.isFunction(this.onRemove)) {
      this.onRemove();
    }

    return this;
  },

  // Adds a subview to the current view
  // Removed when parentView.removeSubviews is called
  // Removed when parentView.removeSubview is called
  addSubview: function(view, options) {
    if (!view) {
      return view;
    }

    options = options || {};
    _.defaults(options, {
      render: true
    });

    // Add view to parent's subviews
    this.subviews = this.subviews || [];
    this.subviews.push(view);

    // Set the view's superview
    view.superview = this;

    // Set the view's el if provided
    if (options.el) {
      if (options.append) {
        $(options.el)
          .append(view.el);
      } else {
        view.setElement.call(view, options.el);
      }
    }

    // Render new subview
    if (options.render) {
      view.render.call(view, options);
    }

    // Foward child view events to parent
    this.forwardChildViewEvents(view);

    return view;
  },

  // Removes a view from it's superview
  removeFromSuperview: function() {
    if (this.superview) {
      var index = _.indexOf(this.superview.subviews, this);
      this.superview.subviews.splice(index, 1);
    }

    return this;
  },

  removeSubview: function(view) {
    view.removeFromSuperview();
    view.remove();

    return this;
  },

  // Removes any subviews associated with this view which will in-turn remove any subviews of those views
  removeSubviews: function() {
    if (this.subviews) {
      _.invoke(this.subviews, 'remove');
      this.subviews = [];
    }

    return this;
  },

  // Cross browser implementation of preventDefault
  preventDefault: function(e) {
    if (e) {
      // prevent default action
      if (typeof e.preventDefault === "function") {
        e.preventDefault();
      }
      e.returnValue = false;
    }
  },

  // Cross browser implementation of stopPropagation
  stopPropagation: function(e) {
    if (e) {
      // no bubble
      if (typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      e.cancelBubble = true;
    }
  },

  // Cross browser implementation of preventDefault and stopPropagation
  preventDefaultStopPropagation: function(e) {
    this.preventDefault(e);
    this.stopPropagation(e);
  },


  // Marionette.bindEntityEvents & unbindEntityEvents
  // ---
  //
  // These methods are used to bind/unbind a backbone "entity" (collection/model)
  // to methods on a target object.
  //
  // The first parameter, `target`, must have a `listenTo` method from the
  // EventBinder object.
  //
  // The second parameter is the entity (Backbone.Model or Backbone.Collection)
  // to bind the events from.
  //
  // The third parameter is a hash of { "event:name": "eventHandler" }
  // configuration. Multiple handlers can be separated by a space. A
  // function can be supplied instead of a string handler name.

  // Bind the event to handlers specified as a string of
  // handler names on the target object
  _bindFromStrings: function(target, entity, evt, methods) {
    var methodNames = methods.split(/\s+/);

    _.each(methodNames, function(methodName) {

      var method = target[methodName];
      if (!method) {
        Woodhouse.throwError("Method '" + methodName + "' was configured as an event handler, but does not exist.");
      }

      target.listenTo(entity, evt, method, target);
    });
  },

  // Bind the event to a supplied callback function
  _bindToFunction: function(target, entity, evt, method) {
    target.listenTo(entity, evt, method, target);
  },

  // Bind the event to handlers specified as a string of
  // handler names on the target object
  _unbindFromStrings: function(target, entity, evt, methods) {
    var methodNames = methods.split(/\s+/);

    _.each(methodNames, function(methodName) {
      var method = target[methodName];
      target.stopListening(entity, evt, method, target);
    });
  },

  // Bind the event to a supplied callback function
  _unbindToFunction: function(target, entity, evt, method) {
    target.stopListening(entity, evt, method, target);
  },


  // Loop all bindings
  _iterateEvents: function(target, entity, bindings, functionCallback, stringCallback) {
    if (!entity || !bindings) {
      return;
    }

    // allow the bindings to be a function
    if (_.isFunction(bindings)) {
      bindings = bindings.call(target);
    }

    // iterate the bindings and bind them
    _.each(bindings, function(methods, evt) {
      // allow for a function as the handler,
      // or a list of event names as a string
      if (_.isFunction(methods)) {
        functionCallback(target, entity, evt, methods);
      } else {
        stringCallback(target, entity, evt, methods);
      }
    });
  },

  bindEntityEvents: function(target, entity, bindings) {
    this._iterateEvents(target, entity, bindings, this._bindToFunction, this._bindFromStrings);
  },

  unbindEntityEvents: function(target, entity, bindings) {
    this._iterateEvents(target, entity, bindings, this._unbindToFunction, this._unbindFromStrings);
  },

  // Extending to handle custom event observers
  delegateEvents: function(events) {
    Backbone.View.prototype.delegateEvents.apply(this, arguments);

    this.unbindEntityEvents(this, this.model, this.modelEvents);
    this.unbindEntityEvents(this, this.collection, this.collectionEvents);
    this.bindEntityEvents(this, this.model, this.modelEvents);
    this.bindEntityEvents(this, this.collection, this.collectionEvents);
  },

  undelegateEvents: function() {
    Backbone.View.prototype.undelegateEvents.apply(this, arguments);

    this.unbindEntityEvents(this, this.model, this.modelEvents);
    this.unbindEntityEvents(this, this.collection, this.collectionEvents);
  }
});
