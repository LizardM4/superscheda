'use strict';

const DDType = Object.freeze({
    INT:     Symbol('int'),
    FLOAT:   Symbol('float'),
    BOOL:    Symbol('bool'),
    STRING:  Symbol('string'),
    NONE:    Symbol('none')
});

const DFSEvent = Object.freeze({
    ENTER: Symbol('enter'),
    EXIT:  Symbol('exit')
});

function arrayEquals(l, r) {
    if (typeof l === 'undefined') {
        l = null;
    }
    if (typeof r === 'undefined') {
        r = null;
    }
    if ((l === null) !== (r === null)) {
        return false;
    } else if (l.length !== r.length) {
        return false;
    } else {
        for (let i = 0; i < l.length; ++i) {
            if (l[i] !== r[i]) {
                return false;
            }
        }
    }
    return true;
}


function arrayMultidimensionalPrefill(size, dims, defaultValue=null) {
    let retval = [];
    for (let i = 0; i < size; ++i) {
        if (dims > 1) {
            retval.push(arrayMultidimensionalPrefill(size, dims - 1));
        } else {
            retval.push(defaultValue);
        }
    }
    return retval;
}


class DDGraph {
    get root() {
        return this._root;
    }

    constructor() {
        this._root = new DDNode(this);
        this._descendantsByPath = {};
        this._leavesByPath = {};
    }

    buildFromDom($rootElement=null) {
        const elements = ($rootElement
            ? DDGraph.getElementsNotInGraph($rootElement, true)
            : DDGraph.getElementsNotInGraph($('body'), true)
        );
        elements.forEach(function (domElement) {
            const $domElement = $(domElement);
            const parentNode = this.findParentNode($domElement, $rootElement);
            console.assert(parentNode);
            new DDNode(this, $domElement, parentNode);
        }, this);
    }

    getRepresentation() {
        let depth = 0;
        let retval = '';
        this.root.traverse(function(evt, node) {
            if (evt === DFSEvent.ENTER) {
                ++depth;
                retval += ' '.repeat(depth - 1);
                if (node.holdsData) {
                    retval += ' - ' + node.baseId
                } else {
                    retval += '+ ' + node.baseId;
                }
                if (node.indices) {
                    retval += ' @ ' + node.indices.join(', ');
                }
                retval += '\n';
            } else {
                --depth;
            }
        });
        return retval;
    }

    descendantByPath(path) {
        const descendant = this._descendantsByPath[path];
        if (typeof descendant === 'undefined') {
            return null;
        }
        return descendant;
    }

    leafByPath(path) {
        const leaf = this._leavesByPath[id];
        if (typeof leaf === 'undefined') {
            return null;
        }
        return leaf;
    }

    _updateDescendant(oldPath, updatedDescendant) {
        console.assert(this._descendantsByPath[oldPath] === updatedDescendant);
        delete this._descendantsByPath[oldPath];
        this._descendantsByPath[updatedDescendant.path] = updatedDescendant;
        if (updatedDescendant.holdsData) {
            console.assert(this._leavesByPath[oldPath] === updatedDescendant);
            delete this._leavesByPath[oldPath];
            this._leavesByPath[updatedDescendant.path] = updatedDescendant;
        }
    }

    _addDescendant(descendant) {
        this._descendantsByPath[descendant.path] = descendant;
        if (descendant.holdsData) {
            this._leavesByPath[descendant.path] = descendant;
        }
    }

    _removeDescendant(descendant) {
        delete this._descendantsByPath[descendant.path];
        if (descendant.holdsData) {
            delete this._leavesByPath[descendant.path];
        }
    }

    _getDirectDescendantFilter($obj) {
        return (_, descendant) => {
            const node = this._getNodeOfDOMElement(descendant);
            return node && node.obj.parentsUntil($obj, '[data-dd-path]').length === 0;
        };
    }

    _getNodeOfDOMElement(domElement) {
        const path = domElement.getAttribute('data-dd-path');
        console.assert(path);
        return this.descendantByPath(path);
    }

    getChildrenNodes($domElement) {
        return $domElement.find('[data-dd-path]')
            .filter(this._getDirectDescendantFilter($domElement))
            .toArray()
            .map(domElement => this._getNodeOfDOMElement(domElement));
    }

    static getElementsNotInGraph($domParent, sortByDepth=true) {
        let results = $domParent
            .find('[data-dd-id]:not([data-dd-path])')
            .toArray();
        if (!sortByDepth) {
            return results.map(elm => $(elm));
        }
        // Create an array of [depth, object]
        for (let i = 0; i < results.length; i++) {
            const $item = $(results[i]);
            const relDepth = $item.parentsUntil($domParent, '[data-dd-id]').length;
            results[i] = [relDepth, $item];
        }
        // Sort that and then discard the depth
        results.sort((l, r) => l[0] - r[0]);
        return results.map(([relDepth, $item]) => $item);
    }

    findParentNode($domElement, $rootElement=null) {
        const candidates = $rootElement
            ? $domElement.parentsUntil($rootElement, '[data-dd-id]')
            : $domElement.parents('[data-dd-id]');
        if (candidates.length === 0) {
            return this.root;
        }
        return this._getNodeOfDOMElement(candidates[0]);
    }

    static indicesToString(indices) {
        if (typeof indices === 'number') {
            return '[' + indices.toString() + ']';
        } else if (!indices || indices.length === 0) {
            return '';
        } else {
            return '[' + indices.join('][') + ']';
        }
    }

    static parseIndicesFromId(suggestedId) {
        const baseIdAndIndices = /(.+?)((\[\d+\])*)$/
        const match = baseIdAndIndices.exec(suggestedId);
        console.assert(match);
        const baseId = match[1];
        let indices = match[2];
        if (indices) {
            indices = indices.substring(1, indices.length - 1).split('][').map(x => parseInt(x));
        } else {
            indices = null;
        }
        return [baseId, indices];
    }

    static holdsData($obj) {
        return $obj.is('input[data-dd-id], select[data-dd-id], textarea[data-dd-id]');
    }

    static inferType($obj) {
        if (!DDGraph.holdsData($obj)) {
            return DDType.NONE;
        }
        if ($obj.attr('type') === 'checkbox') {
            return DDType.BOOL;
        }
        const declaredType = $obj.attr('data-dd-type');
        if (declaredType) {
            const inferredType = DDType[declaredType.toUpperCase()];
            console.assert(inferredType);
            return inferredType;
        }
        return DDType.STRING;
    }

    static combinePath(parentPath, childId) {
        if (parentPath !== null) {
            return parentPath + '.' + childId;
        } else {
            return childId;
        }
    }

    static testVoid(type, rawValue) {
        if (type === DDType.BOOL) {
            return false; // Booleans are never void
        }
        if (type === DDType.NONE || rawValue === null) {
            return true;
        }
        switch (type) {
            case DDType.BOOL:
                // Already tested before
                break;
            case DDType.STRING:
                return rawValue.length === 0;
            case DDType.INT:
            case DDType.FLOAT:
                // Number types ignore the spaces
                return rawValue.trim().length === 0;
        }
        return false;
    }

    static castRawValue(type, rawValue, nullIfInvalid=false) {
        if (DDGraph.testVoid(type, rawValue)) {
            return null;
        }
        switch (type) {
            case DDType.INT: {
                    const intValue = parseInt(rawValue);
                    if (intValue !== intValue) {
                        if (nullIfInvalid) {
                            return null;
                        }
                    } else {
                        return intValue;
                    }
                }
                break;
            case DDType.FLOAT: {
                    const floatValue = parseFloat(rawValue);
                    if (floatValue !== floatValue) {
                        if (nullIfInvalid) {
                            return null;
                        }
                    } else {
                        return floatValue;
                    }
                }
                break;
            case DDType.STRING:
                // Nothing to do, already string.
                break;
            case DDType.BOOL:
                if (typeof rawValue !== 'boolean') {
                    if (nullIfInvalid) {
                        return null;
                    }
                }
                break;
        }
        return rawValue;
    }

    static formatValue(type, value) {
        if (typeof value === 'undefined' || value === null) {
            return '';
        }
        switch (type) {
            case DDType.INT:
            case DDType.FLOAT:
            case DDType.STRING:
                // Just cast to string
                break;
            case DDType.BOOL:
                // Do an explicit cast to bool
                return !!value;
                break;
        }
        return value.toString();
    }
}

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

    get holdsData() {
        return this._holdsData;
    }

    get baseId() {
        return this._baseId;
    }

    get indices() {
        return this._indices;
    }

    get type() {
        return this._type;
    }

    get isVoid() {
        return DDGraph.testVoid(this._getRawValue());
    }


    // TODO convert this into a method
    get isArrayMaster() {
        if (this.isRoot) {
            return false;
        }
        if (this.indices && this.indices.indexOf(-1) >= 0) {
            return true;
        }
        // Check parents
        return this.parent.isArrayMaster();
    }

    get value() {
        return DDGraph.castRawValue(this.type, this._getRawValue());
    }

    set value(v) {
        this._setRawValue(DDGraph.formatValue(this.type, v));
    }

    get isRoot() {
        return !this.parent;
    }

    get graph() {
        return this._graph;
    }

    get formulaValue() {
        if (this.isVoid) {
            return this._formulaValue;
        }
        return DDGraph.castRawValue(this.type, this._getRawValue(), true);
    }

    set formulaValue(v) {
        this._formulaValue = v;
        this._updateFormulaValue();
    }

    constructor(graph, $obj, parent=null) {
        this._graph = graph;
        if (typeof $obj === 'undefined') {
            // We are creating a root
            console.assert(typeof parent === 'undefined' || parent === null);
            parent = null
            $obj = null;
        }
        this._$obj = $obj;
        this._parent = parent;
        this._children = [];
        this._childById = {};
        this._id = null;
        this._arrayIndices = null;
        this._extraIndices = null;
        this._baseId = null;
        this._path = null;
        this._idx = null;
        this._isCheckbox = false;
        this._holdsData = false;
        this._formulaValue = null;
        this._type = DDType.NONE;
        if (!this.isRoot) {
            this._setup();
        }
    }

    _recacheIndices() {
        if (this._arrayIndices && this._extraIndices) {
            this._indices = this._arrayIndices.concat(this._extraIndices);
        } else if (this._arrayIndices) {
            this._indices = this._arrayIndices.slice();
        } else if (this._extraIndices) {
            this._indices = this._extraIndices.slice();
        } else {
            this._indices = null;
        }
    }

    hasChild(child) {
        console.assert(!this.holdsData);
        return this._childById[child.id] === child;
    }

    _updateChild(oldId, updatedChild) {
        console.assert(!this.holdsData);
        console.assert(this._childById[oldId] === updatedChild);
        delete this._childById[oldId]
        this._childById[updatedChild.id] = updatedChild;
    }

    _addChild(child) {
        console.assert(!this.holdsData);
        console.assert(!(child.id in this._childById));
        this._children.push(child);
        this._childById[child.id] = child;
    }

    _removeChild(child) {
        console.assert(!this.holdsData);
        console.assert(this.hasChild(child));
        delete this._childById[child.id];
        const idx = this._children.indexOf(child);
        console.assert(idx >= 0);
        this._children.splice(idx, 1);
    }

    _remove() {
        console.assert(!this.isRoot);
        this.obj.removeAttr('data-dd-path');
        this.graph.root._removeDescendant(this);
        this.parent._removeChild(this);
    }

    removeSubtree() {
        this.traverse(function(node, evt) {
            if (evt === DFSEvent.EXIT) {
                node._remove();
            }
        });
    }

    traverse(fn) {
        fn(DFSEvent.ENTER, this);
        if (this.children) {
            for (let i = 0; i < this.children.length; i++) {
                this.children[i].traverse(fn);
            }
        }
        fn(DFSEvent.EXIT, this);
    }

    _collectChildrenByIdWithoutIndices() {
        let retval = {};
        this.children.forEach(child => {
            if (child.isArrayMaster) {
                // TODO make an empty array here
            }
            let arrOrObj = retval[child.baseId];
            if (arrOrObj) {
                if (Array.isArray(arrOrObj)) {
                    arrOrObj.push(child);
                } else {
                    retval[child.baseId] = [arrOrObj, child];
                }
            } else {
                if (child.isArrayMaster) {
                    // Just an empty array
                    retval[child.baseId] = []
                } else {
                    retval[child.baseId] = child;
                }
            }
        });
        return retval;
    }

    static _assertArrayConsistency(childrenArray) {
        if (childrenArray.length === 0) {
            return;
        }
        let maxDim = 0;
        // First of all assert dimensionality
        for (let i = 0; i < childrenArray.length; i++) {
            console.assert(childrenArray[i].indices);
            console.assert(childrenArray[i].indices.length > 0);
            if (i > 0) {
                console.assert(childrenArray[i].indices.length == childrenArray[0].indices.length);
            }
            maxDim = Math.max(maxDim, childrenArray[i].indices.length);
        }
        // For each dimension, check the max index. Initialize to zero
        let maxIdxPerDim = arrayMultidimensionalPrefill(maxDim, 1, 0);
        for (let i = 0; i < childrenArray.length; ++i) {
            for (let j = 0; j < childrenArray[i].indices.length; ++j) {
                maxIdxPerDim[j] = Math.max(childrenArray[i].indices[j], maxIdxPerDim[j]);
            }
        }
        // Assert that they all coincide with the number of elements
        for (let i = 0; i < maxDim; ++i) {
            console.assert(maxIdxPerDim[i] === childrenArray.length - 1);
        }
    }

    static _getArrayOrder(childrenArray) {
        DDNode._assertArrayConsistency(childrenArray);
        let maxDim = 0;
        // First of all assert dimensionality
        for (let i = 0; i < childrenArray.length; i++) {
            maxDim = Math.max(maxDim, childrenArray[i].indices.length);
        }
        return maxDim;
    }

    static _buildMultidimensionalDataBagArray(childrenArray) {
        const dims = DDNode._getArrayOrder(childrenArray);
        let retval = arrayMultidimensionalPrefill(childrenArray.length, dims);
        for (let i = 0; i < childrenArray.length; ++i) {
            const child = childrenArray[i];
            let parentArray = retval;
            // Navigate all indices
            for (let j = 0; j < child.indices.length - 1; ++j) {
                parentArray = parentArray[child.indices[j]];
            }
            const lastIdx = child.indices[child.indices.length - 1];
            // Assign the value
            parentArray[lastIdx] = child.getDataBag();
        }
        return retval;
    }

    getDataBag() {
        if (this.holdsData) {
            return this.value;
        }
        let retval = this._collectChildrenByIdWithoutIndices();
        Object.keys(retval).forEach(key => {
            const childOrArray = retval[key];
            // If it's an array, replace it with a multidimensional value array
            if (Array.isArray(childOrArray)) {
                retval[key] = DDNode._buildMultidimensionalDataBagArray(childOrArray);
            } else {
                // Extract just the value
                retval[key] = childOrArray.getDataBag();
            }
        });
        return retval;
    }

    _updateFormulaValue() {
        console.assert(this._holdsData);
        this.obj.attr('placeholder', DDGraph.formatValue(this.type, this._formulaValue));
    }

    _getRawValue() {
        console.assert(this._holdsData);
        if (this._isCheckbox) {
            return this.obj.is(':checked');
        }
        const val = this.obj.val();
        if (typeof val === 'undefined' || val === null || val === '') {
            return null;
        }
        return val;
    }

    _setRawValue(v) {
        console.assert(this._holdsData);
        if (this._isCheckbox) {
            console.assert(typeof v === 'boolean');
            this.obj.prop('checked', v);
        } else {
            console.assert(typeof v === 'string');
            this.obj.val(v);
        }
    }

    _getArrayIndices() {
        const getOneIndex = domElement => {
            if (domElement.getAttribute('data-dd-array') === 'master') {
                return -1;
            } else {
                return parseInt(domElement.getAttribute('data-dd-index'));
            }
        };

        console.assert(!this.isRoot);
        // Search for all data-dd-array="item" between this object and the parent
        const filter = '[data-dd-array="item"][data-dd-index], [data-dd-array="master"]';
        let ddItems = this.obj.parentsUntil(this.parent.obj, filter).toArray();
        if (this.obj.is(filter)) {
            ddItems.push(this.obj[0]);
        }
        if (ddItems.length === 0) {
            return null;
        }
        return ddItems.map(getOneIndex);
    }

    _setup() {
        console.assert(!this.isRoot);
        console.assert(this.obj);
        [this._baseId, this._extraIndices] = DDGraph.parseIndicesFromId(this.obj.attr('data-dd-id'));
        this._isCheckbox = (this.obj.attr('type') === 'checkbox');
        this._holdsData = DDGraph.holdsData(this.obj);
        this._type = DDGraph.inferType(this.obj);
        // TODO infer formula
        // Mutable properties:
        this._arrayIndices = this._getArrayIndices(this.parent);
        this._assignIdAndPath();
    }

    _assignIdAndPath() {
        console.assert(!this.isRoot);
        const oldId = this._id;
        const oldPath = this._path;
        this._recacheIndices();
        this._id = this.baseId + DDGraph.indicesToString(this.indices);
        this._path = DDGraph.combinePath(this.parent.path, this.id);
        this.obj.attr('data-dd-path', this.path);
        if (oldId === null && oldPath === null) {
            // First insertion
            this.parent._addChild(this);
            this.graph._addDescendant(this);
        } else {
            // Rename
            this.parent._updateChild(oldId, node);
            this.graph._updateDescendant(oldPath, node);
        }
    }

    reindexIfNeeded() {
        console.assert(!this.isRoot);
        const oldIndices = this._arrayIndices;
        const newIndices = this._getArrayIndices();
        if (!arrayEquals(oldIndices, newIndices)) {
            this._arrayIndices = newIndices;
            this.traverse(function(node, evt) {
                if (evt === DFSEvent.ENTER) {
                    node._assignIdAndPath();
                }
            });
            return true;
        }
        return false;
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

}

export { DDGraph };