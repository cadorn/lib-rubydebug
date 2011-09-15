/**
 * Package: https://github.com/ajaxorg/lib-rubydebug
 * 
 * License: MIT
 * 
 * Copyright(c) 2011 Ajax.org B.V. <info AT ajax DOT org>
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * 
 * Author: Christoph Dorn <christoph@christophdorn.com> (http://www.christophdorn.com/)
 * 
 * Purpose of this module:
 * 
 *   Example server showing how to integrate the `../lib/client` module into a
 *   [connect](https://github.com/senchalabs/connect) + 
 *   [socket.io](https://github.com/learnboost/socket.io) based stack.
 *
 * External Dependencies:
 * 
 *   * `Q` <- `npm install q` -> [http://github.com/kriskowal/q](http://github.com/kriskowal/q)
 *   * `CLI` <- `npm install cli` -> [https://github.com/chriso/cli](https://github.com/chriso/cli)
 *   * `CONNECT` <- `npm install connect` -> [https://github.com/senchalabs/connect](https://github.com/senchalabs/connect)
 *   * `CONNECT_DISPATCH` <- `../support/dispatch` -> [https://github.com/caolan/dispatch](https://github.com/caolan/dispatch)
 *   * `SOCKET_IO` <- `npm install socket.io` -> [https://github.com/learnboost/socket.io](https://github.com/learnboost/socket.io)
 *   * `XML2JS` <- `npm install xml2js` -> [https://github.com/Leonidas-from-XIV/node-xml2js/](https://github.com/Leonidas-from-XIV/node-xml2js/)
 *   
 */

const PROXY_PORT = 9080;

//TEMPORARY: http://stackoverflow.com/questions/5919629/express-module-not-found-when-installed-with-npm
require.paths.push('/usr/local/lib/node_modules');

var SYS = require("sys"),
    CLI = require("cli"),
    Q = require("q"),
    PATH = require("path"),
    QS = require("querystring"),
    CONNECT = require("connect"),
    CONNECT_DISPATCH = require("../support/dispatch"),
    SOCKET_IO = require("socket.io"),
    CLIENT = require("../lib/client"),
    CLIENT_PROXY = require("../lib/proxy"),
    EXEC = require('child_process').exec,
    NET = require("net"),
    TIMERS = require("timers"),
    XML2JS = require("xml2js"),
	HELPER = require("../test/_helper");


var proxyServer = null,
    browserTestClients = [],
    browserTestIndex = 0,
    runningBrowserTests = {};


// See: https://github.com/chriso/cli/blob/master/examples/static.js
CLI.parse({
    verbose:  ["v", 'Log major events to console', 'boolean', false],
    debug:  ["d", 'Log debug messages to console', 'boolean', false],
    port:  [false, 'Listen on this port', 'number', PROXY_PORT],
	test: [false, 'Test mode. Must be pinged to stay alive!']
});

CLI.main(function(args, options)
{
    startServer(options);
});


function startServer(options)
{
	var lastPing = false;

    var app = CONNECT.createServer(

        CONNECT_DISPATCH({

            // Check if the server is running
            "/alive": function(req, res) {
                res.end("OK");
            },

            "/ping": function(req, res) {
                lastPing = new Date().getTime();
                res.end("OK");
            },
            
            // Called by client to trigger debug scripts for testing
            "/run-debug-script": function(req, res)
            {
            	var qs = QS.parse(req.url.replace(/^[^\?]*\?/, ""));
				HELPER.debugScript(qs.name, qs.session, options.port);
                res.end("OK");
            },

            // Called by `../test/_helper.js` to notify us that a new `rdebug-ide` instance
            // is ready to be connected to.
            "/debug-script": function(req, res)
            {
            	var qs = QS.parse(req.url.replace(/^[^\?]*\?/, ""));

            	var client = new CLIENT.Client({
    		    	verbose: options.verbose,
    		    	debug: options.debug,
    		        API: {
    		            TIMERS: TIMERS,
    		            NET: NET,
    		            XML2JS: XML2JS
    		        },
    		        connectTimeout: 2000,
    		        debugHost: "localhost",
    		        debugPort: qs.port,
    		        sessionName: qs.session
    		    });
            	
            	var connected = false;
            	
            	client.on("session", function(session)
            	{
            		if(session.name === qs.session)
            		{
	            		connected = true;
	                    res.end("OK");
            		}
            	});

                proxyServer.listen(client);
                
            	// If connection not successful within about three seconds we return failure.
                TIMERS.setTimeout(function()
                {
                	if (!connected)
                		res.end("FAIL");
                }, 3250);
            },
            
            // Run a browser client test. If no browser client connected
            // simulate a browser client by connecting one internally
            // for the duration of this test.
            "/run-browser-test": function(req, res) {
                try {
                	var qs = QS.parse(req.url.replace(/^[^\?]*\?/, ""));
                    Q.when(runBrowserTest(qs.test, qs.timeout), function() {
                        res.end(JSON.stringify({
                            success: true
                        }));
                    }, function(e) {
                        res.end(JSON.stringify({
                            error: ""+e
                        }));
                    });
                } catch(e) {
                    res.end(JSON.stringify({
                        error: ""+e
                    }));
                }
            },

            "/.*": CONNECT.static(__dirname + '/client', { maxAge: 0 })
        })
    );

    // If in test mode we stop when we are not pinged any more
    if (options.test)
    {
    	setInterval(function()
    	{
    		if (lastPing && (new Date().getTime() - lastPing) > 800) {
				process.exit(0);
    		}
    	}, 800);
    }

    var io = SOCKET_IO.listen(app);

    io.set("log level", 0);
    if (options.verbose)
        io.set("log level", 2);
    if (options.debug)
        io.set("log level", 3);

    // Initialize and hook in the debug proxy server so it can
    // communicate via `socket.io`.

    proxyServer = new CLIENT_PROXY.Server({
    	verbose: options.verbose,
    	debug: options.debug
    });

    proxyServer.hook({
        socketIO: io
    });
    
    proxyServer.on("session", function(session)
    {
    	if (session.name === "session-locked")
    	{
    		// Lock down the session to the client so no other client can listen in.
    		// See the `../test/session.js` *lockedSession* test.
    		
    		session.lockToClient("client-server-session-locked");
    	}
    });

    
    // Hook in browser test system
    io.of("/test").on("connection", function(socket)
    {
        browserTestClients.push(socket);
        socket.on("disconnect", function()
        {
            for (var i=browserTestClients.length-1 ; i >= 0 ; i-- ) {
                if (browserTestClients[i] === socket)
                    browserTestClients.splice(i, 1);
            }
        });
        socket.on("run-result", function(data)
        {
            if (browserTestClients.length > 0 && !runningBrowserTests["i:" + data.testIndex]) {
            	console.log("WARN: No promise found for run-result index: " + data.testIndex, runningBrowserTests);
                return;
            }
            if (data.success) {
                runningBrowserTests["i:" + data.testIndex].resolve();
            } else
            if (data.error) {
                runningBrowserTests["i:" + data.testIndex].reject("Browser test failed: " + data.error);
            } else
                throw new Error("Message data does not contain 'success' or 'error' key!");
            delete runningBrowserTests["i:" + data.testIndex];
        });
        socket.on("run-tests", function(data)
        {
            var command = "node " +  PATH.normalize(__dirname + "/../test/all --port " + options.port);
            EXEC(command, function (error, stdout, stderr)
            {
                SYS.puts("[proxyServer] " + stdout.split("\n").join("\n[proxyServer] ") + "\n");
            });
        });
        socket.emit("init");
    }); 

    app.listen(options.port);

    SYS.puts("Launched debug proxy server on port " + options.port + "\n");
}

function runBrowserTest(test, timeout)
{
    var result = Q.defer();
    
    // If a browser test client is connected we let it handle the test.
    // NOTE: The FIRST connected test client is always used to execute the test.
    if (browserTestClients.length > 0)
    {
        browserTestIndex++;
        runningBrowserTests["i:" + browserTestIndex] = result;
        browserTestClients[0].emit("run", { testIndex: browserTestIndex, test: test });
        setTimeout(function() {
            if (!Q.isResolved(result.promise) && !Q.isRejected(result.promise)) {
                delete runningBrowserTests["i:" + browserTestIndex];
                result.reject("Browser test took too long to finish (timeout: " + (timeout || 5000) + ")!");
            }
        }, timeout || 5000);
    }
    // If no browser test client connected we simulate a fake one
    else
    {
        // Dynamically require the test module
        require(PATH.normalize(__dirname + "/../test/browser/" + test)).run(CLIENT, {
            socketIO: proxyServer.fakeSocketClient()
        }, function(status)
        {
            if (status === true) {
                result.resolve();
            } else {
                result.reject(status);
            }
        });

        setTimeout(function() {
            if (!Q.isResolved(result.promise) && !Q.isRejected(result.promise)) {
                result.reject("Browser test took too long to finish (timeout: " + (timeout || 5000) + ")!");
            }
        }, timeout || 5000);
    }

    return result.promise;
}
