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
    PATH = require("path"),
    FS = require("fs"),
    Q = require("q"),
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
	this.listeners = {};
	this.child = null;
};

Client.prototype.on = function(name, callback)
{
	if (!this.listeners[name])
		this.listeners[name] = [];
	this.listeners[name].push(callback);
};

Client.prototype.emit = function(name, args)
{
	if (!this.listeners[name])
	    return;
	args = args || null;
	for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
		this.listeners[name][i].call(null, args);
	}
};

Client.prototype.run = function()
{
	var self = this;

	try
	{
		// Debug a ruby script using `rdebug-ide` (https://github.com/ruby-debug/ruby-debug-ide)
		// Once `rdebug-ide` is initialized we need to connect to it.

		if (!PATH.existsSync(self.scriptPath))
		{
			self.emit("error", "Ruby script at path '" + self.scriptPath + "' not found!");
			return;
		}

		var args = [
			    "--stop",	// NOTE: Must start with `--stop`!
			    "--port", self.debugPort,
			    "--",
			    self.scriptPath
		    ];

		if (self.verbose)
		{
		    console.log("[debugScript][command] " + "rdebug-ide " + args.join(" "));
		}

		self.child = SPAWN("rdebug-ide", args);
	
		self.child.stdout.on("data", function(data)
		{
			self.sendOutput("stdout", data);
			if (self.verbose)
			    console.log("[debugScript][stdout] " + data);
		});
	
		self.child.stderr.on("data", function(data)
		{
			// Ignore debugger signature
			if (/^\s*Fast Debugger \(ruby-debug-ide/.test(data))
			{
				if (self.verbose)
					console.log("[debugScript] rdebug-ide session started!");
				return;
			}
			self.sendOutput("stderr", data);
			if (self.verbose)
				console.log("[debugScript][stderr] " + data);
		});
	
		self.child.on("exit", function (code)
		{
			self.child = null;

			if (self.verbose)
				console.log("[debugScript] Notify server via: debug-script-end");
			
			// Notify proxy server that debug session has ended
			// @issue https://github.com/ruby-debug/ruby-debug-ide/issues/8 (need session end notification event to get rid of this)
	        // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (also need output events to get rid of this)
			Q.when(self.postToServer("/lib-rubydebug/runner/debug-script-end?sessionID=" + self.sessionID), function(response)
			{
				if (self.verbose)
					console.log("[debugScript] Server notified via: debug-script-end");
				self.emit("end");
			});
		});

		function killSession()
		{
			if (self.child===null) return;
			if (self.verbose)
				console.log("[debugScript] Kill session '" + self.sessionName + "' due to non-connection by proxy server!");
			self.child.kill();
		}

		var connected = false;

		if (self.verbose)
			console.log("[debugScript] Notify server via: debug-script-start");

		// Notify proxy server of new `rdebug-ide` instance so it can connect to it.
		Q.when(self.postToServer("/lib-rubydebug/runner/debug-script-start?port=" + self.debugPort + "&sessionName=" + self.sessionName), function(response)
		{
			if (self.verbose)
				console.log("[debugScript] Server notified via: debug-script-start");

			if (response === "FAIL")
			{
				// proxy server failed to connect
				if (self.verbose)
					console.log("[debugScript] ERROR: Proxy server failed to connect!");
			}
			else
			{
				// proxy server has connected
				connected = true;
				self.sessionID = response;

				if (self.verbose)
					console.log("[debugScript] Proxy server connected for session ID: " + self.sessionID);
			}
		}, function(e)
		{
			killSession();
			self.emit("error", e);
		});

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

Client.prototype.forceEnd = function()
{
	if (this.child===null) return;
	console.log("[debugScript] Force end session '" + this.sessionName + "' by request!");
	this.child.kill('SIGKILL');
}

Client.prototype.sendOutput = function(type, data)
{
	if (!this.shouldSendOutput[type])
		return;

	// TODO: Buffer output?

	var self = this;

    // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (need output events to get rid of this)
	Q.when(this.postToServer("/lib-rubydebug/runner/debug-script-output?sessionID=" + this.sessionID + "&type=" + type, data), function(response)
	{
		// If server responds with "0" then output should not be sent for this session
		if (response === "0")
		{
			self.shouldSendOutput[type] = false;
		}
	});
}

Client.prototype.postToServer = function(path, data)
{
	var self = this;
	
	var result = Q.defer();

	var req = HTTP.request({
		  host: "localhost",
		  port: this.proxyPort,
		  path: path,
		  method: "POST"		
	});

	req.on("error", function(e) {
		if (this.verbose)
			console.error("[runner-client] Error '" + e.message + "' posting to: " + "http://localhost:" + self.proxyPort + path);
		result.reject("Error '" + e.message + "' posting to: " + "http://localhost:" + self.proxyPort + path);
	});
	
	var buffer = "";

	req.on("response", function(res)
	{
		res.on("data", function(chunk)
		{
			buffer += chunk;
		});

		res.on("end", function()
		{
			result.resolve(buffer);
		});
	});

	if (typeof data !== "undefined")
	    req.write(data);

	req.end();

	return result.promise;
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
		            XML2JS: XML2JS,
		            FS: FS
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
		console.log("[runner-server] Error '" + e + "' handeling runner client request!");
	}
}
