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
 *   A [ruby-debug-ide](https://github.com/ruby-debug/ruby-debug-ide) client that connects to ruby-debug-ide directly
 *   (for use on server) or to the debug proxy server (for use in browser).
 *   
 *   Provides all the wrapping to make `./protocol` usable on server and in browser
 *   and abstracts the [ruby-debug-ide Protocol](http://debug-commons.rubyforge.org/protocol-spec.html) to
 *   hide low-level connection and session logic.
 *   
 */

/**
 * AMD wrapper if running on server
 */
if (typeof define === "undefined")
{
    var define = function(factory)
    {
        factory(require, exports, module);
    };
}

define(function(require, exports, module)
{

    var PROTOCOL = require("./protocol");


    var listeners = {},
        clients = {},
        clientCounter = 0,
        sessionCounter = 0;

    
    /**
     * Listen to global ruby-debug events
     */
    exports.on = function(name, callback)
    {
        if (!listeners[name])
            listeners[name] = [];
        listeners[name].push(callback);
    }
    
    /**
     * Dispatch global ruby-debug events
     */
    function emit(name, args)
    {
        if (!listeners[name])
            return;
        args = args || null;
        for (var i=0, ic=listeners[name].length ; i<ic ; i++) {
            listeners[name][i].call(null, args);
        }
    }


    /**
     * A ruby-debug-ide client for use on the server and the browser.
     * 
     * Browser use (connects to proxy server):
     * 
     *   new Client({
     *      socketIO: $socket_io_instance
     *   });
     * 
     * Server use (connect to a ruby-debug-ide instance):
     *   
     *   new Client({
     *      API: {
     *          NET: require("net"),        // <- nodejs native
     *          TIMERS: require("timers"),  // <- nodejs native
     *          FS: require("fs"),        	// <- nodejs native
     *          XML2JS: require("xml2js")   // <- `npm install xml2js` -> https://github.com/Leonidas-from-XIV/node-xml2js/
     *      },
     *      debugHost: "localhost",
     *      debugPort: 9001,
     *      sessionName: "<sessionName>"
     *   });
     *   
     * Server use (connects to proxy server):
     *   
     *   new Client({
     *      socketIO: $proxy_server_fake_socket_io_client_instance
     *   });
     * 
     * @param Object options
     */
    var Client = exports.Client = function(options)
    {
        options.namespace = options.namespace || "/lib-rubydebug";

        this.API = options.API;
        this.options = options;
        this.options.connectTimeout = this.options.connectTimeout || 5000;
        this.debug = this.options.debug || false;
        this.verbose = this.options.verbose || false;
        this.listeners = {};
        this.sessions = {};
        this.connected = false;
        // NOTE: The client ID is unique to the environment only, not globally!
        //       A custom ID may be set via `connect()`.
        this.id = "client-" + (++clientCounter);
    };

    Client.prototype.on = function(name, callback)
    {
        if (!this.listeners[name])
            this.listeners[name] = [];
        this.listeners[name].push(callback);
    }

    Client.prototype.emit = function(name, args)
    {
        if (this.listeners[name]) {
            args = args || {};
            for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
                this.listeners[name][i].call(null, args);
            }
        }
        if (this.listeners["*"]) {
            for (var i=0, ic=this.listeners["*"].length ; i<ic ; i++) {
                this.listeners["*"][i].call(null, name, args);
            }
        }
    }

    Client.prototype.connect = function(options)
    {
    	options = options || {};
    	
        var self = this;
        
        if (this.connected)
            throw new Error("Client already connected!");

    	if (options.id)
    		self.id = options.id;
        
        if (typeof this.options.debugPort !== "undefined")
        {
            this.engineServer = null;
            initDebuggerEngineListener();
        }
        else
        if (typeof this.options.socketIO !== "undefined")
        {
            this.proxySocket = null;
            initProxyListener();
        }
        else
            throw new Error("No `debugPort` nor `socketIO` key set in `options`.");

        /**
         * Listen for ruby-debug debugger engine connections on port `this.options.debugPort`.
         */
        function initDebuggerEngineListener()
        {
        	self.engineSocket = new self.API.NET.Socket({
        		type: "tcp4"
        	});
        	
        	var connectIntervalId;

        	self.engineSocket.on("connect", function()
        	{
    			self.API.TIMERS.clearInterval(connectIntervalId);
				
	        	self.connected = true;

	            clients[self.id] = self;
	            
	            self.emit("connect");
	            emit("connect", self);

	            var session = new Session(self.options);
        		
                session.on("ready", function()
                {
                    self.sessions[session.id] = session;

                    self.emit("session", session);
                    
                    if (self.verbose)
                    	console.log("Got `ready` for session '" + session.name + "' and client '" + self.id + "'.");
                });
                
                session.on("end", function()
                {
                    delete self.sessions[session.id];
                    
                    if (self.verbose)
                    	console.log("Got `end` for session '" + session.name + "' and client '" + self.id + "'.");
                    
                    // When session ends we disconnect client as only one session 
                    // per connection is supported by `ruby-debug-ide`.
                	self.disconnect();
                });

                try {
                	session.listen(self.engineSocket);
                } catch(e) {
                	console.error("Error '" + e.message + "' setting up session listener for socket.");
                	self.disconnect();
                }
            });
        	
        	// Register error handler so nodejs does not exit but we do not need it.
        	self.engineSocket.on("error", function() {});
        	
        	// Try to connect repeatedly every 250ms until successful or timeout.
        	var connectAttempt = 0;
        	connectIntervalId = self.API.TIMERS.setInterval(function()
        	{
        		connectAttempt++;
        		try {
        			self.engineSocket.connect(self.options.debugPort, self.options.debugHost);
        		} catch(e) {}
        		
        		if ( (connectAttempt * 250) > self.options.connectTimeout)
        		{
        			self.API.TIMERS.clearInterval(connectIntervalId);
        		}
        	}, 250);
        }

        /**
         * Connect to a debug proxy server via `this.options.socketIO`.
         */
        function initProxyListener()
        {
            function triggerConnect()
            {
                if (clients[self.id])
                    return;

                clients[self.id] = true;

                self.proxySocket.emit("connect-client", {
                	id: self.id
                }, function()
                {
                    self.connected = true;

                    clients[self.id] = self;

                    emit("connect", self);
                    self.emit("connect");
                });
            }
            
            self.proxySocket = self.options.socketIO.connect('http://localhost:' + (self.options.socketIOPort || "") + self.options.namespace, {
                reconnect: true
            });

            self.proxySocket.on("connect", function()
            {
                triggerConnect();
            });

            self.proxySocket.on("reconnect", function()
            {
                triggerConnect();
            });

            self.proxySocket.on("disconnect", function()
            {
                self.disconnect();
            });
            
            self.proxySocket.on("event", function(event)
            {
                if (!self.connected)
                    return;

                if (!self.sessions[event.session])
                {
                    var session = self.sessions[event.session] = new Session();

                    session.on("end", function()
                    {
                        delete self.sessions[session.id];
                    });
                    
                    session.sync(self.proxySocket, event.session);

                    self.emit("session", session);
                }

                self.sessions[event.session].emit(event.type, event.args);
            });

            triggerConnect();
        }
    }

    Client.prototype.disconnect = function()
    {
        var self = this;
        
        if (!this.connected)
            return;

        function done()
        {
            self.connected = false;

            delete clients[self.id];

            self.emit("disconnect");
            emit("disconnect", self);
        }

        if (this.engineSocket)
        {
        	// TODO: Issue disconnect command (which will exit debug engine) if socket still live
        	if (Object.keys(this.sessions).length > 0)
        	{
        		console.log("Got DISCONNECT with session active. TODO: Issue `quit unconditionally` on session! (There is only one session)");
        	}
        	// TODO: See if socket still open and close
//            this.engineSocket.close();

        	this.engineSocket = null;
            done();
        }
        else
        if (this.proxySocket)
        {
            if (this.proxySocket.connected)
            {
                this.proxySocket.emit("disconnect-client", {}, function()
                {
                    done();
                });
            }
            else
            {
                done();
            }
        }
    }


    
    var Session = exports.Session = function(options)
    {
        var self = this;

        options = options || {};
        this.API = options.API;
        this.options = options;
        this.debug = this.options.debug || false;
        this.verbose = this.options.verbose || false;
        this.listeners = {};
        this.status = "init";   // init, ready, aborted, ended
        this.socketIO = null;
        this.socket = null;
        this.commandCounter = 0;
        this.commandCallbacks = {};
        this.commandCallbackStack = [];
        this.lockedClientId = false;
        this.runtimeOptions = {};
        
        this.on("ready", function()
        {
            self.status = "ready";
        });

        this.on("event", function(event)
        {
        	if (event.type === "command-response" && typeof self.commandCallbacks[event.id] === "function")
        	{
        		self.commandCallbacks[event.id](event.args, event.data, event.raw);
        		delete self.commandCallbacks[event.id];
        	}
        });
    }

    Session.prototype.on = function(name, callback)
    {
        if (!this.listeners[name])
            this.listeners[name] = [];
        this.listeners[name].push(callback);
    }

    Session.prototype.emit = function(name, args)
    {
        if (this.listeners[name]) {
            args = args || {};
            for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
                this.listeners[name][i].call(null, args);
            }
        }
        if (this.listeners["*"]) {
            for (var i=0, ic=this.listeners["*"].length ; i<ic ; i++) {
                this.listeners["*"][i].call(null, name, args);
            }
        }
    }
    
    Session.prototype.lockToClient = function(clientId)
    {
    	this.lockedClientId = clientId;
    	
    	if (this.verbose)
    		console.log("Locked session '" + this.name + "' to client '" + this.lockedClientId + "'.");
    }
    
    Session.prototype.listen = function(socket)
    {
        var self = this;
        
        this.socket = socket;

        var parser = new PROTOCOL.PacketParser({
            API: self.API
        });
        
        function stop()
        {
            // TODO: Collect data from debugger engine before issuing `stop` below.
            //       Client should register which data is to be collected when session initializes
            //       so we can just collect now and exit without needing client to issue a "stop".

            self.sendCommand("stop");
        }
        
        function processArrayCommandResponse(packet, rootNode)
        {
			var callbackInfo = self.commandCallbackStack.shift();
			if (typeof rootNode["@"] !== "undefined")
			{
			    self.emit("event", {type: "command-response", name: callbackInfo[1], id: callbackInfo[0], args: [rootNode["@"]], data: "", raw: packet});
			}
			else
			{
			    self.emit("event", {type: "command-response", name: callbackInfo[1], id: callbackInfo[0], args: rootNode.map(function(element)
			    {
			    	return element["@"];
			    }), data: "", raw: packet});
			}
        }

        parser.on("packet", function(packet)
        {
        	if (self.debug)
        		console.log("Got packet", packet);

			if (self.status === "ready")
			{
		        if (self.options.debug)
		        	console.log("[client][session] Got parsed packet: ", packet);

				// TODO: Check if package is NOT a command response

				if (typeof packet.variable !== "undefined")
				{
					processArrayCommandResponse(packet, packet.variable);
				}
				else
				if (typeof packet.frame !== "undefined")
				{
					processArrayCommandResponse(packet, packet.frame);
				}
				else
				if (typeof packet["@"] !== "undefined")
				{
                	var callbackInfo = self.commandCallbackStack.shift();
	                self.emit("event", {type: "command-response", name: callbackInfo[1], id: callbackInfo[0], args: packet["@"], data: "", raw: packet});
				}
	        }
	        else
	        if (self.status === "init")
	        {
	        	if (packet["@"] && packet["@"].threadId == 1 && packet["@"].line == 1 && packet["@"].frames == 1)
	        	{
	        		self.name = self.options.sessionName;
	        		
	                self.id = "session-" + (++sessionCounter) + "-" + self.name;
	        			                
	                self.emit("ready", {raw: packet});
	        	}
	        }
        });

        this.socket.on("data", function(chunk)
        {
	        if (self.options.debug)
	        	console.log("[client][socket] Got raw data: ", chunk.toString());
            parser.parseChunk(chunk.toString());
        });     

        this.socket.on("end", function()
        {
            if (self.status === "ended" || self.status === "aborted")
                return;
            // NOTE: For now the script runner must notify the debug server that the debug session has ended.
            // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (need output events to get rid of this)
            // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/8 (also needed so we don't exit until all output has been received)
            return;
            /*
            self.status = "aborted";
            self.emit("end", {
                aborted: true
            });
            */
        });

        // Our socket is connected and the debugger is ready. The first/root thread
        // is now in *sleep* mode.
        // We issue a `start` which will suspend the first/root thread because
        // it is assumed that `rdebug-ide` was started with `--stop`.
        self.sendCommand("start");
    }

    Session.prototype.sync = function(socketIO, id)
    {
        this.socketIO = socketIO;
        this.id = id;
    }

    Session.prototype.sendCommand = function(name, args, data, callback)
    {
    	// NOTE: `data` is not used but kept in the method signature for consistency with `lib-phpdebug`.
    	var self = this;
        if (this.socket)
        {
        	// Commands sent to `rdebug-ide` return with an answer but there is no way
        	// to deterministically (via an ID) associate the command sent with the answer 
        	// received. To accomplish this for the purpose of triggering command callbacks 
        	// it is expected that commands return an answer and that the first answer received 
        	// for a command is the answer for the first command sent and so on.
        	// This necessitates having a list of events that may be received that don't represent
        	// an answer to a command. This would apply to "stdout" and "stderr" data which may come in
        	// at any time.
        	// @see http://debug-commons.rubyforge.org/protocol-spec.html#SEC1
        	
            args = args || [];
            var commandID = "id" + (++this.commandCounter);
            if (typeof callback === "function")
            {
            	this.commandCallbacks[commandID] = callback;
            }

            // Only some commands generate a response
            if (name !== "start")
            {
            	this.commandCallbackStack.push([commandID, name]);
            }

            // Relay command to all clients for display
            // TODO: Only do this if option is set
            this.emit("event", {type: "command", name: name, args: args});

            // intercept some commands that are not supported by `rdebug-ide` natively (assuming we can fudge them)
            // NOTE: setTimeout() is needed here as the commandID returned by us is needed by caller before
            //       'command-response' events can be processed by the caller.
            if (name === "set" && (args[0] === "stdout" || args[0] === "stderr"))
            {
            	this.runtimeOptions["show-" + args[0]] = (args[1] === true || args[1] === 1 || args[1] === "1" || args[1] === "on")?true:false;
            	setTimeout(function()
            	{
                	var callbackInfo = self.commandCallbackStack.shift();
	                self.emit("event", {type: "command-response", name: name, id: callbackInfo[0], args: args, data: ""});
            	}, 10);
            }
            else
            if (name === 'file-source')
            {
            	var callbackInfo = self.commandCallbackStack.shift();
            	self.API.FS.readFile(args[0], 'utf8', function (err, data) {
            		if (err)
        			{
    	                self.emit("event", {type: "command-response", name: name, id: callbackInfo[0], args: {
    	                	"error": err
    	                }, data: ""});
        			}
	                self.emit("event", {type: "command-response", name: name, id: callbackInfo[0], args: {}, data: data});
        		});
            }
            else
            {
            	var cmd = PROTOCOL.formatCommand(name, args);

            	// send command to debug engine
	            this.socket.write(cmd);

	            if (this.verbose)
            		console.log("[send command] " + cmd);
            }

            return commandID;
        }
        else
        if (this.socketIO)
        {
            this.socketIO.emit("command", {
                session: this.id,
                name: name,
                args: args,
                data: data
            }, function(transactionID)
            {
                if (typeof callback === "function")
                {
                	self.commandCallbacks[transactionID] = callback;
                }
            });
        }
    }

});

