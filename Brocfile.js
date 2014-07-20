var pickFiles = require('broccoli-static-compiler');
var compileES6 = require('broccoli-es6-concatenator');

var relocatedTree = pickFiles('src', {
  srcDir: '/',
  destDir: 'woodhouse'
});

var compiled = compileES6(relocatedTree, {
  wrapInEval: false,
  loaderFile: 'woodhouse/lib/loader.js',
  inputFiles: [
    'woodhouse/*.js'
  ],
  outputFile: '/woodhouse.js'
});

module.exports = compiled;
