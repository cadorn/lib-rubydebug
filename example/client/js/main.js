
/**
 * Configure RequireJS
 */
require({
    packagePaths: {
        "packages": [
            "lib-rubydebug",
            {
                name: "lib-rubydebug-test",
                lib: "browser",
            }
        ]
    }
});


/**
 * Boot example client
 */
require([
    "lib-rubydebug/client"
], function(CLIENT)
{
    require.ready(function()
    {

        registerTestRunner();
        
        initUI(CLIENT);
        
        initDefaultClient(CLIENT);

    });
});


/**
 * Register a test runner that can be triggered from the proxy server
 * to run a specific test on the client and report back the result
 * to the server.
 */
function registerTestRunner()
{
    // Connect to the "test" socket.io namespace
    var socketIO = io,
        testSocket = socketIO.connect("http://localhost/test");
    testSocket.on("run", function (data) {
        try {
            // Load the requested test module and run it reporting result back to server
            require(["lib-rubydebug-test/" + data.test, "lib-rubydebug/client"], function(testModule, CLIENT) {
                try {
                    testModule.run({
                    	equal: function(actual, expected, message)
                    	{
                    		if (actual != expected)
                    			console.error("Assertion error: " + message, {actual: actual, expected:expected});
                    	},
                    	fail: function(actual, expected, message)
                    	{
                    		if (actual != expected)
                    			console.error("Assertion error: " + message, {actual: actual, expected:expected});
                    	}
                    },
                    CLIENT, {
                        socketIO: socketIO,
                        listenPort: 80,
                        helpers: {
                            debugScript: function(name, sessionName)
                            {
                            	$.ajax({
                        		    type: 'POST',
                        		    url: "/run-debug-script?name=" + name + "&session=" + sessionName,
                        		    data: ""
                        		});
                            }
                        }
                    }, function(result) {
                        if (result === true) {
                            testSocket.emit("run-result", { testIndex: data.testIndex, success: true });
                        } else {
                            testSocket.emit("run-result", { testIndex: data.testIndex, error: ""+result });
                        }
                    });
                } catch(e) {
                    testSocket.emit("run-result", { testIndex: data.testIndex, error: e + " " + e.stack });
                }
            });
        } catch(e) {
            testSocket.emit("run-result", { testIndex: data.testIndex, error: e + " " + e.stack });
        }
    });
    window.runTests = function() {
        testSocket.emit("run-tests");
    }
}


function initUI(CLIENT)
{
    var clients = {};

    function appendEvent(node, msg) {
        $('<div class="event">' + msg + '</div>').appendTo(node);
    }

    CLIENT.on("connect", function(client)
    {
        var clientNode = $('<div class="client"><h3>Client ID: ' + client.id + '</h3></div>').appendTo($("#clients"));

        appendEvent(clientNode, "Connect");
        
        client.on("disconnect", function()
        {
            appendEvent(clientNode, "Disconnect");
        
            setTimeout(function() {
                clientNode.remove();
            }, 5000);
        });
        
        client.on("session", function(session)
        {
            var sessionNode = $('<div class="session"><h3>Session ID: ' + session.id + '</h3></div>').appendTo(clientNode);

            appendEvent(sessionNode, "Start");

            session.on("ready", function()
            {
                appendEvent(sessionNode, "Ready");
            });

            session.on("end", function()
            {
                appendEvent(sessionNode, "End");
                
                setTimeout(function() {
                    sessionNode.remove();
                }, 5000);
            });
            
            session.on("*", function(name, args)
            {
                if (name === "event")
                {
                    if (args.type === "status")
                    {
                        appendEvent(sessionNode, "Status: " + args.status);
                    }
                    else
                    if (args.type === "command")
                    {
                        appendEvent(sessionNode, "Command: " + args.name);
                    }
                    else
                    if (args.type === "command-response")
                    {
                        appendEvent(sessionNode, "Command Response: " + args.name);
                    }
                    else
                    if (args.type === "stdout")
                    {
                        appendEvent(sessionNode, "STDOUT: " + args.data);
                    }
                    else
                        console.log("EVENT", name, args);
                }
                else
                if (name === "ready" || name === "end") {
                	// do nothing here (to prevent message in console)
                }
                else
                    console.log("EVENT", name, args);
            });
        });
    });
}

/**
 * A client that is always connected as long as the page is open.
 * When tests are run additional clients will be connected.
 */
function initDefaultClient(CLIENT)
{
    var client = new CLIENT.Client({
        socketIO: io
    });

    client.on("connect", function()
    {
    });

    client.connect({
    	id: "client-browser"
    });   
}
