var panelApp = angular.module('panelApp', []);


panelApp.directive('mtree', function($compile) {
  return {
    restrict: 'E',
    terminal: true,
    scope: {
      val: 'accessor',
      edit: 'accessor',
      inspect: 'accessor'
    },
    link: function (scope, element, attrs) {
      // this is more complicated then it should be
      // see: https://github.com/angular/angular.js/issues/898
      element.append(
        '<div class="scope-branch">' +
          '<a href ng-click="inspect()()">Scope ({{val().id}})</a> | ' +
          '<a href ng-click="showState = !showState">toggle</a>' +
          '<div ng-class="{hidden: showState}">' +
            '<ul>' +
              '<li ng-repeat="(key, item) in val().locals">' +
                '{{key}}' +
                '<input ng-model="item" ng-change="edit()()">' +
              '</li>' +
            '</ul>' +
            '<div ng-repeat="child in val().children">' +
              '<mtree val="child" inspect="inspect()" edit="edit()"></mtree>' +
            '</div>' +
          '</div>' +
        '</div>');

      $compile(element.contents())(scope.$new());
    }
  };
});

panelApp.filter('first', function () {
  return function (input, output) {
    return input.split("\n")[0];
  };
});

panelApp.directive('wtree', function($compile) {
  return {
    restrict: 'E',
    terminal: true,
    scope: {
      val: 'accessor',
      edit: 'accessor',
      inspect: 'accessor'
    },
    link: function (scope, element, attrs) {
      // this is more complicated then it should be
      // see: https://github.com/angular/angular.js/issues/898
      element.append(
        '<div class="scope-branch">' +
          '<a href ng-click="inspect()()">Scope ({{val().id}})</a> | ' +
          '<a href ng-click="showState = !showState">toggle</a>' +
          '<div ng-class="{hidden: showState}">' +
            '<ul>' +
              '<li ng-repeat="item in val().watchers">' +
                '<a href ng-class="{hidden: item.split(\'\n\').length < 2}" ng-click="showState = !showState">toggle</a> ' +
                '<span ng-class="{hidden: showState || item.split(\'\n\').length < 2}">{{item | first}} ...</span>' +
                '<pre ng-class="{hidden: !showState && item.split(\'\n\').length > 1}">' +
                  '{{item}}' +
                '</pre>' +
              '</li>' +
            '</ul>' +
            '<div ng-repeat="child in val().children">' +
              '<wtree val="child" inspect="inspect()" edit="edit()"></wtree>' +
            '</div>' +
          '</div>' +
        '</div>');

      $compile(element.contents())(scope.$new());
    }
  };
});

panelApp.value('chromeExtension', {
  sendRequest: function (requestName, cb) {
    chrome.extension.sendRequest({
      script: requestName,
      tab: chrome.devtools.inspectedWindow.tabId
    }, cb || function () {});
  },

  // evaluates in the context of a window
  //written because I don't like the API for chrome.devtools.inspectedWindow.eval;
  // passing strings instead of functions are gross.
  eval: function (fn, args, cb) {
    // with two args
    if (!cb && typeof args === 'function') {
      cb = args;
      args = {};
    } else if (!args) {
      args = {};
    }
    chrome.devtools.inspectedWindow.eval('(' +
      fn.toString() +
      '(window, ' +
      JSON.stringify(args) +
      '));', cb);
  }
});

panelApp.factory('appContext', function(chromeExtension) {
  return {
    executeOnScope: function(scopeId, fn, args, cb) {
      if (typeof args === 'function') {
        cb = args;
        args = {};
      } else if (!args) {
        args = {};
      }
      args.scopeId = scopeId;
      args.fn = fn.toString();

      chromeExtension.eval("function (window, args) {" +
        "window.$('.ng-scope').each(function (i, elt) {" +
          "var $scope = angular.element(elt).scope();" +
          "if ($scope.$id === args.scopeId) {" +
            "(" +
              args.fn +
            "($scope, elt, args));" +
          "}" +
        "});" +
      "}", args, cb);
    },
    getDebugInfo: function (callback) {
      chromeExtension.eval(function (window) {

        var rootIds = [];
        var rootScopes = [];

        // Detect whether or not this is an AngularJS app
        if (!window.angular) {
          return {
            err: 'Not an AngularJS App'
          };
        }

        var elts = window.document.getElementsByClassName('ng-scope');
        var i;
        for (i = 0; i < elts.length; i++) {
          (function (elt) {
            var $scope = window.angular.element(elt).scope();

            while ($scope.$parent) {
              $scope = $scope.$parent;
            }
            if ($scope === $scope.$root && rootScopes.indexOf($scope) === -1) {
              rootScopes.push($scope);
              rootIds.push($scope.$id);
            }
          }(elts[i]));
        }

        var getScopeTree = function (scope) {
          var tree = {};
          var getScopeNode = function (scope, node) {

            // copy scope's locals
            node.locals = {};

            for (var i in scope) {
              if (!(i[0] === '$' /* && i[1] === '$' */) && scope.hasOwnProperty(i) && i !== 'this') {
                //node.locals[i] = scope[i];
                if (typeof scope[i] === 'number' || typeof scope[i] === 'boolean') {
                  node.locals[i] = scope[i];
                } else if (typeof scope[i] === 'string') {
                  node.locals[i] = '"' + scope[i] + '"';
                } else {
                  //node.locals[i] = ': ' + typeof scope[i];
                  node.locals[i] = '';
                }
              }
            }

            node.id = scope.$id;

            //console.log(window.__ngDebug);
            
            if (window.__ngDebug) {
              node.watchers = __ngDebug.watchers[scope.$id];
            }

            // recursively get children scopes
            node.children = [];
            var child;
            if (scope.$$childHead) {
              child = scope.$$childHead;

              do {
                getScopeNode(child, node.children[node.children.length] = {});
              } while (child = child.$$nextSibling);
            }
          };

          getScopeNode(scope, tree);
          return tree;
        };

        var trees = {};
        rootScopes.forEach(function (root) {
          trees[root.$id] = getScopeTree(root);
        });

        return {
          roots: rootIds,
          trees: trees
        };
      },
      callback);
    },

    getTimelineInfo: function (cb) {
      chromeExtension.eval(function (window) {
        return window.__ngDebug.timeline;
      }, cb);
    },

    getHistogramInfo: function (cb) {
      chromeExtension.eval(function (window) {
        return window.__ngDebug.watchExp;
      }, function (info) {
        var out = [];
        for (exp in info) {
          if (info.hasOwnProperty(exp)) {
            out.push({
              name: exp,
              calls: info[exp]
            });
          }
        }
        cb(out);
      });
    },

    clearTimeline: function (cb) {
      chromeExtension.eval(function (window) {
        window.__ngDebug.timeline = [];
      }, cb);
    },
    
    refresh: function (cb) {
      chromeExtension.eval(function (window) {
        window.document.location.reload();
      }, cb);
    },

    // takes a bool
    debug: function (setting) {
      chromeExtension.sendRequest('debug-' + setting, function () {
        chromeExtension.eval(function (window) {
          window.document.location.reload();
        });
      });
    },

    // takes a bool
    setLog: function (setting) {
      chromeExtension.eval('function (window) {' +
        'window.__ngDebug.log = ' + setting.toString() + ';' +
      '}');
    },

    watchRefresh: function (cb) {
      var port = chrome.extension.connect();
      port.postMessage({
        action: 'register',
        inspectedTabId: chrome.devtools.inspectedWindow.tabId
      });
      port.onMessage.addListener(function(msg) {
        if (msg === 'refresh') {
          cb();
        }
      });
      port.onDisconnect.addListener(function (a) {
        console.log(a);
      });
    }
  };
});


panelApp.controller('TabCtrl', function TabCtrl($scope) {
  $scope.selectedTab = 'Model';
});


panelApp.controller('TreeCtrl', function TreeCtrl($scope, chromeExtension, appContext) {

  $scope.inspect = function () {
    var scopeId = this.val().id;

    appContext.executeOnScope(scopeId, function (scope, elt) {
      inspect(elt);
    });
  };

  $scope.edit = function () {
    appContext.executeOnScope(this.val().id, function (scope, elt, args) {
      scope[args.name] = args.value;
      scope.$apply();
    }, {
      name: this.key,
      value: JSON.parse(this.item)
    });
  };

  var updateTree = function () {
    appContext.getDebugInfo(function (info) {
      if (!info) {
        setTimeout(updateTree, 50);
        return;
      }

      $scope.$apply(function () {
        if (info.err) {
          $scope.err = info.err;
          $scope.roots = [null];
          $scope.selectedRoot = null;
          $scope.trees = {};
        } else {
          var rootIdPairs = [];
          info.roots.forEach(function (item) {
            rootIdPairs.push({
              label: item,
              value: item
            });
          });
          $scope.roots = rootIdPairs;
          if (rootIdPairs.length === 0) {
            $scope.selectedRoot = null;
          } else {
            $scope.selectedRoot = rootIdPairs[0].value;
          }
          $scope.trees = info.trees;
        }
      });
    });
  };

  updateTree();
  appContext.watchRefresh(updateTree);
});


panelApp.controller('PerfCtrl', function PerfCtrl($scope, appContext) {

  $scope.enable = false;

  $scope.timeline = [
    {
      start: 10,
      end: 20
    }, {
      start: 25,
      end: 4700
    }
  ];

  $scope.histogram = [
  {
    name: 'test',
    calls: [{
      start: 10,
      end: 20
    }]
  }
  ];

  $scope.clear = function () {
    appContext.clearTimeline();
  };

  var first = true;
  $scope.$watch('enable', function (newVal, oldVal) {

    // prevent refresh on initial pageload
    if (first) {
      first = false;
    } else {
      appContext.debug(newVal);
    }
    if (newVal) {
      //updateTimeline();
      updateHistogram();
    }
  });

  $scope.log = false;
  
  $scope.$watch('log', function (newVal, oldVal) {
    appContext.setLog(newVal);
    
    appContext.watchRefresh(function () {
      appContext.setLog(newVal);
    });
  });

  $scope.inspect = function () {
    var scopeId = this.val().id;

    appContext.executeOnScope(scopeId, function (scope, elt) {
      inspect(elt);
    });
  };

  var updateTimeline = function () {
    appContext.getTimelineInfo(function (info) {
      $scope.$apply(function () {
        $scope.timeline = info;
      });
      if ($scope.enable) {
        setTimeout(updateTimeline, 500);
      }
    });
  };

  var updateHistogram = function () {
    appContext.getHistogramInfo(function (info) {
      $scope.$apply(function () {
        info = info.sort(function (a, b) {
          return b.calls - a.calls;
        });
        var total = 0;
        info.forEach(function (elt) {
          total += elt.calls;
        });
        info.forEach(function (elt) {
          elt.calls = (100 * elt.calls / total).toPrecision(3);
        });

        $scope.histogram = info;
      });
      if ($scope.enable) {
        setTimeout(updateHistogram, 1000);
      }
    })
  }

  var updateTree = function () {
    appContext.getDebugInfo(function (info) {
      if (!info) {
        setTimeout(updateTree, 50);
        return;
      }

      $scope.$apply(function () {
        if (info.err) {
          $scope.err = info.err;
          $scope.roots = [null];
          $scope.selectedRoot = null;
          $scope.trees = {};
        } else {
          var rootIdPairs = [];
          info.roots.forEach(function (item) {
            rootIdPairs.push({
              label: item,
              value: item
            });
          });
          $scope.roots = rootIdPairs;
          if (rootIdPairs.length === 0) {
            $scope.selectedRoot = null;
          } else {
            $scope.selectedRoot = rootIdPairs[0].value;
          }
          $scope.trees = info.trees;
        }
      });
    });
  };

  updateTree();
  appContext.watchRefresh(updateTree);
});


panelApp.controller('OptionsCtrl', function OptionsCtrl($scope, appContext, chromeExtension) {

  $scope.debugger = {
    scopes: false,
    bindings: false
  };

  $scope.$watch('debugger.scopes', function (newVal, oldVal) {
    if (newVal) {
      chromeExtension.sendRequest('showScopes');
    } else {
      chromeExtension.sendRequest('hideScopes');
    }
  });

  $scope.$watch('debugger.bindings', function (newVal, oldVal) {
    if (newVal) {
      chromeExtension.sendRequest('showBindings');
    } else {
      chromeExtension.sendRequest('hideBindings');
    }
  });
});
