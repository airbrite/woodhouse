module.exports = function(grunt) {
  // Load all grunt tasks
  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    meta: {
      testFiles: ['test/**/*.js', '!test/vendor/**'],
      libFiles: ['src/**/*.js'],
      distFiles: ['dist/**/*.js']
    },
    karma: {
      options: {
        configFile: 'karma.conf.js'
      },
      unit: {
        background: true,
        reporter: 'dots'
      },
      continuous: {
        singleRun: true,
        browsers: ['PhantomJS']
      }
    },
    jshint: {
      options: {
        jshintrc: true
      },
      files: ['<%= meta.libFiles %>']
    },
    broccoli: {
      dist: {
        dest: 'dist'
      }
    },
    watch: {
      karma: {
        files: ['<%= meta.testFiles %>'],
        // Make karma server is running: karma:unit:start
        tasks: ['karma:unit:run']
      },
      dev: {
        files: ['<%= meta.libFiles %>'],
        tasks: ['jshint', 'broccoli:dist:build', 'karma:unit:run']
      }
    }
  });

  // Default task(s).
  grunt.registerTask('default', ['ci']);

  grunt.registerTask('dev', ['jshint', 'karma:unit:start', 'watch']);
  grunt.registerTask('ci', ['jshint', 'karma:continuous']);

};
