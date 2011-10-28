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
 *   A debug session runner to execute [ruby-debug-ide](https://github.com/ruby-debug/ruby-debug-ide) instances 
 *   and communicate extra information to the debug server.
 * 
 */

var TIMERS = require("timers"),
	SPAWN = require("child_process").spawn,
	HTTP = require("http"),
    NET = require("net"),
    QS = require("querystring"),
    XML2JS = require("xml2js"),
	CLIENT = require("../lib/client");

/**
 * A client that wraps the ruby-debug-ide exec instance and communicates
 * extra information to the server.
 * 
 * @param Object options
 */
var Client = exports.Client = function(options)
{
	this.sessionName = options.sessionName;
	this.proxyPort = options.proxyPort;
	this.scriptPath = options.scriptPath;
	this.debugPort = options.debugPort;
	this.verbose = options.verbose;
	this.shouldSendOutput = {
		"stdout": true,
		"stderr": true
	};
	this.sessionID = null;
};

Client.prototype.run = function()
{
	var self = this;

	try
	{
		// Debug a ruby script using `rdebug-ide` (https://github.com/ruby-debug/ruby-debug-ide)
		// Once `rdebug-ide` is initialized we need to connect to it.
	
		var child = SPAWN("rdebug-ide", [
		    "--stop",	// NOTE: Must start with `--stop`!
		    "--port", self.debugPort,
		    "--",
		    self.scriptPath
	    ]);
	
		child.stdout.on("data", function(data)
		{
			self.sendOutput("stdout", data);
			if (self.verbose)
			    console.log("[debugScript][stdout] " + data);
		});
	
		child.stderr.on("data", function(data)
		{
			// Ignore debugger signature
			if (/^\s*Fast Debugger \(ruby-debug-ide/.test(data))
				return;
			self.sendOutput("stderr", data);
			if (self.verbose)
				console.log("[debugScript][stderr] " + data);
		});
	
		child.on("exit", function (code)
		{
			child = null;
			
			// Notify proxy server that debug session has ended
			// @issue https://github.com/ruby-debug/ruby-debug-ide/issues/8 (need session end notification event to get rid of this)
	        // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (also need output events to get rid of this)
			self.postToServer(
				"/lib-rubydebug/runner/debug-script-end?sessionID=" + self.sessionID,
				function(res)
				{
					// we assume event was sent
				}
		    );
		});

		function killSession()
		{
			if (child===null) return;
			console.log("[debugScript] Kill session '" + self.sessionName + "' due to non-connection by proxy server!");
			child.kill();
		}

		var connected = false;

		// Notify proxy server of new `rdebug-ide` instance so it can connect to it.
		self.postToServer(
		    "/lib-rubydebug/runner/debug-script-start?port=" + self.debugPort + "&sessionName=" + self.sessionName,
			function(res)
			{
				res.on("data", function(chunk)
				{
					if ((""+chunk) == "FAIL")
					{
						// proxy server failed to connect
					}
					else
					{
						// proxy server has connected
						connected = true;
						self.sessionID = ""+chunk;
					}
				});
			}
		);

		// If the proxy server has not connected within about three seconds we kill the session
		TIMERS.setTimeout(function()
		{
			if (!connected)
				killSession();
		}, 3500);    	
	}
	catch(e)
	{
		console.log("Error '" + e + "' running ruby-debug-ide instance runner!");
	}
}

Client.prototype.sendOutput = function(type, data)
{
	if (!this.shouldSendOutput[type])
		return;

	// TODO: Buffer output?

	var self = this;

    // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (need output events to get rid of this)
	this.postToServer(
	    "/lib-rubydebug/runner/debug-script-output?sessionID=" + this.sessionID + "&type=" + type,
	    function(res)
		{
			res.on("data", function(chunk)
			{
				// If server responds with "0" then output should not be sent for this session
				if ((""+chunk) === "0")
				{
					self.shouldSendOutput[type] = false;
				}
			});
		},
		data
	);
}

Client.prototype.postToServer = function(path, successCallback, data)
{
	var req = HTTP.request({
		  host: "localhost",
		  port: this.proxyPort,
		  path: path,
		  method: "POST"		
	}, successCallback);

	req.on("error", function(e) {
	    console.error("Error '" + e.message + "' posting to: " + "http://localhost:" + self.proxyPort + path);
	});

	if (typeof data !== "undefined")
	    req.write(data);

	req.end();
}


/**
 * A server component that processes information from the runner client
 * and relays it to the debug proxy server.
 * 
 * @param Object options
 */
var Server = exports.Server = function(options)
{
	this.proxyServer = options.proxyServer;
	this.verbose = options.verbose;
	this.debug = options.debug;
};

Server.prototype.handleRequest = function(req, res)
{
	var self = this;

	try
	{
		
		var qs = QS.parse(req.url.replace(/^[^\?]*\?/, ""));
		
		if (/^\/lib-rubydebug\/runner\/debug-script-start/.test(req.url))
		{	
			var client = new CLIENT.Client({
		    	verbose: this.verbose,
		    	debug: this.debug,
		        API: {
		            TIMERS: TIMERS,
		            NET: NET,
		            XML2JS: XML2JS
		        },
		        connectTimeout: 2000,
		        debugHost: "localhost",
		        debugPort: qs.port,
		        sessionName: qs.sessionName
		    });
			
			var connected = false;
		
			client.on("session", function(session)
			{
				if(session.name === qs.sessionName)
				{
		    		connected = true;
		            res.end(session.id);
				}
			});
		
		    this.proxyServer.listen(client);
		    
			// If connection not successful within about three seconds we return failure.
		    TIMERS.setTimeout(function()
		    {
		    	if (!connected)
		    		res.end("FAIL");
		    }, 3250);
		}
		else
	    // Notify us that there is new stdout or stderr output for a debug session.
	    // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (need output events to get rid of this)
		if (/^\/lib-rubydebug\/runner\/debug-script-output/.test(req.url))
		{
	    	var data = "";
	    	req.addListener("data", function(chunk)
	    	{
	    		data += chunk;
	    	});
	    	req.addListener("end", function()
	    	{
				var session = self.proxyServer.sessionForID(qs.sessionID);
				
				if (session.runtimeOptions["show-" + qs.type])
				{
					session.emit("event", {type: qs.type, data: data});
				}
	
				res.end((session.runtimeOptions["show-" + qs.type]===true)?"1":"0");
	    	});
		}
		else
	    // Notify us that a debug session has ended
	    // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (need output events to get rid of this)
	    // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/8 (also needed so we don't exit until all output has been received)
		if (/^\/lib-rubydebug\/runner\/debug-script-end/.test(req.url))
		{
			var session = this.proxyServer.sessionForID(qs.sessionID);
			
			session.status = "ended";
			session.emit("end", {
			    aborted: false		// Assume everything went ok
			});
	
			res.end("OK");
		}
	}
	catch(e)
	{
		console.log("Error '" + e + "' handeling runner client request!");
	}
}
