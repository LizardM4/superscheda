function Hier() {
    this.obj = new Object();

    this.parsePath = function(path) {
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

    this.ensureParentExists = function(path) {
        if (typeof path === 'string') {
            path = this.parsePath(path);
        }
        var node = this.obj;
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

    this.set = function(path, value) {
        if (typeof path == 'string') {
            path = this.parsePath(path);
        }
        var node = this.ensureParentExists(path);
        node[path[path.length - 1]] = value;
        return this;
    }

    this.get = function(path) {
        if (typeof path == 'string') {
            path = this.parsePath(path);
        }
        var node = this.ensureParentExists(path);
        var lastEntry = path[path.length - 1];
        if (!(lastEntry in node)) {
            node[lastEntry] = null;
        }
        return node[lastEntry];
    }

    this.dump = function() {
        return JSON.stringify(this.obj, null, 4);
    }

};

document.hier = new Hier();
