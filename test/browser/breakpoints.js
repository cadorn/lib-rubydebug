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
        	options.helpers.debugScript("Simple", "breakpoints-browser");
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
				if (!/\/scripts\/Simple\.rb$/.test(args[0].file)) ASSERT.fail(null, null, "file");
				
				var file = args[0].file;

				// @see http://bashdb.sourceforge.net/ruby-debug.html#Breakpoints
	            session.sendCommand("break", [file + ":4"], null, function(args, data, raw)
	            {
    				ASSERT.equal(args.no, "1");
    				
    				// @see http://bashdb.sourceforge.net/ruby-debug.html#Breakpoints
		            session.sendCommand("break", [file + ":9"], null, function(args, data, raw)
		            {
        				ASSERT.equal(args.no, "2");

        	        	session.sendCommand("cont");
		            });
	            });
            });

            var bIndex = 0;

            session.on("event", function(event)
            {
                if (event.type === "status" && event.status === "break")
                {
                	if (bIndex === 0)
                	{
        				ASSERT.equal(event.args.line, "4");
                		
        				// List breakpoints
        				// @see https://github.com/cadorn/ruby-debug-ide/blob/master/lib/ruby-debug-ide/commands/breakpoints.rb#L68-90
        	            session.sendCommand("info", ["break"], null, function(args, data, raw)
	    	            {
							ASSERT.equal(args.length, 2);

							ASSERT.equal(args[0].n, "1");
							ASSERT.equal(args[0].line, "4");

							ASSERT.equal(args[1].n, "2");
							ASSERT.equal(args[1].line, "9");

							// Continue to next breakpoint
            	        	session.sendCommand("cont");
	    	            });

        	            bIndex++;
                	}
                	else
                	if (bIndex === 1)
                	{
        				ASSERT.equal(event.args.line, "9");

        				// Continue to end of script
        	        	session.sendCommand("cont");
                		
        				bIndex++;
                	}
                }
            });
        });
       
        client.on("disconnect", function(data)
        {
        	callback(true);
        });

        client.connect({
        	id: "client-browser-breakpoints"
        });        
    }

});
