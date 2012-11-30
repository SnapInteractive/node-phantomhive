"use strict";

/**
 * The port number to connect the bridge to
 *
 * @type {Number}
 */
var port = Array.prototype.slice.call(phantom.args, 0).pop();
/**
 * The phantomjs webpage object
 *
 * @type {WebPage}
 */
var webpage = require("webpage");
/**
 * A hash map containing all the open pages
 *
 * @type {Object}
 */
var pages = {};
/**
 * Global page uuid counter
 *
 * @type {Number}
 */
var pageuuid = 0;
/**
 * The phantomjs webpage instance that will listen on the bridge
 *
 * @type {WebPage}
 */
var controller = webpage.create();

/**
 * Send data through the bridge
 *
 * @param {Object} passthrough
 * @param {Array} args
 */
function send(passthrough, args) {
	var data = {
		page : passthrough.page,
		command_id : passthrough.command_id,
		command : passthrough.command,
		args : args || []
	};
	controller.evaluate("function(){socket.emit('exec'," + JSON.stringify(data) + ");}");
}

/**
 * Sets up a page object that we can use (new tab)
 *
 * @param {WebPage} page
 * @returns {Number}
 * @type {Number}
 */
function setup(page) {
	var id = ++pageuuid;
	// [ "onConfirm", "onPrompt" ] // todo: need user feedback
	[ "onAlert", "onCallback", "onClosing", "onConsoleMessage", "onError", "onInitialized", "onLoadFinished", "onLoadStarted", "onNavigationRequested", "onResourceRequested", "onResourceReceived", "onUrlChanged" ].forEach(function(callback) {
		page[callback] = function() {
			send({
				page : id,
				command_id : -1,
				command : callback
			}, Array.prototype.slice.call(arguments));
		};
	});
	pages[id] = page;
	return id;
}

/**
 * The callback for what happens when a console message is triggered from the bridge
 *
 * @event
 * @param {String} msg
 */
controller.onConsoleMessage = function(msg) {
	console.log("console: " + msg);
};

/**
 * Starts the communication channel with the bridge
 */
controller.open("http://127.0.0.1:" + port, function() {
});

/**
 * Event listener and delegator for events that come in through the bridge
 *
 * @event
 * @param {String}
 */
controller.onAlert = function(msg) {
	var data = JSON.parse(msg), k, j, temp;
	if (/^Phantom-/.test(data.page)) {
		switch (data.command) {
			case "createPage":
				send(data, [ setup(webpage.create()) ]);
				break;

			case "injectJs":
			case "addCookie":
			case "deleteCookie":
				// handle arrays of values
				if (Array.isArray(data.args[0])) {
					temp = [];
					data.args[0].forEach(function(args) {
						temp.push(phantom[data.command].apply(phantom, [ args ]));
					});
					send(data, temp);
				} else {
					send(data, [ phantom[data.command].apply(phantom, data.args) ]);
				}
				break;

			case "clearCookies":
				phantom[data.command].apply(phantom, data.args);
				send(data);
				break;

			case "exit":
				Object.keys(pages).forEach(function(page) {
					(pages[page].close || pages[page].release)();
				});
				send(data);
				break;

			case "done":
				phantom.exit();
				break;

			case "get":
				temp = {};
				if (typeof data.args[0] === "string") {
					send(data, [ phantom[data.args[0]] ]);
				} else {
					for (k in data.args[0]) {
						temp[k] = phantom[k];
					}
					send(data, [ temp ]);
				}
				break;

			case "set":
				if (typeof data.args[0] === "string") {
					phantom[data.args[0]] = data.args[1];
				} else {
					for (k in data.args[0]) {
						phantom[k] = data.args[0][k];
					}
				}
				send(data);
				break;

			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else if (pages[data.page]) {
		var page = pages[data.page];
		switch (data.command) {
			case "clearCookies": // ()` {void}
			case "render": // (filename)` {void}
			case "sendEvent": // (type, mouseX, mouseY)`
			case "uploadFile": // (selector, filename)`
				page[data.command].apply(page, data.args);
				send(data);
				break;

			case "close": // ()` {void}
				(page.close || page.release).apply(page, data.args);
				send(data);
				break;

			case "addCookie": // (cookie)` {boolean}
			case "deleteCookie": // (cookieName)` {boolean}
			case "injectJs": // (filename)` {boolean}
				if (Array.isArray(data.args[0])) {
					temp = [];
					data.args[0].forEach(function(args) {
						temp.push(phantom[data.command].apply(page, [ args ]));
					});
					send(data, temp);
				} else {
					send(data, [ phantom[data.command].apply(page, data.args) ]);
				}
				break;

			case "renderBase64": // (format)`
				send(data, [ page[data.command].apply(page, data.args) ]);
				break;

			case "evaluate": // (function, arg1, arg2, ...)` {object}
				/*jshint evil:true */
				var args = (data.args[1] || []).slice(0);
				args.unshift((new Function("return " + data.args[0]))());
				send(data, [ page.evaluate.apply(page, args) ]);
				break;

			case "evaluateAsync": // (function)` {void}
				/*jshint evil:true */
				page.evaluateAsync((new Function("return " + data.args[0]))());
				send(data);
				break;

			case "includeJs": // (url, callback)` {void}
				page.includeJs(data.args[0], function() {
					send(data);
				});
				break;

			case "open": // (url, callback)` {void}
				page.open(data.args[0], function(status) {
					// console.log("opening page...");
					send(data, [ status ]);
				});
				break;

			case "get":
				temp = {};
				if (typeof data.args[0] === "string") {
					send(data, [ page[data.args[0]] ]);
				} else {
					for (k in data.args[0]) {
						temp[k] = page[k];
					}
					send(data, [ temp ]);
				}
				break;

			case "set":
				if (typeof data.args[0] === "string") {
					if (data.args[0] === "settings") {
						for (k in data.args[1]) {
							page.settings[k] = data.args[1][k];
						}
					} else {
						page[data.args[0]] = data.args[1];
					}
				} else {
					for (k in data.args[0]) {
						if (k === "settings") {
							for (j in data.args[0][k]) {
								page.settings[j] = data.args[k][j];
							}
						} else {
							page[k] = data.args[0][k];
						}
					}
				}
				send(data);
				break;

			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else {
		console.log("Unknown page id: " + data.page);
	}
};
