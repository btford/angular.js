/**
 * @license AngularJS v"NG_VERSION_FULL"
 * (c) 2010-2012 Google, Inc. http://angularjs.org
 * License: MIT
 */

// The function below is executed in the context of the inspected page.
var page_getProperties = function () {
  return window.angular && $0 ? window.angular.element($0).scope() : {};
};

chrome.
  devtools.
  panels.
  elements.
  createSidebarPane(
    "AngularJS Properties",
    function (sidebar) {
      var selectedElt;

      var updateElementProperties = function () {
        sidebar.setExpression("(" + page_getProperties.toString() + ")()");
      }

      updateElementProperties();
      chrome.devtools.panels.elements.onSelectionChanged.addListener(updateElementProperties);
    });

// Angular panel
var angularPanel = chrome.
  devtools.
  panels.
  create(
    "AngularJS",
    "angular.png",
    "panel.html");