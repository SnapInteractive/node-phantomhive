var util = require("util");
var http = require("http");
var io = require("socket.io");
var child_process = require("child_process");
var Page = require("./Page");

var Phantom = function() {
	this.activeRequests = {};
	this.pages = {};
};

util.inherits(Phantom, require("./CallbackBridge").CallbackBridge);
module.exports = Phantom;

Phantom.PORT = 18080;

Phantom.listen = function(callback, port) {
	var phantom = new Phantom();
	return phantom.listen(callback, port);
};

Phantom.prototype.id = "Phantom";
Phantom.prototype._process = null;
Phantom.prototype._server = null;
Phantom.prototype._io = null;

Phantom.prototype.listen = function(callback, options) {
	if (this._process) {
		return this;
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

Phantom.prototype._startPhantomProcess = function(options) {
	if (this._process) {
		return this._process;
	}
	// create the phantomjs instance
	var phantom = child_process.spawn("phantomjs", [ __dirname + "/phantom-bridge.js", options.port ]);
	phantom.stdout.on("data", function(data) {
		return console.log("phantom stdout: " + data);
	});
	phantom.stderr.on("data", function(data) {
		return console.warn("phantom stderr: " + data);
	});
	phantom.stderr.on("exit", function(data) {
		console.log(data);
	});
	this._process = phantom;
	return phantom;
};

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
		html.push('window.onload = function() {');
		html.push('window.socket = new io.connect("http://" + window.location.hostname + ":" + ' + port + ');');
		html.push('socket.on("exec", function(data){ alert(data); });');
		html.push('};');
		html.push("</script>");
		html.push("</head><body></body></html>");
		// we want to write out the script tags to connect with socket io
		response.end(html.join(""));
	}).listen(port);

	this._io = io.listen(this._server, {
		'log level' : 1,
		transports : [ 'websocket' ]
	}).sockets.on("connection", function(socket) {
		self._onConnected(socket);
		if (callback) {
			callback.call(self, self);
		}
	});
};

Phantom.prototype._onConnected = function(socket) {
	this.socket = socket, self = this;
	socket.on("exec", function(data) {
		self._onReceive(data);
	});
};

Phantom.prototype._onReceive = function(data) {
	//console.log("response", data);
	if (data.page === this.id) {
		switch (data.command) {
			case "createPage":
			case "injectJs":
			case "exit":
			case "done":
				this["_" + data.command](data);
				break;
			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else if (this.pages[data.page]) {
		this.pages[data.page]._onReceive(data);
	} else {
		console.log("Unknown page id: " + data.page);
	}
};

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

var basicCallback = function(data) {
	if (this.activeRequests[data.command_id]) {
		this.activeRequests[data.command_id](data.args);
	}
};

[ "injectJs", "addCookie", "deleteCookie", "deleteCookie", "exit", "done" ].forEach(function(name) {
	Phantom.prototype["_" + name] = basicCallback;
});

Phantom.prototype.addCookie = function(cookie, callback) {
	this.send("addCookie", callback, [ cookie ]);
};

Phantom.prototype.deleteCookie = function(cookieName, callback) {
	this.send("deleteCookie", callback, [ cookieName ]);
};

Phantom.prototype.clearCookies = function(callback) {
	this.send("clearCookies", callback);
};

Phantom.prototype.createPage = function(callback) {
	this.send("createPage", callback);
};

Phantom.prototype.injectJs = function(filename, callback) {
	this.send("injectJs", callback, [ filename ]);
};

Phantom.prototype.exit = function(callback) {
	this.send("exit", function() {
		console.log("we're done");
		this._server.close();
		this.send("done", callback);
	});
};

/*
 * cookies {array}
 *
 * Introduced: PhantomJS 1.7 Get or set cookies for any domain (though, for setting, use of phantom.addCookie is preferred). These cookies are stored in the
 * CookieJar and will be supplied when opening pertinent WebPages. This array will be pre-populated by any existing cookie data stored in the cookie file
 * specified in the PhantomJS startup config/command-line options, if any.
 *
 * cookiesEnabled {boolean}
 *
 * Introduced: PhantomJS 1.7 Controls whether the CookieJar is enabled or not. Defaults to true.
 *
 * libraryPath {string}
 *
 * This property stores the path which is used by injectJs function to resolve the script name. Initially it is set to the location of the script invoked by
 * PhantomJS.
 *
 * scriptName {string}
 *
 * Stability: DEPRECATED - Use system.args[0] from the System module Read-only. The name of the invoked script file.
 *
 * version {object}
 *
 * Read-only. The version of the executing PhantomJS instance. Example value: { major: 1, minor: 0, patch: 0 }.
 */
