module.exports = function(build) {
	// set basic info about the repo
	build.setNameVersion("phantomhive", "0.2.0");

	// set the url of this repo
	build.setRepoName("https://github.com/weikinhuang/node-phantomhive");

	// adds a list of files that will be parsed
	build.addSourceFile("Page.js", "Phantom.js", "phantom-bridge.js");

	// adds a list of unit tests files that will be run
	build.addUnitTestFile();

	// sets the list of environments that this code can run against
	build.enableEnvironment("node");

	// set the default set of tasks that should be run by default when called with no build args
	build.setDefaultTasks("lint", "unit");

	// set linting options
	build.addTaskOptions("lint", {
		// run the linter on a per file basis
		perFile : true,
		// the options to run the linter with
		options : {
			latedef : true,
			noempty : true,
			undef : true,
			strict : false,
			node : true,
			quotmark : "double",
			// maxcomplexity : 7,
			predef : [ "phantom" ]
		}
	});

	// set options for the package file generator
	build.addTaskOptions("pkg", {
		file : "package.json",
		desc : {
			name : "phantomhive",
			description : "Manage phantomjs processes with nodejs.",
			keywords : [ "cli", "remote", "testing", "phantomjs", "stress testing", "headless", "browser" ],
			author : "Wei Kin Huang <wei@closedinterval.com>",
			contributors : [ {
				name : "Man Hoang",
				email : "mhoang@snap-interactive.com"
			}, {
				name : "Devin Cooper",
				email : "dcooper@snap-interactive.com"
			} ],
			version : "@VERSION",
			homepage : "https://github.com/weikinhuang/node-phantomhive",
			repository : {
				type : "git",
				url : "https://github.com/weikinhuang/node-phantomhive.git"
			},
			bugs : {
				url : "https://github.com/weikinhuang/node-phantomhive/issues"
			},
			licenses : [ {
				type : "MIT",
				url : "https://github.com/weikinhuang/node-phantomhive/blob/master/MIT-LICENSE.txt"
			} ],
			main : "src/Phantom.js",
			dependencies : {
				"socket.io" : "0.9.10"
			},
			engines : {
				node : "0.8.x"
			}
		}
	});
};
