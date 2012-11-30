"use strict";

var http = require("http");
var io = require("socket.io");
var child_process = require("child_process");
var Page = require("./Page");

/**
 * Global phantom level instance id
 *
 * @type {Number}
 */
var instance_id = 1;

/**
 * Reference to all open child phantomjs processes
 *
 * @type {Object}
 */
var open_forks = {};

/**
 * Hook into the exit event
 *
 * @event
 */
process.on("exit", function() {
	Object.keys(open_forks).forEach(function(phantom, k) {
		if (!open_forks[k]) {
			return;
		}
		phantom.kill();
	});
});

/**
 * The phantomjs process controller/server
 *
 * @constructor
 * @static
 * @type {Object}
 */
var Phantom = function() {
	this.id = "Phantom-" + instance_id++;
	this.activeRequests = {};
	this.pages = {};
};

// Export this module
module.exports = Phantom;

/**
 * The default port to route internal socket.io requests
 *
 * @constant
 * @memberOf Phantom
 * @static
 * @type {Number}
 */
Phantom.PORT = 18080;

/**
 * Static bootstrap function to start a phantomjs process and start listening for events
 *
 * @memberOf Phantom
 * @static
 * @returns {Phantom}
 * @type {Phantom}
 */
Phantom.listen = function(callback, port) {
	var phantom = new Phantom();
	return phantom.listen(callback, port);
};

/**
 * Internal instance identifier
 *
 * @memberOf Phantom
 * @type {String}
 */
Phantom.prototype.id = "Phantom";
/**
 * Internal command counter
 *
 * @memberOf Phantom
 * @type {Number}
 */
Phantom.prototype.cid = 0;
/**
 * Internal socket.io handler
 *
 * @memberOf Phantom
 * @type {Object}
 */
Phantom.prototype.socket = null;
/**
 * Hash containing all the pages created through this instance
 *
 * @memberOf Phantom
 * @type {Object} of Page objects
 */
Phantom.prototype.pages = null;
/**
 * Hash containing all the active requests to the page instances
 *
 * @memberOf Phantom
 * @type {Object}
 */
Phantom.prototype.activeRequests = null;
/**
 * Forked process handler
 *
 * @memberOf Phantom
 * @type {Object}
 */
Phantom.prototype._process = null;
/**
 * The Socket.io server to communicate with the phantomjs bridge script
 *
 * @memberOf Phantom
 * @type {Object}
 */
Phantom.prototype._server = null;

/**
 * Retrieve the next available command counter
 *
 * @memberOf Phantom
 * @private
 * @returns {Number}
 * @type {Number}
 */
Phantom.prototype.getCommandId = function() {
	return ++this.cid;
};

/**
 * Sends commands to the bridge process
 *
 * @memberOf Phantom
 * @param {String} command
 * @param {Function} callback
 * @param {Array} args
 * @private
 * @returns {Number}
 * @type {Number}
 */
Phantom.prototype.send = function(command, callback, args) {
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
 * Starts the server and phantomjs child process
 *
 * @memberOf Phantom
 * @param {Function} callback
 * @param {Object} options
 * @private
 * @returns {Phantom}
 * @type {Phantom}
 */
Phantom.prototype.listen = function(callback, options) {
	if (this._process) {
		return this;
	}
	if (!options) {
		options = {};
	}
	if (typeof options === "number") {
		var port = options;
		options = {
			port : port
		};
	}
	options.port = options.port || Phantom.PORT;

	this._startPhantomProcess(options);
	this._startServer(options.port, callback);
	return this;
};

/**
 * Starts the internal phantomjs child process
 *
 * @memberOf Phantom
 * @param {Object} options
 * @private
 * @returns {Object}
 * @type {Object}
 */
Phantom.prototype._startPhantomProcess = function(options) {
	if (this._process) {
		return this._process;
	}
	// create the phantomjs instance
	var self = this, phantom = child_process.spawn("phantomjs", [ __dirname + "/phantom-bridge.js", options.port ]);
	phantom.stdout.on("data", function(data) {
		console.log("phantom: " + data);
	});
	phantom.stderr.on("data", function(data) {
		console.warn("phantom: " + data);
	});
	phantom.on("exit", function() {
		delete open_forks[self.id];
	});
	// keep global reference so we can kill them all
	open_forks[this.id] = phantom;
	this._process = phantom;
	return phantom;
};

/**
 * Start the communication layer between this process and the phantomjs fork
 *
 * @memberOf Phantom
 * @param {Number} port
 * @param {Function} callback
 * @private
 */
Phantom.prototype._startServer = function(port, callback) {
	if (this._server) {
		return this._server;
	}
	var self = this;
	this._server = http.createServer(function(request, response) {
		response.writeHead(200, {
			"Content-Type" : "text/html"
		});
		var html = [ "<html><head>" ];
		html.push("<script src='/socket.io/socket.io.js'></script>");
		html.push("<script>");
		html.push("window.onload = function() {");
		html.push("window.socket = new io.connect('http://127.0.0.1:" + port + "/" + self.id + "');");
		html.push("socket.on('exec', function(data){ alert(data); });");
		html.push("};");
		html.push("</script>");
		html.push("</head><body></body></html>");
		// we want to write out the script tags to connect with socket io
		response.end(html.join(""));
	}).listen(port);

	io.listen(this._server, {
		"log level" : 1,
		transports : [ "websocket" ]
	}).of("/" + self.id).on("connection", function(socket) {
		self.socket = socket;
		// console.log(self.instance_id);
		socket.on("exec", function(data) {
			self._onReceive(data);
		});

		if (callback) {
			callback.call(self, self);
		}
	});
};

/**
 * Internal callback for listening to events from the phantomjs process
 *
 * @memberOf Phantom
 * @param {Object} data
 * @private
 */
Phantom.prototype._onReceive = function(data) {
	// console.log("response", data);
	if (data.page === this.id) {
		switch (data.command) {
			case "createPage":
				this["_" + data.command](data);
				break;
			case "injectJs":
			case "exit":
			case "done":
			case "addCookie":
			case "deleteCookie":
			case "clearCookies":
			case "get":
			case "set":
				if (this.activeRequests[data.command_id]) {
					this.activeRequests[data.command_id](data.args);
				}
				break;
			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else if (this.pages[data.page]) {
		this.pages[data.page]._onReceive(data);
	} else {
		console.log("Unknown page id: " + data.page + " " + this.id);
	}
};

/**
 * Create a new phantomjs webpage
 *
 * @memberOf Phantom
 * @param {Object} data
 * @private
 */
Phantom.prototype._createPage = function(data) {
	var error = null, page = null;
	if (this.pages[data.args[0]]) {
		throw new Error("Duplicated page id found.");
	}
	if (data.args[0] > 0) {
		page = new Page(data.args[0], this.socket);
		this.pages[data.args[0]] = page;
	}
	if (this.activeRequests[data.command_id]) {
		this.activeRequests[data.command_id]([ error, page ]);
	}
};

/**
 * Retrieve (a) option variable from the phantomjs browser
 *
 * @memberOf Phantom
 * @param {String} key
 * @param {Function}callback
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-phantom
 */
Phantom.prototype.get = function(key, callback) {
	// cookies {array}
	// cookiesEnabled {boolean}
	// libraryPath {string}
	// version {object}
	this.send("get", callback, [ key ]);
	return this;
};

/**
 * Sets (a) option variable to the phantomjs browser
 *
 * @memberOf Phantom
 * @param {String} key
 * @param {Object} value
 * @param {Function} callback
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-phantom
 */
Phantom.prototype.set = function(key, value, callback) {
	// cookies {array}
	// cookiesEnabled {boolean}
	// libraryPath {string}
	this.send("set", callback, [ key, value ]);
	return this;
};

/**
 * Add (a) global cookie to the phantomjs browser
 *
 * @memberOf Phantom
 * @param {Object} cookie
 * @param {Function} callback
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-phantom
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-cookie
 */
Phantom.prototype.addCookie = function(cookie, callback) {
	this.send("addCookie", callback, [ cookie ]);
	return this;
};

/**
 * Delete (a) global cookie from the phantomjs browser
 *
 * @memberOf Phantom
 * @param {String} cookieName
 * @param {Function} callback
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-phantom
 */
Phantom.prototype.deleteCookie = function(cookieName, callback) {
	this.send("deleteCookie", callback, [ cookieName ]);
	return this;
};

/**
 * Remove all cookies from the phantomjs browser
 *
 * @memberOf Phantom
 * @param {Function} callback
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-phantom
 */
Phantom.prototype.clearCookies = function(callback) {
	this.send("clearCookies", callback);
	return this;
};

/**
 * Create a new page instance in the phantomjs browser
 *
 * @memberOf Phantom
 * @param {Function} callback
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-phantom
 */
Phantom.prototype.createPage = function(callback) {
	this.send("createPage", callback);
	return this;
};

/**
 * Run a javascript file in the phantomjs context in the global level
 *
 * @memberOf Phantom
 * @param {String} filename
 * @param {Function} callback
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 * @see https://github.com/ariya/phantomjs/wiki/API-Reference#wiki-phantom
 */
Phantom.prototype.injectJs = function(filename, callback) {
	this.send("injectJs", callback, [ filename ]);
	return this;
};

/**
 * End this phantom instance and shutdown listeners
 *
 * @memberOf Phantom
 * @public
 * @returns {Phantom}
 * @type {Phantom}
 */
Phantom.prototype.exit = function() {
	this.send("exit", function() {
		this._server.close();
		this.send("done");
		this.socket.disconnect();
	});
	return this;
};
