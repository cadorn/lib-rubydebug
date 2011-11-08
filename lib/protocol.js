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
 *   A JavaScript implementation of the [ruby-debug-ide Protocol](http://debug-commons.rubyforge.org/protocol-spec.html)
 *   used by [ruby-debug-ide](https://github.com/ruby-debug/ruby-debug-ide).
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
    var PacketParser = exports.PacketParser = function(options)
    {
        this.API = options.API;
        this.options = options;
        this.listeners = {};
        this.buffer = "";

        if (!this.API.XML2JS)
            throw new Error("No converter API at `options.API.XML2JS`!");
    }
    
    PacketParser.prototype.on = function(name, callback)
    {
        if (!this.listeners[name])
            this.listeners[name] = [];
        this.listeners[name].push(callback);
    }

    PacketParser.prototype.emit = function(name, args)
    {
        if (!this.listeners[name])
            return;
        args = args || {};
        for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
            this.listeners[name][i].call(null, args);
        }
    }

    PacketParser.prototype.parseChunk = function(chunk)
    {
        var self = this;

        // @see http://debug-commons.rubyforge.org/protocol-spec.html#SEC2

        // XML formatted chunks come in without any delimiter for when a message
        // starts or ends. We thus look for known start tags and buffer until end tag received.
        // TODO: Use a proper SAX parser here?
        if (
            (/^<frames>/.test(chunk) && !/<\/frames>$/.test(chunk)) ||
       		(/^<frame .*?\/>$/.test(chunk) && this.buffer !== "") ||
       		(/^<variables>/.test(chunk) && !/<\/variables>$/.test(chunk)) ||
       		(/^<variable .*?\/>$/.test(chunk) && this.buffer !== "") ||
       		(/^<breakpoints>/.test(chunk) && !/<\/breakpoints>$/.test(chunk)) ||
       		(/^<breakpoint .*?\/>$/.test(chunk) && this.buffer !== "")
       	) {
        	this.buffer += chunk;
        	return;
        } else
        if (
            /<\/frames>$/.test(chunk) ||
            /<\/variables>$/.test(chunk) ||
            /<\/breakpoints>$/.test(chunk)
        ) {
        	chunk = this.buffer + chunk;
        	this.buffer = "";
        }
        
        var parts = [chunk];
        
        if (this.options.debug)
        	console.log("[protocol][parts]", parts);

        var data;

        while(parts.length > 0)
        {
        	data = parts.shift();

        	// Check if we need to convert the XML message to a JSON one
            if (/^<.*>$/.test(data))
            {
                var parser = new this.API.XML2JS.Parser();
                parser.addListener("end", function(result)
                {
                	var tag = Object.keys(result)[0],
                		packet = result[tag];
                	packet.__tag = tag;

                	self.emit("packet", packet);
                });
                parser.parseString('<doc>' + data + '</doc>');
            }
            else
                throw new Error("Cannot parse chunk. Chunk not in XML format!");
        }
    }

    exports.formatCommand = function(name, args)
    {
        // 4.2 Command Syntax
        // @see http://bashdb.sourceforge.net/ruby-debug.html#Command-Syntax
        
        // <command> [<arg1>][ <arg2>]\n
        var command = [ name ];
        if (args.length > 0) {
        	command = command.concat(args);
        }

        return command.join(" ") + "\n";
    }

});
