// Superscheda
// Copyright (C) 2017-2019  Pietro Saccardi
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

'use strict';

import { DDArray } from './ddarray.js?v=%REV';
import { arrayEquals, arrayMultidimensionalPrefill } from './helper.js?v=%REV';

const DDType = Object.freeze({
    INT:     Symbol('int'),
    FLOAT:   Symbol('float'),
    BOOL:    Symbol('bool'),
    STRING:  Symbol('string'),
    NONE:    Symbol('none')
});

/**
Depth first search event. Enter occurs when visiting a node, exit when leaving it. A node cannot be
left until all its descendants have been visited and left.
*/
const DFSEvent = Object.freeze({
    ENTER: Symbol('enter'),
    EXIT:  Symbol('exit')
});

/**
A separate DOM-like structure that manages and allows fast lookup of controls marked by the
`data-dd-id` attributes.
*/
class DDGraph {
    get root() {
        return this._root;
    }

    constructor() {
        this._root = new DDNode(this);
        this._nodesByPath = {};
    }

    /**
    Returns an object suitable to be used with @ref DDArray.setup that contains event handlers for
    the events `insertion`, `removal` and `reindex` that make the dynamic DOM arrays compatible with
    the graph structure. By using these handlers, the graph is always in sync with the DOM even when
    the dynamic arrays are modified.
    */
    _getArrayHandlers() {
        return {
            insertion: (evt, insertedItems) => {
                this.loadNodesFromDom($(insertedItems), false, false);
            },
            removal: (evt, removedItems) => {
                this.getDirectChildrenNodes($(removedItems))
                    .forEach(child => { child.removeSubtree(); });
            },
            reindex: (evt, domItemPrevIdxIdxTriples) => {
                const domItems = domItemPrevIdxIdxTriples.map(([domItem, previousIdx, Idx]) => domItem);
                this.getDirectChildrenNodes($(domItems)).forEach(child => { child.reindexIfNeeded(); });
            }
        };
    }


    /**
    Traverses the DOM and adds all elements marked with `data-dd-id` to the graph.
    @param $parentElements jQuery matches containing the elements from where the search for marked
    elements starts. $parentElements themselves are included.
    @param setupArray if specified, it also sets up the dynamic DOM arrays with the correct event
    handlers to interoperate with them.
    @param excludeElementsWithPath DOM elements which have already the `data-dd-path` attribute may
    have been added to the graph previously. These should thus be skipped. Specifying `false` may
    cause DOM elements to be added twice to the graph. The only safe usage for this parameter is
    when adding a new group of nodes that has cloned from an existing DOM subtree which is already
    in the graph.
    */
    loadNodesFromDom($parentElements=null, setupArray=true, excludeElementsWithPath=true) {
        if ($parentElements === null) {
            $parentElements = $('body');
        }
        if (setupArray) {
            DDArray.setup($parentElements, this._getArrayHandlers());
        }
        const elements = DDGraph.getElementsWithId($parentElements, true, excludeElementsWithPath);
        elements.forEach(domElement => {
            const $domElement = $(domElement);
            const parentNode = this.findParentNode($domElement);
            console.assert(parentNode);
            new DDNode(this, $domElement, parentNode);
        }, this);
    }

    /**
    Returns a tree-like string representation of the graph.
    */
    toString() {
        let depth = 0;
        let retval = '';
        this.root.traverse((node, evt) => {
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

    /**
    Retrieves a node with a given path, if any exists, otherwise `null`.
    */
    nodeByPath(path) {
        const node = this._nodesByPath[path];
        if (typeof node === 'undefined') {
            return null;
        }
        return node;
    }

    /**
    Updates the node storage when @p updatedNode has changed path.
    @param oldPath the old path by which the node was known.
    @param updatedNode node with a new path.
    */
    _updateNode(oldPath, updatedNode) {
        console.assert(this._nodesByPath[oldPath] === updatedNode);
        delete this._nodesByPath[oldPath];
        this._nodesByPath[updatedNode.path] = updatedNode;
    }

    /**
    Updates the node storage by registering a newly created node.
    */
    _addNode(node) {
        this._nodesByPath[node.path] = node;
    }

    /**
    Updates the node storage by removing a soon-to-delete node.
    */
    _removeNode(node) {
        delete this._nodesByPath[node.path];
    }

    _getDOMChildrenFilter($parents) {
        return (_, descendant) => {
            const node = this._getNodeOfDOMElement(descendant);
            return node && node.obj.parentsUntil($parents, '[data-dd-path]').length === 0;
        };
    }

    _getNodeOfDOMElement(domElement) {
        const path = domElement.getAttribute('data-dd-path');
        console.assert(path);
        return this.nodeByPath(path);
    }

    getDirectChildrenNodes($domElements) {
        const $matchingDomElements = $domElements.filter('[data-dd-path]');
        const $directChildren = $domElements
            .not($matchingDomElements)
            .find('[data-dd-path]')
            .filter(this._getDOMChildrenFilter($domElements));
        return $matchingDomElements.toArray().concat($directChildren.toArray())
            .map(domElement => this._getNodeOfDOMElement(domElement));
    }

    static getElementsWithId($domParents, sortByDepth=true, excludeElementsWithPath=true) {
        const filter = excludeElementsWithPath ? '[data-dd-id]:not([data-dd-path])' : '[data-dd-id]';
        let results = $domParents.find(filter).toArray();
        let $parentsResults = $domParents.filter(filter).toArray().map(domElement => $(domElement));
        if (!sortByDepth) {
            return $parentsResults.concat(results.map(elm => $(elm)));
        }
        // Create an array of [depth, object]
        for (let i = 0; i < results.length; i++) {
            const $item = $(results[i]);
            const relDepth = $item.parentsUntil($domParents, '[data-dd-id]').length;
            results[i] = [relDepth, $item];
        }
        // Sort that and then discard the depth
        results.sort((l, r) => l[0] - r[0]);
        return $parentsResults.concat(results.map(([relDepth, $item]) => $item));
    }

    findParentNode($domElement) {
        const candidates = $domElement.parents('[data-dd-id]');
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
        // TODO Toggle this off to migrate
        if ($obj.is('.dd-integer-field, .dd-natural-field')) {
            return DDType.INT;
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
        if (typeof value === 'undefined' || value === null) {
            return '';
        }
        return value.toString();
    }

    static traverseDataBag(data, baseId, indices) {
        console.assert(baseId != '');
        console.assert(typeof data === 'object');
        if (!data || !(baseId in data)) {
            return [false, null];
        }
        data = data[baseId];
        if (indices !== null && indices.length > 0) {
            for (let i = 0; i < indices.length; i++) {
                if (!Array.isArray(data) || data.length <= indices[i]) {
                    return [false, null];
                }
                data = data[indices[i]];
            }
        }
        return [true, data];
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

    get isArrayMaster() {
        if (this.isRoot) {
            return false;
        }
        if (this.indices && this.indices.indexOf(-1) >= 0) {
            return true;
        }
        // Check parents
        return false;
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

    _sortChildren() {
        // The data loading routine relies on the children being sorted
        // as it processes first array masters to resize the array appropriately, and
        // then each child.
        this._children.sort((a, b) => a.id.localeCompare(b.id));
    }

    _updateChild(oldId, updatedChild) {
        console.assert(!this.holdsData);
        console.assert(this._childById[oldId] === updatedChild);
        delete this._childById[oldId]
        this._childById[updatedChild.id] = updatedChild;
        this._sortChildren();
    }

    _addChild(child) {
        console.assert(!this.holdsData);
        console.assert(!(child.id in this._childById));
        this._children.push(child);
        this._sortChildren();
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
        this.graph._removeNode(this);
        this.parent._removeChild(this);
    }

    removeSubtree() {
        if (this.children) {
            while (this.children.length > 0) {
                const child = this.children[this.children.length - 1];
                child.removeSubtree();
            }
        }
        this._remove();
    }

    clearSubtree() {
        this.traverse((node, evt) => {
            if (evt === DFSEvent.ENTER) {
                if (node.holdsData) {
                    node.value = null;
                }
                if (node.isArrayMaster) {
                    const arrayController = DDArray.getController(node.obj);
                    console.assert(arrayController !== null);
                    arrayController.clear();
                }
            }
        });
    }

    traverse(fn) {
        const res = fn(this, DFSEvent.ENTER);
        if (typeof res === 'undefined' || res === null || res === true) {
            if (this.children) {
                for (let i = 0; i < this.children.length; i++) {
                    this.children[i].traverse(fn);
                }
            }
        }
        fn(this, DFSEvent.EXIT);
    }

    _collectChildrenByIdWithoutIndices() {
        let retval = {};
        this.children.forEach(child => {
            let arrOrObj = retval[child.baseId];
            if (child.isArrayMaster) {
                if (arrOrObj) {
                    if (!Array.isArray(arrOrObj)) {
                        retval[child.baseId] = [arrOrObj];
                    }
                } else {
                    retval[child.baseId] = [];
                }
                return;
            }
            if (arrOrObj) {
                if (Array.isArray(arrOrObj)) {
                    arrOrObj.push(child);
                } else {
                    retval[child.baseId] = [arrOrObj, child];
                }
            } else {
                if (child.indices) {
                    retval[child.baseId] = [child];
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
            parentArray[lastIdx] = child.dumpDataBag();
        }
        return retval;
    }

    dumpDataBag() {
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
                retval[key] = childOrArray.dumpDataBag();
            }
        });
        return retval;
    }

    loadDataBag(data) {
        if (this.holdsData) {
            this.value = data;
            return;
        }
        // This loop
        for (let i = 0; i < this.children.length; ++i) {
            const child = this.children[i];
            if (child.isArrayMaster) {
                // An array master always comes before its corresponding elements.
                // Retrieve the array object that manages this array.
                const arrayController = DDArray.getController(child.obj);
                console.assert(arrayController !== null);
                const [success, innerData] = DDGraph.traverseDataBag(data, child.baseId, null);
                console.assert(!success || innerData === null || Array.isArray(innerData));
                if (success && Array.isArray(innerData)) {
                    arrayController.resize(innerData.length);
                } else {
                    arrayController.clear();
                }
            } else {
                const [success, innerData] = DDGraph.traverseDataBag(data, child.baseId, child.indices);
                if (success) {
                    child.loadDataBag(innerData);
                } else {
                    child.clearSubtree();
                }
            }
        }
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
        this.obj.trigger('dd.changed');
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
            this.graph._addNode(this);
        } else {
            // Rename
            this.parent._updateChild(oldId, this);
            this.graph._updateNode(oldPath, this);
        }
    }

    reindexIfNeeded() {
        console.assert(!this.isRoot);
        const oldIndices = this._arrayIndices;
        const newIndices = this._getArrayIndices();
        if (!arrayEquals(oldIndices, newIndices)) {
            this._arrayIndices = newIndices;
            this.traverse((node, evt) => {
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