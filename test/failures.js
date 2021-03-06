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
 */

var HELPER = require("./_helper"),
    ASYNC = require("../support/asyncjs/index"),
    ASSERT = require("assert"),
    CLIENT = require("../lib/client");

var Test =
{
    name: "async",
    timeout: HELPER.getTestTimeout(),

    "test wrongScript": function(next)
    {
        var client = new CLIENT.Client(HELPER.getClientOptions());

        client.on("connect", function(data)
        {
        	HELPER.debugScript("NonExistentScript", "failures-wrongScript-server").on("error", function(message)
			{
        		if (/^Ruby script at path .*? not found!$/.test(message))
        		{
        			client.disconnect();
        		}
			});
        });

        client.on("disconnect", function(data)
        {
        	next();
        });

        client.connect({
        	id: "client-server-failures-wrongScript"
        });
    },

    "test proxyServerNotRunning": function(next)
    {
        var client = new CLIENT.Client(HELPER.getClientOptions());

        client.on("connect", function(data)
        {
        	HELPER.debugScript("HelloWorld", "failures-proxyServerNotRunning-server", 9123).on("error", function(message)
			{
        		if (/^Error 'ECONNREFUSED, Connection refused' posting to: .*?failures-proxyServerNotRunning-server$/.test(message))
        		{
        			client.disconnect();
        		}
			});
        });

        client.on("disconnect", function(data)
        {
        	next();
        });

        client.connect({
        	id: "client-server-failures-proxyServerNotRunning"
        });
    }
}

module.exports = require("../support/asyncjs/lib/test").testcase(Test);

if (module === require.main)
    HELPER.ready(function() {
        module.exports.run().report().summary(function(err, passed)
        {
        	HELPER.done(function()
	    	{
	    		process.exit(!err && passed ? 0 : 1);
	    	});
	    });
    });
