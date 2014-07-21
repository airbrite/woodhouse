// karma.conf.js
module.exports = function(config) {
  config.set({
    browsers: ['PhantomJS'],
    frameworks: ['qunit'],
    port: 9888,
    plugins: [
      'karma-qunit',
      'karma-phantomjs-launcher'
    ],
    files: [
      'test/vendor/underscore/underscore.js',
      'test/vendor/jquery/dist/jquery.js',
      'test/vendor/backbone/backbone.js',
      'test/vendor/almond/almond.js',
      'dist/woodhouse.js',
      'test/helpers/*.js',
      'test/*.spec.js'
    ]
  });
};
