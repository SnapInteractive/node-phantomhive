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
 * Process a data request from the bridge that can be optionally 1 argument or an array of the first possible argument
 *
 * @param {Object} context
 * @param {Object} data
 */
function processMultiArrayOptSync(context, data) {
	if (Array.isArray(data.args[0])) {
		var temp = [];
		data.args[0].forEach(function(args) {
			temp.push(context[data.command].apply(context, [ args ]));
		});
		send(data, temp);
	} else {
		send(data, [ context[data.command].apply(context, data.args) ]);
	}
}

/**
 * Process a data request from the bridge to get configuration settings. Can be 2 args with string key and mixed value or a hash of multiple settings
 *
 * @param {Object} context
 * @param {Object} data
 */
function processGetOptions(context, data) {
	var temp = {}, k;
	if (typeof data.args[0] === "string") {
		send(data, [ context[data.args[0]] ]);
	} else {
		for (k in data.args[0]) {
			temp[k] = context[k];
		}
		send(data, [ temp ]);
	}
}

/**
 * Process a data request from the bridge to set configuration settings. Can be 2 args with string key and mixed value or a hash of multiple settings
 *
 * @param {Object} context
 * @param {Object} data
 */
function processSetOptions(context, data) {
	var k, j;
	if (typeof data.args[0] === "string") {
		if (data.args[0] === "settings") {
			for (k in data.args[1]) {
				context.settings[k] = data.args[1][k];
			}
		} else {
			context[data.args[0]] = data.args[1];
		}
	} else {
		for (k in data.args[0]) {
			if (k === "settings") {
				for (j in data.args[0][k]) {
					context.settings[j] = data.args[k][j];
				}
			} else {
				context[k] = data.args[0][k];
			}
		}
	}

	send(data);
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
 * Event listener and delegator for events that come in through the bridge
 *
 * @event
 * @param {String}
 */
controller.onAlert = function(msg) {
	var data = JSON.parse(msg);
	if (/^Phantom-/.test(data.page)) {
		switch (data.command) {
			case "createPage":
				send(data, [ setup(webpage.create()) ]);
				break;

			case "injectJs":
			case "addCookie":
			case "deleteCookie":
				processMultiArrayOptSync(phantom, data);
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
				processGetOptions(phantom, data);
				break;

			case "set":
				processSetOptions(phantom, data);
				break;

			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else if (pages[data.page]) {
		var page = pages[data.page];
		switch (data.command) {
			case "clearCookies": // () {void}
			case "render": // (filename) {void}
			case "sendEvent": // (type, [mouseX, mouseY, button='left'] OR keyOrKeys)
			case "uploadFile": // (selector, filename)
				page[data.command].apply(page, data.args);
				send(data);
				break;

			case "close": // () {void}
				(page.close || page.release).apply(page, data.args);
				send(data);
				break;

			case "addCookie": // (cookie) {boolean}
			case "deleteCookie": // (cookieName) {boolean}
			case "injectJs": // (filename) {boolean}
				processMultiArrayOptSync(page, data);
				break;

			case "renderBase64": // (format)
				send(data, [ page[data.command].apply(page, data.args) ]);
				break;

			case "evaluate": // (function, arg1, arg2, ...) {object}
				/*jshint evil:true */
				var args = (data.args[1] || []).slice(0);
				args.unshift((new Function("return " + data.args[0]))());
				send(data, [ page.evaluate.apply(page, args) ]);
				break;

			case "evaluateAsync": // (function) {void}
				/*jshint evil:true */
				page.evaluateAsync((new Function("return " + data.args[0]))());
				send(data);
				break;

			case "includeJs": // (url, callback) {void}
				page.includeJs(data.args[0], function() {
					send(data);
				});
				break;

			case "open": // (url, callback) {void}
				page.open(data.args[0], function(status) {
					// console.log("opening page...");
					send(data, [ status ]);
				});
				break;

			case "get":
				processGetOptions(page, data);
				break;

			case "set":
				processSetOptions(page, data);
				break;

			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else {
		console.log("Unknown page id: " + data.page);
	}
};

/**
 * Starts the communication channel with the bridge
 */
controller.open("http://127.0.0.1:" + port);
