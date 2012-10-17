var util = require("util");
var EventEmitter = require("events").EventEmitter;

var Page = function(id, socket) {
	EventEmitter.call(this);
	this.id = id;
	this.activeRequests = {};
	this.socket = socket;
};

util.inherits(Page, EventEmitter);
module.exports = Page;

Page.prototype.id = 0;
Page.prototype.cid = 0;
Page.prototype.socket = null;
Page.prototype.activeRequests = null;
Page.prototype.getCommandId = function() {
	return ++this.cid;
};

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

Page.prototype._onConnected = function(socket) {
	this.socket = socket, self = this;
	socket.on("exec", function(data) {
		self._onReceive(data);
	});
};

Page.prototype._onReceive = function(data) {
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
			data.command = "onJsEror";
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
			var args = data.args.slice(0);
			args.unshift(data.command[2].toLowerCase() + data.command.replace(/^on\w/, ""));
			this.emit.apply(this, args);
			break;
		default:
			console.log("Unknown command: " + data.command);
			break;
	}
};

var basicCallback = function(data) {
	if (this.activeRequests[data.command_id]) {
		this.activeRequests[data.command_id](data.args);
	}
};

Page.prototype.addCookie = function(cookie, callback) {
	this.send("addCookie", callback, [ cookie ]);
};
Page.prototype.clearCookies = function(callback) {
	this.send("clearCookies", callback);
};
Page.prototype.close = function(callback) {
	this.send("close", callback);
};
Page.prototype.evaluate = function(fn, args, callback) {
	this.send("evaluate", callback, [ fn.toString(), args ]);
};
Page.prototype.evaluateAsync = function(fn, callback) {
	this.send("evaluateAsync", callback, [ fn.toString() ]);
};
Page.prototype.includeJs = function(url, callback) {
	this.send("includeJs", callback, [ url ]);
};
Page.prototype.injectJs = function(filename, callback) {
	this.send("injectJs", callback, [ filename ]);
};
Page.prototype.open = function(url, callback) {
	this.send("open", callback, [ url ]);
};
Page.prototype.render = function(filename, callback) {
	this.send("render", callback, [ filename ]);
};
Page.prototype.renderBase64 = function(format, callback) {
	this.send("renderBase64", callback, [ format ]);
};
Page.prototype.sendEvent = function(type, mouseX, mouseY, callback) {
	this.send("sendEvent", callback, [ type, mouseX, mouseY ]);
};
Page.prototype.uploadFile = function(selector, filename, callback) {
	this.send("uploadFile", callback, [ selector, filename ]);
};

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
};

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
};
