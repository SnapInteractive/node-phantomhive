var phantomjs = require("./Phantom");
phantomjs.listen(function(phantom) {
	this.createPage(function(error, page) {
		console.log("createpage called");
		page.open("http://google.com", function() {
			setTimeout(function() {
				page.evaluate(function() {
					return typeof window;
				}, [ 1, 2, 3 ], function() {

				});
				// console.log(page.renderBase64("png"));
			}, 5000);
		});
		// phantom.exit();
	});
}, 8080);