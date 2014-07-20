// What is Woodhouse?
// ---
// Woodhouse is an extension to Backbone.
// Woodhouse adds the following things to Backbone:
// - View, Region, and Subview management (inspired by marionette.js)
// - Model-View bindings (inspired by knockout.js)
// - Model relations
// - Model computed properties
// - A better Router that aborts XHR requests when navigating

import View from './view';
import CollectionView from './collection_view';
import Collection from './collection';
import Model from './model';
import Router from './router';

import './lib/prototype_extensions';
import './lib/plugins';

// Required dependencies
var missingDeps = [];
if (Backbone === undefined) {
  missingDeps.push('Backbone');
}
if (_ === undefined) {
  missingDeps.push('_');
}
if ($ === undefined) {
  missingDeps.push('$');
}
if (missingDeps.length > 0) {
  console.log('Warning! %s is undefined. Woodhouse aborted.', missingDeps.join(', '));
}

// Version string
export var VERSION = '0.2.14';

// Debug flag
export var DEBUG = false;

// Log helper
export var log = function() {
  if (!Woodhouse.DEBUG || !console) {
    return;
  }

  console.log.apply(console, arguments);
};

// Error Helper
export var throwError = function(message, name) {
  var error = new Error(message);
  error.name = name || 'Error';
  throw error;
};

// Centralized XHR pool
// Allows automatic aborting of pending XHRs when navigate is called
export var xhrs = [];
export var addXhr = function(xhr) {
  // Invalid xhr (or false)
  // Backbone sync will may return false
  if (!xhr) {
    return;
  }
  xhrs.push(xhr);

  xhr.always(function() {
    var index = _.indexOf(xhrs, this);
    if (index >= 0) {
      xhrs.splice(index, 1);
    }
  }.bind(xhr));
};

export { $, _, Model, View, Collection, CollectionView, Router };
