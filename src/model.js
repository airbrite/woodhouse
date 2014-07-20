// Woodhouse.Model
// ---
// Extends Backbone.DeepModel and adds support for:
// Backbone.Model.oldset = Backbone.Model.prototype.set;
//
// - relations
// - computed properties

Woodhouse.Model = Backbone.Model.extend({
  constructor: function(attributes, options) {
    var attrs = attributes || {};
    options || (options = {});
    this.cid = _.uniqueId('c');
    this.attributes = {};
    if (options.collection) this.collection = options.collection;
    if (options.parse) attrs = this.parse(attrs, options) || {};
    attrs = _.defaults({}, attrs, _.result(this, 'defaults'));

    // Automatically create empty relations
    if (this.relations) {
      _.each(this.relations, function(relation) {
        if (!_.has(attrs, relation.key)) {
          attrs[relation.key] = relation.type === 'model' ? {} : [];
        }
      }.bind(this));
    }

    this.set(attrs, options);
    this.changed = {};
    this.initialize.apply(this, arguments);
  },

  // Tested and working with both shallow and deep keypaths
  get: function(attr) {
    if (!_.isString(attr)) {
      return undefined;
    }

    return this.getDeep(this.attributes, attr);
  },

  getDeep: function(attrs, attr) {
    var keys = attr.split('.');
    var isModel, isCollection;
    var key;
    var val = attrs;
    var context = this;

    for (var i = 0, n = keys.length; i < n; i++) {
      // determine if ??? is backbone model or collection
      isModel = val instanceof Backbone.Model;
      isCollection = val instanceof Backbone.Collection;

      // get key
      key = keys[i];

      // Hold reference to the context when diving deep into nested keys
      if (i > 0) {
        context = val;
      }

      // get value for key
      if (isCollection) {
        val = val.models[key];
      } else if (isModel) {
        val = val.attributes[key];
      } else {
        val = val[key];
      }

      // value for key does not exist
      // break out of loop early
      if (_.isUndefined(val) || _.isNull(val)) {
        break;
      }
    }

    // Eval computed properties that are functions
    if (_.isFunction(val)) {
      // Call it with the proper context (see above)
      val = val.call(context);
    }

    return val;
  },

  // Custom modified Backbone.Model.set to support relations
  set: function(key, val, options) {
    var attr, attrs, unset, changes, silent, changing, prev, current;
    if (_.isUndefined(key) || _.isNull(key)) {
      return this;
    }

    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (typeof key === 'object') {
      attrs = key;
      options = val;
    } else {
      (attrs = {})[key] = val;
    }

    options || (options = {});

    // Run validation.
    if (!this._validate(attrs, options)) return false;

    // Extract attributes and options.
    unset = options.unset;
    silent = options.silent;
    changes = [];
    changing = this._changing;
    this._changing = true;

    if (!changing) {
      this._previousAttributes = this.deepClone(this.attributes);
      this.changed = {};
    }
    current = this.attributes, prev = this._previousAttributes;

    // Check for changes of `id`.
    if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

    // For each `set` attribute, update or delete the current value.
    for (attr in attrs) {
      val = attrs[attr];

      if (!this.compareAttribute(current, attr, val)) {
        changes.push(attr);

        // Add any nested object key changes
        if (_.isObject(val) && !_.isArray(val)) {
          var nestedChanges = _.keys(this.objToPaths(val));
          _.each(nestedChanges, function(nestedChange) {
            changes.push(attr + '.' + nestedChange);
          });
        }
      }
      if (!this.compareAttribute(prev, attr, val)) {
        this.setAttribute(this.changed, attr, val, {
          changed: true
        });
      } else {
        this.unsetAttribute(this.changed, attr);
      }
      unset ? this.unsetAttribute(current, attr) : this.setAttribute(current, attr, val, {});
    }

    // Trigger all relevant attribute changes.
    var alreadyTriggered = {};
    if (!silent) {
      if (changes.length) this._pending = options;
      for (var i = 0, l = changes.length; i < l; i++) {
        if (!_.has(alreadyTriggered, changes[i])) {
          this.trigger('change:' + changes[i], this, this.getDeep(current, changes[i]), options);
          Woodhouse.log("model.%s set.trigger -> change:%s -> %s", this.cid, changes[i], JSON.stringify(this.getDeep(current, changes[i])));
          alreadyTriggered[changes[i]] = true;
        }

        // Trigger change events for parent keys with wildcard (*) notation
        var keys = changes[i].split('.');
        for (var n = keys.length - 1; n > 0; n--) {
          var parentKey = _.first(keys, n).join('.');
          var wildcardKey = parentKey + '.' + '*';

          if (!_.has(alreadyTriggered, wildcardKey)) {
            this.trigger('change:' + wildcardKey, this, this.getDeep(current, parentKey), options);
            Woodhouse.log("model.%s set.trigger -> change:%s -> %s", this.cid, wildcardKey, JSON.stringify(this.getDeep(current, parentKey)));
            alreadyTriggered[wildcardKey] = true;
          }
        }
      }
    }

    // Computed properties
    this.computedPropertyEvents(attrs);

    // You might be wondering why there's a `while` loop here. Changes can
    // be recursively nested within `"change"` events.
    if (changing) return this;
    if (!silent) {
      while (this._pending) {
        options = this._pending;
        this._pending = false;
        this.trigger('change', this, options);
        Woodhouse.log("model.%s set.trigger -> change", this.cid);
      }
    }
    this._pending = false;
    this._changing = false;

    return this;
  },

  objToPaths: function(obj) {
    var ret = {};
    var separator = '.';

    _.each(obj, function(val, key) {
      if (_.isObject(val) && !_.isArray(val) && !_.isEmpty(val)) {
        //Recursion for embedded objects
        var obj2 = this.objToPaths(val);

        for (var key2 in obj2) {
          var val2 = obj2[key2];

          ret[key + separator + key2] = val2;
        }
      } else {
        ret[key] = val;
      }
    }.bind(this));

    return ret;
  },

  unflattenAttribute: function(attr, attrs) {
    var keys = attr.split('.');
    if (keys.length > 1) {
      var obj = {};
      var result = obj;
      for (var i = 0, n = keys.length; i < n; i++) {
        var key = keys[i];

        if (i === n - 1) {
          result[keys[i]] = attrs[attr];
        } else {
          //Create the child object if it doesn't exist, or isn't an object
          if (typeof result[key] === 'undefined' || !_.isObject(result[key])) {
            var nextKey = keys[i + 1];

            // create array if next key is integer, else create object
            result[key] = /^\d+$/.test(nextKey) ? [] : {};
          }

          //Move onto the next part of the path
          result = result[key];
        }
      }
      delete attrs[attr];
      _.extend(attrs, obj);
      return _.first(keys);

    }
    return attr;
  },

  compareAttribute: function(attrs, attr, val) {
    var oldVal = this.getDeep(attrs, attr);

    if (oldVal instanceof Backbone.Model) {
      oldVal = oldVal.attributes;
    } else if (oldVal instanceof Backbone.Collection) {
      oldVal = oldVal.models;
    }

    return _.isEqual(oldVal, val);
  },

  setAttribute: function(attrs, attr, val, options) {
    var keys = attr.split('.');
    var key;
    var result = attrs;
    var context = this;
    var relation;

    for (var i = 0, n = keys.length; i < n; i++) {
      // Hold reference to the context when diving deep into nested keys
      if (i > 0) {
        context = result;
      }

      // get key
      key = keys[i];

      // Look for a potential relation
      if (!options.changed && context.relations) {
        relation = _.findWhere(context.relations, {
          key: key
        });
      } else {
        relation = null;
      }

      // If the current root is a backbone model
      // The next level is under attributes
      if (result.attributes) {
        result = result.attributes;
      } else if (result.models) {
        result = result.models;
      }

      // last key
      if (i === n - 1) {
        if (relation && relation.type === 'model') {
          if (val.attributes) {
            val = val.attributes;
          }

          if (!(result[key] instanceof relation.model)) {
            result[key] = new relation.model(val);
          } else {
            result[key].set(val);
            // result[key].attributes = val;
          }
        } else if (relation && relation.type === 'collection') {
          if (val.models) {
            val = val.models;
          }

          if (!(result[key] instanceof relation.collection)) {
            result[key] = new relation.collection(val);
          } else {
            result[key].reset(val);
          }
        } else {
          if (result[key] && _.isFunction(result[key].set)) {
            result[key].set(val);
          } else {
            result[key] = val;
          }
        }
      } else { // not last key
        // if key is undefined and relation exists, create an empty model
        // if key is undefined and no relation exists, create an empty object
        if (_.isUndefined(result[key]) || _.isNull(result[key])) {
          result[key] = relation ? new relation.model() : {};
        }

        // dive another level
        result = result[key];
      }
    }
  },

  unsetAttribute: function(attrs, attr) {
    var isModel, isCollection;
    var keys = attr.split('.');
    var key;
    var val = attrs;
    var isLastKey = false;

    for (var i = 0, n = keys.length; i < n; i++) {
      isModel = val instanceof Backbone.Model;
      isCollection = val instanceof Backbone.Collection;

      key = keys[i];

      if (i === n - 1) {
        isLastKey = true;
      }

      if (isCollection) {
        if (isLastKey) {
          val.remove(val.models[key]);
        } else {
          val = val.models[key];
        }
      } else if (isModel) {
        if (isLastKey) {
          delete val.attributes[key];
        } else {
          val = val.attributes[key];
        }
      } else {
        if (isLastKey) {
          delete val[key];
        } else {
          val = val[key];
        }
      }

      // value for key does not exist
      // break out of loop early
      if (_.isUndefined(val) || _.isNull(val)) {
        break;
      }
    }
  },

  hasChanged: function(attr) {
    if (_.isUndefined(attr) || _.isNull(attr)) {
      return !_.isEmpty(this.changed);
    }
    return !_.isUndefined(this.getDeep(this.changed, attr));
  },

  changedAttributes: function(diff) {
    if (!diff) return this.hasChanged() ? this.deepClone(this.changed) : false;
    var val, changed = false;
    var old = this._changing ? this._previousAttributes : this.attributes;
    for (var attr in diff) {
      if (_.isEqual(old[attr], (val = diff[attr]))) continue;
      (changed || (changed = {}))[attr] = val;
    }
    return changed;
  },

  // Get the previous value of an attribute, recorded at the time the last
  // `"change"` event was fired.
  previous: function(attr) {
    if (_.isUndefined(attr) || _.isNull(attr) || !this._previousAttributes) {
      return null;
    }

    return this.getDeep(this._previousAttributes, attr);
  },

  // Get all of the attributes of the model at the time of the previous
  // `"change"` event.
  previousAttributes: function() {
    return this.deepClone(this._previousAttributes);
  },

  // Attach event listeners to the raw properties of the computed property
  computedPropertyEvents: function(attrs) {
    var attr;
    for (attr in attrs) {
      var events = "";
      var val = attrs[attr];
      if (!_.isFunction(val)) {
        continue;
      }

      _.each(val.properties, function(property) {
        var key = attr;
        var fn = val;
        var entity = this.get(property);
        if (entity instanceof Backbone.Collection) {
          events = "change reset add remove sort";
        } else if (entity instanceof Backbone.Model) {
          events = "change";
        } else {
          entity = this;
          events = "change:" + property;
        }

        this.listenTo(entity, events, function() {
          var value = fn.call(this);
          this.trigger('change:' + key, this, value);
        }.bind(this));
      }.bind(this));
    }
  },

  // Borrowed from backbone-deep-model
  deepClone: function(obj) {
    var func, isArr;
    if (!_.isObject(obj) || _.isFunction(obj)) {
      return obj;
    }
    if (obj instanceof Backbone.Collection || obj instanceof Backbone.Model) {
      return obj;
    }
    if (_.isDate(obj)) {
      return new Date(obj.getTime());
    }
    if (_.isRegExp(obj)) {
      return new RegExp(obj.source, obj.toString().replace(/.*\//, ""));
    }
    isArr = _.isArray(obj || _.isArguments(obj));
    func = function(memo, value, key) {
      if (isArr) {
        memo.push(this.deepClone(value));
      } else {
        memo[key] = this.deepClone(value);
      }
      return memo;
    }.bind(this);
    return _.reduce(obj, func, isArr ? [] : {});
  },

  // Override toJSON to support relations and computed properties
  toJSON: function(options) {
    var json = this.deepClone(this.attributes);

    // Convert all relations from models/collections to objects/arrays
    if (this.relations) {
      _.each(this.relations, function(relation) {
        var object;

        // Look for embedded relations
        if (_.has(json, relation.key)) {
          // If the value is a model or collection and has a toJSON function
          if (json[relation.key] instanceof Backbone.Model || json[relation.key] instanceof Backbone.Collection) {
            json[relation.key] = json[relation.key].toJSON(options);
          }
        } else {
          if (relation.type === 'collection') {
            json[relation.key] = [];
          } else if (relation.type === 'model') {
            json[relation.key] = {};
          }
        }
      }.bind(this));
    }

    // Remove computed properties from output
    _.each(json, function(val, key) {
      if (_.isFunction(val)) {
        delete json[key];
      }
    });

    return json;
  }
});
