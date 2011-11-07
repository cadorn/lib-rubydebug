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
        	options.helpers.debugScript("Simple", "stepping-browser");
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

    				// @see http://bashdb.sourceforge.net/ruby-debug.html#Backtrace
                    session.sendCommand("where", [], null, function(args, data, raw)
                    {
        				ASSERT.equal(args[0].line, "1");

        				next1();
                    });
                });
            });

            // Line: 0-4
            function next1()
            {
            	// @see http://bashdb.sourceforge.net/ruby-debug.html#Step
                session.sendCommand("step", ["1"], null, function(args, data, raw)
                {
					if (!/\/scripts\/Simple\.rb$/.test(args.file)) ASSERT.fail(null, null, "file");
    				ASSERT.equal(args.line, "2");

                	// @see http://bashdb.sourceforge.net/ruby-debug.html#Next
                    session.sendCommand("next", ["2"], null, function(args, data, raw)
                    {
    					if (!/\/scripts\/Simple\.rb$/.test(args.file)) ASSERT.fail(null, null, "file");
        				ASSERT.equal(args.line, "4");

        				next2();
                    });
                });
            }

            // Line: 4
            function next2()
            {
            	// @see http://bashdb.sourceforge.net/ruby-debug.html#PrintVars
                session.sendCommand("var", ["local"], null, function(args, data, raw)
                {
    				ASSERT.equal(args.length, 2);

    				ASSERT.equal(args[0].name, "var1");
    				ASSERT.equal(args[0].type, "Hash");
    				ASSERT.equal(args[0].value, "Hash (2 element(s))");
    				ASSERT.equal(args[0].hasChildren, "true");
                	
    				ASSERT.equal(args[1].name, "var2");
    				ASSERT.equal(args[1].type, "String");
    				ASSERT.equal(args[1].value, "val2");
    				ASSERT.equal(args[1].hasChildren, "false");

    				// TODO: How do you drill down into the hash (var1)?
    				
    				next3();
                });
            }

            // Line: 9
            function next3()
            {
            	// @see http://bashdb.sourceforge.net/ruby-debug.html#Step
                session.sendCommand("step", ["6"], null, function(args, data, raw)
                {
    				ASSERT.equal(args.line, "9");
                	
                	// @see http://bashdb.sourceforge.net/ruby-debug.html#PrintVars
                    session.sendCommand("var", ["local"], null, function(args, data, raw)
                    {
        				ASSERT.equal(args.length, 1);

        				ASSERT.equal(args[0].name, "in1");
        				ASSERT.equal(args[0].type, "Hash");
        				ASSERT.equal(args[0].value, "Hash (2 element(s))");
        				ASSERT.equal(args[0].hasChildren, "true");

        				next4();
                    });
                });
            }            

            // Line: 9
            function next4()
            {
				session.sendCommand("where", null, null, function(args, data, raw)
		        {
					if (!/\/scripts\/Simple\.rb$/.test(args[0].file)) ASSERT.fail(null, null, "file");

					// NOTE: The 'file-source' command is implemented as part of 'lib-rubydebug' and not 'rdebug-ide`
					// TODO: Implement 'file-source' as part of 'rdebug-ide`
					session.sendCommand("file-source", [args[0].file], null, function(args, data, raw)
			        {
						if (!/^print "Line 1\\n"\n/.test(data)) ASSERT.fail(null, null, "file-source");
						if (!/\nprint "Line 3\\n"$/.test(data)) ASSERT.fail(null, null, "file-source");

						next5();
			        });
                });
            }

            function next5()
            {
	        	// @see http://bashdb.sourceforge.net/ruby-debug.html#Continue
            	session.sendCommand("cont");
            }
        });

        client.on("disconnect", function(data)
        {
        	callback(true);
        });

        client.connect({
        	id: "client-browser-stepping"
        });        
    }

});
