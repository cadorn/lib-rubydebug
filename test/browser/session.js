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

define(function(require, exports, module)
{

    exports.run = function(ASSERT, CLIENT, options, callback)
    {
        var client = new CLIENT.Client(options);

        client.on("connect", function(data)
        {
        	options.helpers.debugScript("HelloWorld", "session-browser");
        });

        client.on("session", function(session)
        {
            session.on("end", function(status)
            {
                client.disconnect();
            });
            
            // @issue https://github.com/ruby-debug/ruby-debug-ide/issues/9 (currently implemented by watching script output)
            session.sendCommand("set", ["stdout", "1"], null, function(args, data, raw)
            {
				ASSERT.equal(args[0], "stdout");
				ASSERT.equal(args[1], "1");

                session.sendCommand("set", ["stderr", "1"], null, function(args, data, raw)
                {
    				ASSERT.equal(args[0], "stderr");
    				ASSERT.equal(args[1], "1");

    	        	// @see http://bashdb.sourceforge.net/ruby-debug.html#Continue
    	        	session.sendCommand("cont");
                });
            });
        });

        client.on("disconnect", function(data)
        {
        	callback(true);
        });

        client.connect({
        	id: "client-browser-session"
        });
    }

});
