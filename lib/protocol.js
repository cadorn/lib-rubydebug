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
 *   used by [ruby-debug-ide](https://github.com/JetBrains/ruby-debug-ide).
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
        
/*        
        TODO: See if partial chunks or miltiple commands come in and if we can separate answers/events by newline.
        // If chunk does not end in delimiter we got a partial chunk and need to buffer it.
        if (this.buffer !== "") {
        	chunk = this.buffer + chunk;
        	this.buffer = "";
        }
        if (!/\u0000$/.test(chunk)) {
        	this.buffer = chunk;
        	// TODO: Parse as much of the buffer as we can right away
			return;
        }
        var parts = chunk.split(/\n/g);
*/
        var parts = [chunk];

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
                    self.emit("packet", result);
                });
                parser.parseString(data);
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
