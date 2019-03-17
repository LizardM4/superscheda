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
import { DDFormula, DDFormulaGraph, DDSelectorStorage } from './ddformula.js?v=%REV';
import { arrayCompare, arrayMultidimensionalPrefill, arrayBinarySearch, timeIt } from './helper.js?v=%REV';

const DDType = Object.freeze({
    INT:     Symbol('int'),
    FLOAT:   Symbol('float'),
    BOOL:    Symbol('bool'),
    STRING:  Symbol('string'),
    NONE:    Symbol('none')
});


function defaultPerType(type) {
    switch (type) {
        case DDType.INT:    return 0;
        case DDType.FLOAT:  return 0.;
        case DDType.BOOL:   return false;
        case DDType.STRING: return '';
        default:            return null;
    }
}

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

    get selectorStorage() {
        return this._selectorStorage;
    }

    get formulaGraph() {
        return this._formulaGraph;
    }

    constructor() {
        this._root = new DDNode(this);
        this._formulaGraph = new DDFormulaGraph();
        this._nodesByPath = {};
        this._selectorStorage = new DDSelectorStorage();
    }

    loadDataBag(data) {
        const oldDynamicUpdate = this.formulaGraph.dynamicUpdate;
        this.formulaGraph.dynamicUpdate = false;
        timeIt('Loading data bag', () => {
            this.root.loadDataBag(data);
        });
        this.formulaGraph.rebuild();
        this.formulaGraph.recomputeFormulas();
        this.formulaGraph.dynamicUpdate = oldDynamicUpdate;
    }

    dumpDataBag() {
        return timeIt('Dumping data bag', () => {
            return this.root.dumpDataBag();
        });
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
                this.getNodeChildrenOfDOMElements($(removedItems))
                    .forEach(child => { child.removeSubtree(); });
            },
            reindex: (evt, domItemPrevIdxIdxTriples) => {
                const domItems = domItemPrevIdxIdxTriples.map(([domItem, previousIdx, Idx]) => domItem);
                this.getNodeChildrenOfDOMElements($(domItems)).forEach(child => { child.reindexIfNeeded(); });
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
        const action = () => {
            if ($parentElements === null) {
                $parentElements = $('body');
            }
            if (setupArray) {
                DDArray.setup($parentElements, this._getArrayHandlers());
            }
            const elements = DDGraph.getElementsWithDDId($parentElements, true, excludeElementsWithPath);
            elements.forEach(domElement => {
                const $domElement = $(domElement);
                const parentNode = this.findParentNode($domElement);
                console.assert(parentNode);
                new DDNode(this, $domElement, parentNode);
            }, this);
        };
        if ($parentElements === null) {
            const oldDynamicUpdate = this.formulaGraph.dynamicUpdate;
            this.formulaGraph.dynamicUpdate = false;
            timeIt('Initializing nodes from DOM', action);
            this.formulaGraph.rebuild();
            this.formulaGraph.recomputeFormulas();
            this.formulaGraph.dynamicUpdate = oldDynamicUpdate;
        } else {
            action();
        }
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

    toDOT() {
        let retval = 'digraph {\n   graph[rankdir=LR];\n';
        this.root.traverse((node, evt) => {
            if (evt === DFSEvent.ENTER) {
                retval += '   "' + node.path + '"';
                if (node.children.length > 0) {
                    retval += ' -> {';
                    node.children.forEach(child => {
                        retval += ' "' + child.path + '"';
                    });
                    retval += ' }';
                }
                retval += ';\n';
            }
        });
        retval += '}';
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

    /**
    Returns a filter function to be used with jQuery which returns true if and only if an object is
    a direct descendant of @p $parents, that is, there is no node with `data-dd-path` attribute
    in the parent tree from the matched object and its parent in @p $parents.

    @param $parents jQuery match object.

    @returns A binary function.
    */
    _getDOMNodeChildrenFilter($parents) {
        return (_, descendant) => {
            const node = this._getNodeOfDOMElement(descendant);
            return node && node.obj.parentsUntil($parents, '[data-dd-path]').length === 0;
        };
    }

    /**
    Given a DOM element @p domElement object, it returns the @ref DDNode object associated to it.

    @param domElement DOM element with a `data-dd-path` attribute.

    @return A DDNode or null if the node has not been found.
    */
    _getNodeOfDOMElement(domElement) {
        const path = domElement.getAttribute('data-dd-path');
        console.assert(path);
        return this.nodeByPath(path);
    }

    /**
    Returns the first nodes (children of the given @p domElements) in the DOM hierarchy which have a
    corresponding node in the graph. By "first", we mean that there is no intermediate DOM element
    with an associated @ref DDNode in the parents path from the matched element and the parent in
    @p $domElements.

    @note Elements included in $domElements which have a `data-dd-path` attribute *are* included in
    the returned array.;

    @param $domElements A jQuery matched sets of DOM elements.

    @returns An Array of @ref DDNode.
    */
    getNodeChildrenOfDOMElements($domElements) {
        const $matchingDomElements = $domElements.filter('[data-dd-path]');
        const $directChildren = $domElements
            .not($matchingDomElements)
            .find('[data-dd-path]')
            .filter(this._getDOMNodeChildrenFilter($domElements));
        return $matchingDomElements.toArray().concat($directChildren.toArray())
            .map(domElement => this._getNodeOfDOMElement(domElement));
    }

    /**
    Finds al the DOM elements which have a `data-dd-id` attribute, below @p $domParents (including
    the elements in @p $domParents). Optionally sorts them by depth and excludes those with an
    already defined `data-dd-path` attribute (which indicates they already exist in the graph).

    @param $domParents a jQuery match set defining the start point for the hierarchical traversal
    to identify nodes with `data-dd-id`. Elements of @p $domParents may be included in the result if
    they meet the requirements.
    @param sortByDepth if set to true, the elements will be sorted by depth (parents come before
    children).
    @param exlcudeElementsWithPath if set to true, elements which have a `data-dd-path` will be
    excluded from the match.

    @return An array of jQuery objects, each containing one element.
    */
    static getElementsWithDDId($domParents, sortByDepth=true, excludeElementsWithPath=true) {
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

    /**
    Returns the DDNode associated to the closest parent to the given @p $domElement which has a
    `data-dd-id` property. If the closest parent with a `data-dd-id` property is not in the graph,
    it returs null. If there is not parent node with a `data-dd-id` property, it returns the root.

    @param $domElement a jQuery match set containing only one element.
    */
    findParentNode($domElement) {
        console.assert($domElement.length === 1);
        const candidates = $domElement.parents('[data-dd-id]');
        if (candidates.length === 0) {
            return this.root;
        }
        return this._getNodeOfDOMElement(candidates[0]);
    }

    /**
    Converts an array of numeric indices, or a numeric index, to a string representation, as in
        - 2 -> "[2]"
        - null, [] -> ""
        - [1, 2, 3] -> "[1][2][3]"
    */
    static indicesToString(indices) {
        if (typeof indices === 'number') {
            return '[' + indices.toString() + ']';
        } else if (!indices || indices.length === 0) {
            return '';
        } else {
            return '[' + indices.join('][') + ']';
        }
    }

    /**
    Extracts a textual part and an index part from an id in the format `name[idx1][idx2]...`, as in
        - "abc[2]" -> ["abc", [2]]
        - "abcdef" -> ["abcdef", null]
        - "abc[1][2]" -> ["abc", [1, 2]]

    @returns a pair with the textual part, and an array of indices.
    */
    static parseIndicesFromId(suggestedId, allowNegIndices=false) {
        const _withNegIndices    = /(.+?)((\[-?\d+\])*)$/;
        const _withoutNegIndices = /(.+?)((\[\d+\])*)$/;
        const baseIdAndIndices = allowNegIndices ? _withNegIndices : _withoutNegIndices;
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

    /**
    Returns true if and only if @p $obj is DOM elements that holds data (i.e. an input of sorts).
    @param $obj A jQuery match object.
    */
    static holdsData($obj) {
        return $obj.is('input[data-dd-id], select[data-dd-id], textarea[data-dd-id]');
    }

    /**
    Returns the expected specific type associated to a given DOM element.

    @param $obj a jQuery match containing only one object.

    @returns One of the DDType enum.
    */
    static inferType($obj) {
        console.assert($obj.length === 1);
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

    /**
    Returns true if and only if @p rawValue is to be interpreted as a "void" value, assuming it
    should be cast to the given @p type.

    @param type One of @ref DDType.
    @param rawValue A raw value as obtained from an input (so a string, null, or a boolean).
    */
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

    /**
    Converts a raw value coming from a control (so a string, null, or a boolean) to the strong type
    specified by @p rawValue. If casting is not possible (due for example to invalid value), the
    method returns the raw value as-is, unless @p nullIfInvalid is set to true; in this latter case,
    it returns null.

    @param type One of @ref DDType.
    @param rawValue The raw value
    @param nullIfInvalid If true, the method returns null when it detects an invalid value.
    */
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

    /**
    Converts a strongly typed @p value into its string representation for a DOM input.

    @param type One of @ref DDTYpe.
    @param value A strongly typed value.
    */
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

    /**
    Tries to navigate a data bag. Takes a data bag @p data, a @p baseId and an array of @p indices,
    and gets the object in @p data at key @p baseId. If @p indices is nonempty, it then further
    extracts in a nested fashion the indices specified by @p indices. This process is successful if
    @p baseId is a key in @p data, and (if @p indices is nonempty) it points to a set of nested
    arrays which all contain the specified @p indices.

    TL;DR: it does `data[baseId][indices[0]][indices[1]]...[indices[indices.length - 1]]`. If this
    suceeeds, returns `[true, <whatever was found>]`, otherwise `[false, null]`.

    @return a pair of boolean an an object. The boolean describes if the process is successful, and
    the object is the found object.
    */
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


/**
A DDNode represents a single object with a `data-dd-id`. Every DOM element with a DD Id can be
associated a node. A dynamic array container or master has no representation in the graph unless it
is associated a DD Id. The DOM hierarchy induces a hierarchy in the graph whose nodes are these
DDNode instances.

A node always has a nonempty textual @ref baseId, followed optionally by a series of indices. These
indices can either be induces by dynamic arrays, via the `data-dd-array-index` attribute on some of
the DOM parents, or by the specified DD Id, if an array index is part of it.

When a node is added to the graph, it receives a path, and this path is set to the attribute
`data-dd-path` of the DOM element associated to the node. When the node is removed, that attribute
is removed.

A node refererring to DOM element inside an array master in a dynamic array receives an index of -1.

A DOM hierarchy as follows:
    - div[data-dd-id="A"]
        - div[data-dd-array="master"]
            - div[data-dd-id="B"]
                -input[data-dd-id="v"]
                -input[data-dd-id="w[0]"]
                -input[data-dd-id="w[1]"]

Yields the following graph:
    - A (path A, baseId A, indices null)
        - B[-1] (path A.B[-1], baseId B, indices [-1])
            - v (path A.B[-1].v, baseId v, indices null)
            - w (path A.B[-1].w[0], baseId w, indices [0])
            - w (path A.B[-1].w[1], baseId w, indices [1])

As path representation:
    - A
        - A.B[-1]
            - A.B[-1].v
            - A.B[-1].w[0]
            - A.B[-1].w[1]
*/
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

    get pathPieces() {
        return this._pathPieces;
    }

    /**
    If this object is indexed, this returns an array with the indices of this object.
    This includes the indices specified in the `data-dd-id` property as well as the indices induces
    by the dynamic arrays (DD Id indices come last).
    */
    get indices() {
        return this._indices;
    }

    get type() {
        return this._type;
    }

    /**
    Returns true if and only if the value is void according to @ref DDGraph.testVoid
    */
    get isVoid() {
        return DDGraph.testVoid(this.type, this._getRawValue());
    }

    /**
    Returns true if this object is a direct descandant of an dyanamic array master (that is, there
    is a -1 in the indices array). Note that a descendant of an array master node isn't necessarily
    an array master itself.
    */
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

    get isInAnyArrayMaster() {
        if (this.isRoot) {
            return false;
        }
        return this.pathPieces.indexOf(-1) >= 0;
    }

    /**
    Returns the strongly typed representation of this control's value. If the value cannot be cast,
    the original string value is returned.
    */
    get value() {
        return DDGraph.castRawValue(this.type, this._getRawValue());
    }

    /**
    Sets the value of the control. This will trigger a `dd.changed` event on the corresponding DOM
    element.
    */
    set value(v) {
        this._setRawValue(DDGraph.formatValue(this.type, v));
    }

    get isRoot() {
        return !this.parent;
    }

    get graph() {
        return this._graph;
    }

    /**
    Returns the value for computing formulas on this control, that is, @ref value if the control is
    not void (@ref isVoid), otherwise its placeholder. If the control is void and doesn't have a
    formula associated, then the default value for the declared type is used.
    */
    get formulaValue() {
        if (this.isVoid) {
            if (this._formula === null && this._formulaValue === null) {
                return defaultPerType(this.type);
            }
            return this._formulaValue;
        }
        return DDGraph.castRawValue(this.type, this._getRawValue(), true);
    }

    /**
    Sets the formula value for this control.
    */
    set formulaValue(v) {
        console.assert(this._formula);
        this._formulaValue = v;
        this._updateFormulaValue();
    }

    /**
    Constructs a new node in @p graph, wrapping @p $obj, and registers it to the parent @p parent.

    @param graph the @ref DDGraph instance.
    @param $obj a jQuery match object containing a single object that represents this node in the
    DOM.
    @param parent If null, a root objet is created. Note that this must be the result of the method
    @ref DDGraph.findParentNode.
    */
    constructor(graph, $obj, parent=null) {
        this._graph = graph;
        if (typeof $obj === 'undefined') {
            // We are creating a root
            console.assert(typeof parent === 'undefined' || parent === null);
            parent = null
            $obj = null;
        } else {
            console.assert($obj.length === 1);
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
        this._pathPieces = [];
        this._idx = null;
        this._isCheckbox = false;
        this._holdsData = false;
        this._formulaValue = null;
        this._type = DDType.NONE;
        this._formula = null;
        if (!this.isRoot) {
            this._setup();
        }
    }

    /**
    Rebuilds the cached list of indices starting by @ref _extraIndices and @ref_arrayIndices.
    */
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

    /**
    Returns true if and only if @p child is among the children of this object.
    */
    hasChild(child) {
        console.assert(!this.holdsData);
        return this._childById[child.id] === child;
    }

    static childCompare(a, b) {
        const baseCompare = a.baseId.localeCompare(b.baseId);
        if (baseCompare === 0) {
            return arrayCompare(a.indices, b.indices);
        }
        return baseCompare;
    }

    /**
    Changes the id by which a child is registered to the parent.
    @param oldId the old id of @p updatedChild
    @param updatedChild the child which has changed id.
    */
    _updateChild(oldId, updatedChild) {
        console.assert(!this.holdsData);
        console.assert(this._childById[oldId] === updatedChild);
        delete this._childById[oldId]
        this._childById[updatedChild.id] = updatedChild;
        // The data loading routine relies on the children being sorted
        // as it processes first array masters to resize the array appropriately, and
        // then each child.
        this._children.sort(DDNode.childCompare);
    }

    /**
    Registers a new child to this object.
    */
    _addChild(child) {
        console.assert(!this.holdsData);
        console.assert(!(child.id in this._childById));
        const idx = arrayBinarySearch(this._children, child, DDNode.childCompare);
        console.assert(idx < 0);
        this._children.splice(-idx - 1, 0, child);
        this._childById[child.id] = child;
    }

    /**
    Unregisters a new child from this object.
    */
    _removeChild(child) {
        console.assert(!this.holdsData);
        console.assert(this.hasChild(child));
        delete this._childById[child.id];
        const idx = arrayBinarySearch(this._children, child, DDNode.childCompare);
        console.assert(idx >= 0);
        this._children.splice(idx, 1);
    }

    /**
    Removes the path attribute, removes the node from the parent and removes it from the graph.
    Does not modify the DOM.
    */
    _remove() {
        console.assert(!this.isRoot);
        if (this.holdsData && !this.isInAnyArrayMaster) {
            this.graph.formulaGraph.removeFormulaNode(this);
        }
        this.obj.removeAttr('data-dd-path');
        this.graph._removeNode(this);
        this.parent._removeChild(this);
    }

    /**
    Completely removes this node and the subtree rooted at it from the graph. Does not modify the
    DOM.
    */
    removeSubtree() {
        if (this.children) {
            while (this.children.length > 0) {
                const child = this.children[this.children.length - 1];
                child.removeSubtree();
            }
        }
        this._remove();
    }

    /**
    Sets to null all the nodes that hold data in the subtree and clears all the dynamic arrays in
    the subtree.
    */
    clearSubtree() {
        // This method can use correctly the traverse function only thanks to sorting. The master
        // will always come before the elements, so we can clear the array at the master and skip
        // traversing the remaining elements.
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

    /**
    Calls @p fn on all the nodes in the subtree rooted at this node. The children are traversed in
    order.

    @param fn a function with the signature `function(node, dfsEvent)`, where the first argument is
    a @ref DDNode and the second one of @ref DFSEvent.

    Modifying the children while traversing is safe if and only if the elements that are added or
    removed haven't yet been traversed (so think twice before doing it).
    */
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

    /**
    Returns an object having the @ref baseId as key and the child as value. If there are multiple
    children with the same @ref baseId, or if one such child is an array master, then the children
    are grouped in an array. Array masters themselves are excluded from the arrays.
    */
    _collectChildrenByIdWithoutIndices() {
        let retval = {};
        this.children.forEach(child => {
            let arrOrObj = retval[child.baseId];
            if (arrOrObj) {
                if (!Array.isArray(arrOrObj)) {
                    arrOrObj = [arrOrObj]
                }
            } else if (child.indices) {
                arrOrObj = [];
            }
            if (arrOrObj) {
                arrOrObj.push(child);
            } else {
                arrOrObj = child;
            }
            retval[child.baseId] = arrOrObj;
        });
        return retval;
    }

    /**
    Returns the maximum number of indices each children in the array has.
    */
    static _getArrayOrder(childrenArray) {
        let maxDim = 0;
        // First of all assert dimensionality
        for (let i = 0; i < childrenArray.length; i++) {
            maxDim = Math.max(maxDim, childrenArray[i].indices.length);
        }
        return maxDim;
    }

    /**
    Builds a data bag multidimensional array containing the specified children's data at the correct
    index.
    */
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

    /**
    Generates a hieararchical representation of the data contained in the subtree rooted at the
    current node, consisting only of Javascript primitives, Objects and Arrays.
    */
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

    /**
    Loads the data previously stored into a data bag from @ref dumpDataBag into the DOM. The arrays
    are appropriately resized to hold the correct data. Nodes that have no data associated are
    cleared via @ref clearSubtree.
    */
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

    /**
    Changes the placeholder by casting the value to its textual representation.
    */
    _updateFormulaValue() {
        console.assert(this._holdsData);
        this.obj.attr('placeholder', DDGraph.formatValue(this.type, this._formulaValue));
    }

    /**
    Returns the raw value for an input; either a string, a bool or null.
    */
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

    /**
    Sets the raw value, takes a string, a boolean or null.
    */
    _setRawValue(v) {
        console.assert(this._holdsData);
        if (this._isCheckbox) {
            console.assert(typeof v === 'boolean');
            this.obj.prop('checked', !!v);
        } else {
            this.obj.val(v.toString());
        }
        this._recomputeFormulasIfNecessary();
        // TODO Is this event really needed? Why can't I just call .change?
        this.obj.trigger('dd.changed');
    }

    get canBeInFormulaGraph() {
        return this.holdsData && !this.isInAnyArrayMaster;
    }

    get isInFormulaGraph() {
        return this.canBeInFormulaGraph && this.graph.formulaGraph.hasFormulaNode(this);
    }

    _recomputeFormulasIfNecessary() {
        if (this.isInFormulaGraph) {
            this.graph.formulaGraph.recomputeFormulas(this, false);
        }
    }

    /**
    Extracts the array indices for the node. Returns an array consisting of all the `dd-array-index`
    attributes of the DOM elements between @ref obj and @ref parent, plus all the indices specified
    explicitly in the `data-dd-id` property.
    */
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
        // Setup on change event
        this.obj.change((evt) => {
            this._recomputeFormulasIfNecessary();
            evt.stopPropagation();
        });
        // Mutable properties:
        this._arrayIndices = this._getArrayIndices(this.parent);
        // Upon first insertion, will also set the formula up
        this._assignIdAndPath();
    }

    _collectPathPieces() {
        if (this.isRoot) {
            return [];
        }
        if (this.indices) {
            return this.parent.pathPieces.concat([this.baseId], this.indices);
        } else {
            return this.parent.pathPieces.concat([this.baseId]);
        }

    }

    /**
    Computes the final id and path for this node, stores it into the DOM, and updates the @ref graph
    and the @ref parent accordingly.
    */
    _assignIdAndPath() {
        console.assert(!this.isRoot);
        const oldId = this._id;
        const oldPath = this._path;
        this._recacheIndices();
        this._id = this.baseId + DDGraph.indicesToString(this.indices);
        this._path = DDGraph.combinePath(this.parent.path, this.id);
        this._pathPieces = this._collectPathPieces();
        this.obj.attr('data-dd-path', this.path);
        if (oldId === null && oldPath === null) {
            // First insertion
            this.parent._addChild(this);
            this.graph._addNode(this);
            if (this.canBeInFormulaGraph) {
                // Handles correctly a missing attribute (will return null)
                this._formula = this.graph.formulaGraph.addFormulaNode(this, this.obj.attr('data-dd-formula'));
            }
        } else {
            // Rename
            this.parent._updateChild(oldId, this);
            this.graph._updateNode(oldPath, this);
            // It is correct to call it only if it *can* be in formula graph, because the change
            // of id *may* cause it to be matched somewhere.
            if (this.canBeInFormulaGraph) {
                this.graph.formulaGraph.updateFormulaNode(oldPath, this);
            }
        }
    }

    /**
    Recomputes the indices for this objects, if they changed, updates the @ref id, the @ref path,
    in the node and in the DOM, and updates @ref parent and @ref graph.
    */
    reindexIfNeeded() {
        console.assert(!this.isRoot);
        const oldIndices = this._arrayIndices;
        const newIndices = this._getArrayIndices();
        if (arrayCompare(oldIndices, newIndices) !== 0) {
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

    /**
    Returns a child of this node for the given id, if it exists, otherwise null.
    */
    childById(id) {
        const child = this._childById[id];
        if (typeof child === 'undefined') {
            return null;
        }
        return child;
    }

    /**
    Returns an array of all the children with the requested @p ids.

    @param ids an array of ids to search for.
    @param filterMissing if true, all the children that are not found are removed from the return
    value, otherwise the null placholders are kept
    */
    childrenById(ids, filterMissing=true) {
        const children = ids.map(id => this.childById(id));
        if (filterMissing) {
            return children.filter(child => typeof child !== 'undefined' && child !== null);
        }
        return children;
    }

}

export { DDGraph, DDNode, DFSEvent };