"use strict";

var util = require("util");
var EventEmitter = require("events").EventEmitter;

/**
 * The phantomjs page instance
 *
 * @augments {EventEmitter}
 * @constructor
 * @static
 * @type {Object}
 */
var Page = function(id, socket) {
	EventEmitter.call(this);
	this.id = id;
	this.activeRequests = {};
	this.socket = socket;
};

// nodejs style inheritance
util.inherits(Page, EventEmitter);

// Export this module
module.exports = Page;

/**
 * Internal instance identifier
 *
 * @memberOf Page
 * @type {String}
 */
Page.prototype.id = 0;
/**
 * Internal command counter
 *
 * @memberOf Page
 * @type {Number}
 */
Page.prototype.cid = 0;
/**
 * Internal socket.io handler
 *
 * @memberOf Page
 * @type {Object}
 */
Page.prototype.socket = null;
/**
 * Hash containing all the active requests to the page instances
 *
 * @memberOf Page
 * @type {Object}
 */
Page.prototype.activeRequests = null;

/**
 * Retrieve the next available command counter
 *
 * @memberOf Page
 * @private
 * @returns {Number}
 * @type {Number}
 */
Page.prototype.getCommandId = function() {
	return ++this.cid;
};

/**
 * Sends commands to the bridge process in the context of this page
 *
 * @memberOf Page
 * @param {String} command
 * @param {Function} callback
 * @param {Array} args
 * @private
 * @returns {Number}
 * @type {Number}
 */
Page.prototype.send = function(command, callback, args) {
	var self = this, id = this.getCommandId();
	var data = {
		page : this.id,
		command_id : id,
		command : command,
		args : args || []
	};
	// console.log("send", data);

	this.socket.emit("exec", JSON.stringify(data));

	this.activeRequests[id] = function(args) {
		delete self.activeRequests[id];
		if (callback) {
			callback.apply(self, args || []);
		}
	};
	return id;
};

/**
 * Internal callback for listening to events from the phantomjs process
 *
 * @memberOf Page
 * @param {Object} data
 * @private
 */
Page.prototype._onReceive = function(data) {
	var args = (data.args || []).slice(0);
	// console.log("page response", data);
	switch (data.command) {
		case "addCookie": // (cookie)` {boolean}
		case "clearCookies": // ()` {void}
		case "close": // ()` {void}
		case "deleteCookie": // (cookieName)` {boolean}
		case "evaluate": // (function, arg1, arg2, ...)` {object}
		case "evaluateAsync": // (function)` {void}
		case "includeJs": // (url, callback)` {void}
		case "injectJs": // (filename)` {boolean}
		case "open": // (url, callback)` {void}
		case "render": // (filename)` {void}
		case "renderBase64": // (format)`
		case "sendEvent": // (type, mouseX, mouseY)`
		case "uploadFile": // (selector, filename)`
		case "get":
		case "set":
			if (this.activeRequests[data.command_id]) {
				this.activeRequests[data.command_id](data.args);
			}
			break;
		case "onError":
			// console.log(data.command, data.args);
			args.unshift("jsError");
			this.emit.apply(this, args);
			break;
		case "onAlert":
		case "onCallback":
		case "onClosing":
		case "onConfirm":
		case "onConsoleMessage":
		case "onInitialized":
		case "onLoadFinished":
		case "onLoadStarted":
		case "onNavigationRequested":
		case "onPrompt":
		case "onResourceRequested":
		case "onResourceReceived":
		case "onUrlChanged":
			// console.log(data.command, data.args);
			args.unshift(data.command[2].toLowerCase() + data.command.replace(/^on\w/, ""));
			this.emit.apply(this, args);
			break;
		default:
			console.log("Unknown command: " + data.command);
			break;
	}
};

/**
 * Add (a) page level cookie to the phantomjs page
 *
 * @memberOf Page
 * @param {Object} cookie
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-cookie
 */
Page.prototype.addCookie = function(cookie, callback) {
	this.send("addCookie", callback, [ cookie ]);
	return this;
};

/**
 * Delete (a) page level cookie from the phantomjs page
 *
 * @memberOf Page
 * @param {String} cookieName
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Phantom.prototype.deleteCookie = function(cookieName, callback) {
	this.send("deleteCookie", callback, [ cookieName ]);
	return this;
};

/**
 * Remove all cookies from the phantomjs page
 *
 * @memberOf Page
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.clearCookies = function(callback) {
	this.send("clearCookies", callback);
	return this;
};

/**
 * Close the current page
 *
 * @memberOf Page
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.close = function(callback) {
	this.send("close", callback);
	return this;
};

/**
 * Evaluate some code inside the context of the page. This will lose all context outside of the browser window context.
 *
 * @memberOf Page
 * @param {Function} fn
 * @param {Array} args
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.evaluate = function(fn, args, callback) {
	if (arguments.length === 2 && typeof arguments[1] === "function") {
		this.send("evaluate", args, [ fn.toString(), [] ]);
	} else {
		this.send("evaluate", callback, [ fn.toString(), args ]);
	}
	return this;
};

/**
 * Evaluates the given function in the context of the web page without blocking the current execution.
 *
 * @memberOf Page
 * @param {Function} fn
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.evaluateAsync = function(fn, callback) {
	this.send("evaluateAsync", callback, [ fn.toString() ]);
	return this;
};

/**
 * Include a external javascript file in the page context
 *
 * @memberOf Page
 * @param {String} url
 * @param {Function} callback The function will be called when the script has successfully loaded
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.includeJs = function(url, callback) {
	this.send("includeJs", callback, [ url ]);
	return this;
};

/**
 * Inject a local javascript file into the page context
 *
 * @memberOf Page
 * @param {String} filename
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.injectJs = function(filename, callback) {
	this.send("injectJs", callback, [ filename ]);
	return this;
};

/**
 * Opens a new page with the given url
 *
 * @memberOf Page
 * @param {String} url
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.open = function(url, callback) {
	this.send("open", callback, [ url ]);
	return this;
};
/**
 * Renders a screenshot of the current state of the page to a file
 *
 * @memberOf Page
 * @param {String} filename
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.render = function(filename, callback) {
	this.send("render", callback, [ filename ]);
	return this;
};

/**
 * Renders a screenshot of the current state of the page as a base64 encoded string
 *
 * @memberOf Page
 * @param {String} format
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.renderBase64 = function(format, callback) {
	this.send("renderBase64", callback, [ format ]);
	return this;
};

/**
 * Sends a event to the page
 *
 * @memberOf Page
 * @param {String} type
 * @param {Array} args
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.sendEvent = function(type, args, callback) {
	this.send("sendEvent", callback, [ type ].concat(args || []));
	return this;
};

/**
 * Upload a local file to the remote server
 *
 * @memberOf Page
 * @param {String} selector A valid querySelectorAll selector string
 * @param {String} filename
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.uploadFile = function(selector, filename, callback) {
	this.send("uploadFile", callback, [ selector, filename ]);
	return this;
};

/**
 * Retrieve (a) option variable from the page
 *
 * @memberOf Page
 * @param {String} key
 * @param {Function}callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.get = function(key, callback) {
	// `clipRect` {object}
	// `content` {string}
	// `cookies` {array}
	// `customHeaders` {object}
	// `frameContent` {string}
	// `framePlainText` {string}
	// `frameUrl` {string}
	// `libraryPath` {string}
	// `navigationLocked` {boolean}
	// `paperSize` {object}
	// `plainText` {string}
	// `settings` {object}
	// `url` {string}
	// `viewportSize` {object}
	// `zoomFactor` {number}
	this.send("get", callback, [ key ]);
	return this;
};

/**
 * Sets (a) option variable to the page
 *
 * @memberOf Page
 * @param {String} key
 * @param {Object} value
 * @param {Function} callback
 * @public
 * @returns {Page}
 * @type {Page}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-webpage
 */
Page.prototype.set = function(key, value, callback) {
	// `clipRect` {object}
	// `content` {string}
	// `cookies` {array}
	// `customHeaders` {object}
	// `frameContent` {string}
	// `frameUrl` {string}
	// `libraryPath` {string}
	// `navigationLocked` {boolean}
	// `paperSize` {object}
	// `settings` {object}
	// `viewportSize` {object}
	// `zoomFactor` {number}
	this.send("set", callback, [ key, value ]);
	return this;
};
