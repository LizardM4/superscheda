// Superscheda
// Copyright (C) 2017  Pietro Saccardi
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//


function Hier() {
    var self = this;

    self.obj = new Object();

    self.parsePath = function(path) {
        path = path.split('.');
        for (var i = 0; i < path.length; ++i) {
            var openBracketIdx = path[i].indexOf('[');
            if (openBracketIdx >= 0) {
                var item_idx = parseInt(path[i].substr(openBracketIdx + 1, path[i].length - 1));
                path[i] = path[i].substr(0, openBracketIdx);
                path.splice(i + 1, 0, item_idx);
                ++i;
            }
        }
        return path;
    };

    self.ensureParentExists = function(path) {
        if (typeof path === 'string') {
            path = self.parsePath(path);
        }
        var node = self.obj;
        for (var i = 0; i < path.length - 1; i++) {
            if (!(path[i] in node)) {
                if (i < path.length - 1 && typeof path[i + 1] === 'number') {
                    // create a new array
                    node[path[i]] = new Array();
                } else {
                    node[path[i]] = new Object();
                }
            }
            node = node[path[i]];
        }
        return node;
    };

    self.set = function(path, value) {
        if (typeof path == 'string') {
            path = self.parsePath(path);
        }
        var node = self.ensureParentExists(path);
        node[path[path.length - 1]] = value;
        return self;
    }

    self.get = function(path) {
        if (typeof path == 'string') {
            path = self.parsePath(path);
        }
        var node = self.ensureParentExists(path);
        var lastEntry = path[path.length - 1];
        if (!(lastEntry in node)) {
            node[lastEntry] = null;
        }
        return node[lastEntry];
    }

    self.dump = function() {
        return JSON.stringify(self.obj, null, 4);
    }

    self.load = function(json_txt) {
        self.obj = JSON.parse(json_txt);
    }

    self.getArraySizes = function() {
        var retval = [];
        var step = function(path, obj) {
            if (obj instanceof Array) {
                retval.push([path, obj.length]);
                for (var i = 0; i < obj.length; ++i) {
                    step(path + '[' + i.toString() + ']', obj[i]);
                }
            } else if (obj instanceof Object) {
                for (var key in obj) {
                    step(path + '.' + key, obj[key]);
                }
            }
        };
        for (var key in self.obj) {
            step(key, self.obj[key]);
        }
        return retval;
    };

    self.flatten = function() {
        var retval = {};
        var step = function(path, obj) {
            if (obj instanceof Array) {
                for (var i = 0; i < obj.length; ++i) {
                    step(path + '[' + i.toString() + ']', obj[i]);
                }
            } else if (obj instanceof Object) {
                for (var key in obj) {
                    step(path + '.' + key, obj[key]);
                }
            } else {
                retval[path] = obj;
            }
        };
        for (var key in self.obj) {
            step(key, self.obj[key]);
        }
        return retval;
    }

};

