/*!
 * node-phantomhive
 * MIT Licensed
 */
var http = require("http");
var io = require("socket.io");
var child_process = require("child_process");
var Page = require("./Page");

var instance_id = 1;
var Phantom = function() {
	this.id = "Phantom-" + instance_id++;
	this.activeRequests = {};
	this.pages = {};
};

module.exports = Phantom;

Phantom.PORT = 18080;

Phantom.listen = function(callback, port) {
	var phantom = new Phantom();
	return phantom.listen(callback, port);
};

Phantom.prototype.id = "Phantom";
Phantom.prototype.cid = 0;
Phantom.prototype.socket = null;
Phantom.prototype.pages = null;
Phantom.prototype.activeRequests = null;
Phantom.prototype._process = null;
Phantom.prototype._server = null;

Phantom.prototype.getCommandId = function() {
	return ++this.cid;
};

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

Phantom.prototype._startPhantomProcess = function(options) {
	if (this._process) {
		return this._process;
	}
	// create the phantomjs instance
	var phantom = child_process.spawn("phantomjs", [ __dirname + "/phantom-bridge.js", options.port ]);
	phantom.stdout.on("data", function(data) {
		console.log("phantom: " + data);
	});
	phantom.stderr.on("data", function(data) {
		console.warn("phantom: " + data);
	});
	process.on("exit", function() {
		phantom.kill();
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

Phantom.prototype.get = function(key, callback) {
	// cookies {array}
	// cookiesEnabled {boolean}
	// libraryPath {string}
	// version {object}
	this.send("get", callback, [ key ]);
	return this;
};

Phantom.prototype.set = function(key, value, callback) {
	// cookies {array}
	// cookiesEnabled {boolean}
	// libraryPath {string}
	this.send("set", callback, [ key, value ]);
	return this;
};

Phantom.prototype.addCookie = function(cookie, callback) {
	this.send("addCookie", callback, [ cookie ]);
	return this;
};

Phantom.prototype.deleteCookie = function(cookieName, callback) {
	this.send("deleteCookie", callback, [ cookieName ]);
	return this;
};

Phantom.prototype.clearCookies = function(callback) {
	this.send("clearCookies", callback);
	return this;
};

Phantom.prototype.createPage = function(callback) {
	this.send("createPage", callback);
	return this;
};

Phantom.prototype.injectJs = function(filename, callback) {
	this.send("injectJs", callback, [ filename ]);
	return this;
};

Phantom.prototype.exit = function(callback) {
	this.send("exit", function() {
		this._server.close();
		this.send("done", callback);
	});
	return this;
};
