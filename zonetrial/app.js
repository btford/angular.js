'use strict';


// Declare app level module which depends on filters, and services
angular.module('myApp', ['ngRoute', 'myApp.async']).
  config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/async', {
      templateUrl: 'async/async.html',
      controller: 'AsyncController'
    }).
    when('/slowloader', {
      templateUrl: 'async/async.html',
      controller: 'AsyncController',
      resolve: {
        slow: function($timeout) {
          return $timeout(function() {}, 2000);
        }
      }
    }).
    otherwise({
      redirectTo: '/async'
    });
  }]);
