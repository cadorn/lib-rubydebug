ruby-debug client written in JavaScript
=======================================

*Status: dev*

This project includes:

  * An implementation of the [ruby-debug-ide Protocol](http://debug-commons.rubyforge.org/protocol-spec.html):
    * Can run in the browser and on the server.
  * An intelligent [nodejs](http://nodejs.org/) based *ruby-debug-ide* proxy server:
    * Expose an async *ruby-debug-ide* interface to the browser via [socket.io](http://socket.io/).
    * Control *ruby-debug* from the server, the browser or both at the same time.
  * A *ruby-debug-ide* client library that connects to *ruby-debug-ide* directly or to the proxy server.
  * A client UI showing events as they are executed used for development and testing.

NOTE: The *ruby-debug-ide* protocol specification as documented [here](http://debug-commons.rubyforge.org/protocol-spec.html)
is not complete. More [commands](http://bashdb.sourceforge.net/ruby-debug.html) are available. Missing commands
may be implemented [here](https://github.com/JetBrains/ruby-debug-ide).


Usage
=====

Requirements
------------

  * [node.js](http://nodejs.org/) & *npm*
  * Ruby 1.8
  * `gem install ruby-debug` >= 0.4.16
  * `gem install ruby-debug-ide` >= 0.10.4

Install
-------

    npm install connect socket.io socket.io-client cli q xml2js
    git clone git://github.com/ajaxorg/lib-rubydebug.git
    cd lib-rubydebug
    git checkout dev
    git submodule init
    git submodule update

Setup
-----

Launch debug proxy server:

    node ./example/server --port 9080

Use `-v` to log major events to console and `-d` to log debug messages to console.

Test
----

The following will run a bunch of tests to cover all supported use-cases:

    node ./test/all --port 9080 --skip-browser-tests

TIP: If the example client is open at `http://localhost:9080/` it will show the progress of
the tests if the `--skip-browser-tests` argument is omitted.

Demo
----

Open the example client at `http://localhost:9080/` (served from the debug proxy server).

You can now use the client to run the test suite using the `Run All Tests` link.


Author
======

The original implementation of this project is by [Christoph Dorn](http://www.christophdorn.com/).


License
=======

The MIT License

Copyright(c) 2011 Ajax.org B.V. <info AT ajax DOT org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
