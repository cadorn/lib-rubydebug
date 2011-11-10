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
        	options.helpers.debugScript("Simple", "commandFlood-browser");
        });

        client.on("session", function(session)
        {
            session.on("end", function(status)
            {
                client.disconnect();
            });

			// @see http://bashdb.sourceforge.net/ruby-debug.html#Backtrace
            session.sendCommand("where", [], null, function(args, data, raw)
            {
                var t = 0;

                if (!/\/scripts\/Simple\.rb$/.test(args[0].file)) ASSERT.fail(null, null, "file");
				
				var file = args[0].file;
            
				// NOTE: For command "flooding" to work there must be sufficient logic in
				//		 https://github.com/ajaxorg/lib-rubydebug/blob/02954f8f8b472f4fb26c6c424b58b76965e140d4/lib/client.js#L475
				//		 to split out multiple command responses that were combined in the same parent XML!
				// TODO: Improve rdebug-ide protocol to separate each command response and pass through a command ID to
				//		 match command requests to command responses.
				// @see http://bashdb.sourceforge.net/ruby-debug.html#Breakpoints
			    t += 1; session.sendCommand("break", [file + ":2"], null, function(args, data, raw) { t -= 1; next1(args); });
			    t += 1; session.sendCommand("break", [file + ":3"], null, function(args, data, raw) { t -= 1; next1(args); });
			    t += 1; session.sendCommand("break", [file + ":4"], null, function(args, data, raw) { t -= 1; next1(args); });
			    t += 1; session.sendCommand("break", [file + ":8"], null, function(args, data, raw) { t -= 1; next1(args); });
			    t += 1; session.sendCommand("break", [file + ":9"], null, function(args, data, raw) { t -= 1; next1(args); });

			    function next1(args)
	            {
					ASSERT.equal(args.no, 5-t);

					if (t !== 0)
						return;

					// List breakpoints
					// @see https://github.com/cadorn/ruby-debug-ide/blob/master/lib/ruby-debug-ide/commands/breakpoints.rb#L68-90
		            session.sendCommand("info", ["break"], null, function(args, data, raw)
		            {
						ASSERT.equal(args.length, 5);
	
						ASSERT.equal(args[0].n, "1");
						ASSERT.equal(args[0].line, "2");
	
						ASSERT.equal(args[4].n, "5");
						ASSERT.equal(args[4].line, "9");

						// Continue to first breakpoint
	    	        	session.sendCommand("cont");
		            });				
	            }

	            session.on("event", function(event)
	            {
	                if (event.type === "status" && event.status === "break")
	                {
        				// Continue to next breakpoint or end of script
        	        	session.sendCommand("cont");
	                }
	            });			    
            });
        });
        
        client.on("disconnect", function(data)
        {
        	callback(true);
        });

        client.connect({
        	id: "client-browser-commandFlood"
        });        
    }

});
