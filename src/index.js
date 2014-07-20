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

// Define and export the Woodhouse namespace
var Woodhouse = {};

// Version string
Woodhouse.VERSION = '0.2.14';

// Debug flag
Woodhouse.DEBUG = false;

// Get jquery
Woodhouse.$ = $;

// Get lodash
Woodhouse._ = _;

export default Woodhouse;
export { Model, View, CollectionView, Collection, Router };
