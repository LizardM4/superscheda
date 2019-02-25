const DDType = Object.freeze({
    INT:     Symbol('int'),
    RELINT:  Symbol('rel_int'),
    BOOL:    Symbol('bool')
});

class DDNode {

    get obj() {
        return this._$obj;
    }

    get parent() {
        return this._parent;
    }

    get path() {
        return this._path;
    }

    get children() {
        return this._children;
    }

    get id() {
        return this._id;
    }

    constructor($obj, parent=null) {
        this._$obj = $obj;
        this._parent = parent;
        this._children = [];
        this._childById = {};
        this._id = null;
        this._path = null;
        this._setup();
    }

    hasChild(child) {
        return this._childById[child.id] === child;
    }

    addChild(child) {
        console.assert(!(child.id in self._childById));
        this._children.push(child);
        this._childById[child.id] = child;
    }

    removeChild(child) {
        console.assert(this.hasChild(child));
        delete this._childById[child.id];
        const idx = this._children.indexOf(child);
        console.assert(idx >= 0);
        this._children.splice(idx, 1);
    }

    _setup() {
        this.obj.data('ddNode') = this;
        this._id = this.obj.attr('data-dd-id');
        if (this.parent) {
            this.parent.addChild(this);
            this._path = combinePath(this.parent, this);
        } else {
            this._path = this.id;
        }
        // Attributes for
    }

    childById(id) {
        const child = this._childById[id];
        if (typeof child === 'undefined') {
            return null;
        }
        return child;
    }

    childrenById(ids, filterMissing=true) {
        const children = ids.map(id => this.childById(id));
        if (filterMissing) {
            return children.filter(child => typeof child !== 'undefined');
        }
        return children;
    }

    static holdsData($obj) {
        return $obj.is('input[data-dd-path], select[data-dd-path], textarea[data-dd-path]');
    }

    static combinePath(parent, child) {
        return parent.path + '.' + child.id;
    }
}