"use strict";

var phantomjs = require("../");
phantomjs.listen(function(phantom) {
	[ "http://google.com", "http://yahoo.com" ].forEach(function(uri) {
		phantom.createPage(function(error, page) {
			console.log("createpage called: " + page.id);
			page.open(uri, function() {
				setTimeout(function() {
					page.render("abc.png");
					page.evaluate(function() {
						return document.title;
					}, [ 1, 2, 3 ], function(val) {
						console.log("done eval", val);
					});
				}, 1000);
			});
		});
	});
});
