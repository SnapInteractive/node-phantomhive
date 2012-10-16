var port = Array.prototype.slice.call(phantom.args, 0).pop();
var webpage = require("webpage");
var pages = {};
var pageuuid = 0;
var controller = webpage.create();

function send(page_id, command_id, command, args, callback) {
	var data = {
		page : page_id,
		command_id : command_id,
		command : command,
		args : args || []
	};
	controller.evaluate('function(){socket.emit("exec",' + JSON.stringify(data) + ');}');
}

function setup(page) {
	var id = ++pageuuid;
	// [ 'onConfirm', 'onPrompt' ] // todo: need user feedback
	[ 'onAlert', 'onConsoleMessage', 'onError', 'onInitialized', 'onLoadFinished', 'onLoadStarted', 'onResourceRequested', 'onResourceReceived', 'onUrlChanged' ].forEach(function(callback) {
		page[callback] = function() {
			send(id, -1, callback, Array.prototype.slice.call(arguments));
		};
	});
	pages[id] = page;
	return id;
}

controller.onConsoleMessage = function(msg) {
	return console.log("console: " + msg);
};

controller.open("http://127.0.0.1:" + port, function(status) {
	console.log("controller: " + status);
});

controller.onAlert = function(msg) {
	var data = JSON.parse(msg);
	if (data.page === "Phantom") {
		switch (data.command) {
			case "createPage":
				send(data.page, data.command_id, "createPage", [ setup(webpage.create()) ]);
				break;
			case "injectJs":
				send(data.page, data.command_id, "injectJs", [ phantom.injectJs.apply(phantom, data.args) ]);
				break;
			case "exit":
				Object.keys(pages).forEach(function(page) {
					pages[page].close();
				});
				send(data.page, data.command_id, "exit");
				break;
			case "done":
				phantom.exit();
				break;
			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else if (pages[data.page]) {
		var page = pages[data.page];
		switch (data.command) {
			case "clearCookies": // ()` {void}
			case "close": // ()` {void}
			case "release": // ()` {void}
			case "render": // (filename)` {void}
			case "sendEvent": // (type, mouseX, mouseY)`
			case "uploadFile": // (selector, filename)`
				page[data.command].apply(page, data.args);
				send(data.page, data.command_id, data.command);
				break;

			case "addCookie": // (cookie)` {boolean}
			case "deleteCookie": // (cookieName)` {boolean}
			case "injectJs": // (filename)` {boolean}
			case "renderBase64": // (format)`
				send(data.page, data.command_id, data.command, [ page[data.command].apply(page, data.args) ]);
				break;

			case "evaluate": // (function, arg1, arg2, ...)` {object}
				console.log("hi");
				var args = data.args[1].slice(0);
				args.unshift((new Function("return " + data.args[0]))());
				send(data.page, data.command_id, data.command, [ page.evaluate.apply(page, args) ]);
				break;

			case "evaluateAsync": // (function)` {void}
				page.evaluateAsync((new Function("return " + data.args[0]))());
				send(data.page, data.command_id, data.command);
				break;

			case "includeJs": // (url, callback)` {void}
				page.includeJs(data.args[0], function() {
					send(data.page, data.command_id, data.command);
				});
				break;

			case "open": // (url, callback)` {void}
				page.open(data.args[0], function() {
					send(data.page, data.command_id, data.command);
				});
				break;
			default:
				console.log("Unknown command: " + data.command);
				break;
		}
	} else {
		console.log("Unknown page id: " + data.page);
	}
};
