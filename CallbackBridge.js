var CallbackBridge = function() {

};

module.exports = CallbackBridge;
module.exports.CallbackBridge = CallbackBridge;

CallbackBridge.prototype = {
	id : 0,
	cid : 0,
	socket : null,
	activeRequests : {}
};
CallbackBridge.prototype.getCommandId = function() {
	return ++this.cid;
};

CallbackBridge.prototype.send = function(command, callback, args) {
	var self = this, id = this.getCommandId();
	var data = {
		page : this.id,
		command_id : id,
		command : command,
		args : args || []
	};
	console.log("send", data);

	this.socket.emit("exec", JSON.stringify(data));

	this.activeRequests[id] = function(args) {
		delete self.activeRequests[id];
		if (callback) {
			callback.apply(self, args || []);
		}
	};
	return id;
};
