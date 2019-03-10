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

import { DDGraph, DFSEvent } from './ddgraph.js?v=%REV';
import { arrayBinarySearch } from './helper.js?v=%REV';

class DDSelector {
    get isRelative() {
        return this._relative;
    }

    get selectorParts() {
        return this._selectorParts;
    }

    static tryMatchIndices(selectorParts, selectorPartsIdx, indices) {
        if (selectorPartsIdx + indices.length > selectorParts.length) {
            return false;
        }
        for (let i = 0; i < indices.length; ++i) {
            if (indices[i] === -1) {
                return false; // No array master
            }
            const tryMatchIndex = selectorParts[selectorPartsIdx + i];
            if (tryMatchIndex === -1) {
                continue; // Matches all indices
            } else if (tryMatchIndex !== indices[i]) {
                return false;
            }
        }
        return true;
    }

    static tryMatchNode(selectorParts, selectorPartsIdx, node) {
        console.assert(selectorPartsIdx < selectorParts.length);
        if (node.baseId !== selectorParts[selectorPartsIdx]) {
            return 0;
        }
        if (node.indices) {
            if (DDSelector.tryMatchIndices(selectorParts, selectorPartsIdx + 1, node.indices)) {
                // Matches, consumes 1 unit for the baseId plus the indices length
                return 1 + node.indices.length;
            }
            return 0; // Doesn't match;
        } else {
            return 1; // Matches and consumes one unit
        }
    }

    static traverseMatchingNodes(selectorParts, startNode) {
        let matchingNodes = null;
        let idxs = [0];
        startNode.traverse((node, evt) => {
            if (node === startNode) {
                // Ignore
                return;
            }
            if (evt === DFSEvent.EXIT) {
                // Restore the previous index
                idxs.pop();
                return;
            }
            // Always add the same index to match the pop
            idxs.push(idxs[idxs.length - 1]);
            // We are traversing node. Does this node match a subsequence?
            const matchLength = DDSelector.tryMatchNode(selectorParts, idxs[idxs.length - 1], node);
            if (matchLength > 0) {
                // Update the idxs we will be using for the chldren to consume the matched subsequence
                idxs[idxs.length - 1] += matchLength;
                if (idxs[idxs.length - 1] >= selectorParts.length) {
                    // Found a matching node!
                    if (!matchingNodes) {
                        matchingNodes = [];
                    }
                    matchingNodes.push(node);
                    console.assert(idxs[idxs.length - 1] === selectorParts.length);
                    // Just a safety check
                    if (!node.holdsData) {
                        // Return false nonetheless, we have matched some node with children but we can't
                        // go any further
                        return false;
                    }
                }
                return true;
            } else {
                // Do nothing, do not traverse. The "exit" version will be called and pop the index.
                return false;
            }
        });
        return matchingNodes;
    }

    static tryMatchParts(selectorParts, candidate, startIdx=0, matchToEnd=true) {
        if (matchToEnd) {
            if (selectorParts.length !== candidate.length - startIdx) {
                return false;
            }
        } else {
            if (selectorParts.length > candidate.length - startIdx) {
                return false;
            }
        }

        for (let i = 0; i < selectorParts.length; ++i) {
            const candidatePart = candidate[startIdx + i];
            if (candidatePart === -1) {
                // No array masters here
                return false;
            }
            if (selectorParts[i] === -1) {
                // Match all numbers
                if (typeof candidatePart !== 'number') {
                    return false;
                }
            } else if (selectorParts[i] !== candidatePart) {
                return false;
            }
        }
        return true;
    }

    static tryMatchAbsolute(selectorParts, candidate) {
        return DDSelector.tryMatchParts(selectorParts, candidate, 0, true);
    }

    static tryMatchRelative(selectorParts, commonParent, candidate) {
        if (!DDSelector.tryMatchParts(commonParent, candidate, 0, false)) {
            return false;
        }
        return DDSelector.tryMatchParts(selectorParts, candidate, commonParent.length, true);
    }

    static parseSelectorString(selectorString) {
        let relative = false;
        let selectorParts = [];
        if (selectorString.startsWith('./')) {
            relative = true;
            selectorString = selectorString.slice(2);
        } else if (selectorString.startsWith('/')) {
            selectorString = selectorString.slice(1);
        }
        // Get the pieces
        selectorString.split('.').forEach(piece => {
            const [baseId, indices] = DDGraph.parseIndicesFromId(piece, true);
            console.assert(baseId && baseId.length > 0);
            selectorParts.push(baseId);
            if (indices && indices.length > 0) {
                selectorParts.push(...indices);
            }
        });
        return [relative, selectorParts];
    }

    forwardMatch(formulaNode, sort=true) {
        console.assert(formulaNode.holdsData);
        let results = null;
        if (this.isRelative) {
            results = DDSelector.traverseMatchingNodes(this.selectorParts, formulaNode.parent);
        } else {
            results = DDSelector.traverseMatchingNodes(this.selectorParts, formulaNode.graph.root);
        }
        if (results && sort) {
            results.sort(DDSelector.nodeCompare);
        }
        return results;
    }

    reverseMatch(candidateNode) {
        console.assert(candidateNode.holdsData);
        if (this.isRelative) {
            let results = null;
            Object.keys(this._usages).forEach(key => {
                const usage = this._usages[key];
                const isMatch = DDSelector.tryMatchRelative(this.selectorParts, usage.node.parent.pathPieces, candidateNode.pathPieces);
                if (isMatch) {
                    if (results) {
                        results.push(usage);
                    } else {
                        results = [usage];
                    }
                }
            });
            return results;
        } else {
            const matchAll = DDSelector.tryMatchAbsolute(this.selectorParts, candidateNode.pathPieces);
            if (matchAll) {
                return Object.values(this._usages);
            } else {
                return null;
            }
        }
    }

    _registerNode(node, idxOfSelectorInFormula) {
        let usage = this._usages[node.path];
        if (!usage) {
            usage = new DDSelectorInstance(this, node);
            this._usages[node.path] = usage;
        }
        usage.selectorIdxsInFormula.add(idxOfSelectorInFormula);
        return usage;
    }

    _updateNode(oldPath, updatedNode) {
        const usage = this._usages[oldPath];
        console.assert(usage.node === updatedNode);
        delete this._usages[oldPath];
        this._usages[updatedNode.path] = usage;
    }

    _unregisterNode(node) {
        delete this._usages[node.path];
    }

    constructor(selectorString) {
        this._relative = null;
        this._selectorParts = null;
        this._usages = {};
        [this._relative, this._selectorParts] = DDSelector.parseSelectorString(selectorString);
    }

    static nodeCompare(a, b) {
        if (a.isRoot && !b.isRoot) {
            return -1;
        } else if (!a.isRoot && b.isRoot) {
            return 1;
        } else if (a.isRoot && b.isRoot) {
            return 0;
        }
        return a.path.localeCompare(b);
    }
}

class DDSelectorInstance {
    get node() {
        return this._node;
    }

    get selector() {
        return this._selector;
    }

    get selectorIdxsInFormula() {
        return this._selectorIdxsInFormula;
    }

    get matchingNodes() {
        return this._matchingNodes;
    }

    clearMatchingNodesCache() {
        this._matchingNodes = null;
    }

    recacheMatchingNodes() {
        this._matchingNodes = this.selector.forwardMatch(this.node, true);
        if (!this._matchingNodes) {
            this._matchingNodes = [];
        }
    }

    addToMatchingNodes(node) {
        if (this._matchingNodes === null) {
            this.recacheMatchingNodes();
        }
        const idx = arrayBinarySearch(this._matchingNodes, node, DDSelector.nodeCompare);
        console.assert(idx < 0);
        this._matchingNodes.splice(-idx - 1, 0, node);
    }

    removeFromMatchingNodes(node) {
        if (this._matchingNodes === null) {
            return;
        }
        const idx = arrayBinarySearch(this._matchingNodes, node, DDSelector.nodeCompare);
        console.assert(idx >= 0);
        this._matchingNodes.splice(idx, 1);
    }

    constructor(selector, node) {
        this._selector = selector;
        this._node = node;
        this._selectorIdxsInFormula = new Set();
        this._matchingNodes = null;
    }
}

class DDSelectorStorage {
    constructor() {
        this._storage = {};
    }
    createAndRegisterSelector(selectorString, node, idxOfSelectorInFormula) {
        let selector = this._storage[selectorString];
        if (!selector) {
            selector = new DDSelector(selectorString);
            this._storage[selectorString] = selector;
        }
        return selector._registerNode(node, idxOfSelectorInFormula);
    }
}


class DDFormula {
    constructor(selectorStorage, formulaNode, expression) {
        this._node = formulaNode;
        this._argDefs = expression.split(/\s+/);
        console.assert(this._argDefs.length > 1);
        console.assert(typeof this._argDefs[0] === 'string');
        this._operator = this._argDefs.shift().toLowerCase();
        this._setupArguments(selectorStorage);
    }

    _evalSum() {
        const args = this.evaluateArguments();
        if (args.length == 0) {
            return 0;
        }
        let retval = 0;
        for (let i = 0; i < args.length; i++) {
            if (typeof args[i] !== 'number') {
                return null; // Cannot compute
            }
            retval += args[i];
        }
        return retval;
    }

    _evalRef() {
        const args = this.evaluateArguments();
        console.assert(args.length === 1);
        if (args.length !== 1) {
            return null;
        }
        return args[0];
    }

    _evalMod() {
        const args = this.evaluateArguments();
        if (args.length <= 1) {
            return 0;
        }
        const div = args.shift();
        if (typeof div !== 'number') {
            return null;
        }
        const tot = DDFormula._evalSum(args);
        return Math.floor(tot / div);
    }

    _evalSel() {
        if (this._argDefs.length <= 1) {
            return null;
        }
        let select = this._argDefs[0];
        if (select instanceof DDSelectorInstance) {
            // Evaluate the selector
            console.assert(select.matchingNodes.length === 1);
            if (select.matchingNodes.length !== 1) {
                // Must be a unique node
                return null;
            }
            select = select.matchingNodes[0].formulaValue;
            if (typeof select === 'string') {
                select = select.toLowerCase();
            }
        }
        // select should appear in only one selector
        for (let i = 1; i < this._argDefs.length; ++i) {
            const argDef = this._argDefs[i];
            console.assert(argDef instanceof DDSelectorInstance);
            // Does the selected path contain the selector
            if (argDef.selector.selectorParts.indexOf(select) >= 0) {
                // Evaluate the selector
                console.assert(argDef.matchingNodes.length === 1);
                if (argDef.matchingNodes.length !== 1) {
                    // Must be a unique node
                    return null;
                }
                return argDef.matchingNodes[0].formulaValue;
            }
        }
        return null;
    }

    clearMatchingNodesCache() {
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDSelectorInstance) {
                argDef.clearMatchingNodesCache();
            }
        });
    }

    rebuildMatchingNodesCache(fromScratch=true) {
        if (fromScratch) {
            this.clearMatchingNodesCache();
        }
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDSelectorInstance) {
                argDef.recacheMatchingNodes();
            }
        });
    }

    evaluate() {
        switch (this._operator) {
            case 'sum': return this._evalSum(); break;
            case 'sel': return this._evalSel(); break;
            case 'mod': return this._evalMod(); break;
            case 'ref': return this._evalRef(); break;
            default:
                console.assert(false);
                return null;
                break;
        }
    }

    evaluateArguments(recacheFromScratch=false) {
        this.rebuildMatchingNodesCache(recacheFromScratch);
        const values = [];
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDSelectorInstance) {
                argDef.matchingNodes.forEach(node => {
                    values.push(node.formulaValue);
                });
            } else {
                values.push(argDef);
            }
        });
        return values;
    }

    _updateFormulaNode(oldFormulaNodePath) {
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDSelectorInstance) {
                argDef.selector._updateNode(oldFormulaNodePath, this._node);
            }
        });
    }

    _remove() {
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDSelectorInstance) {
                argDef.selector._unregisterNode(this._node);
            }
        });
        // The usages are now not usable anymore
        this._argDefs = null;
    }

    _setupArguments(selectorStorage) {
        for (let i = 0; i < this._argDefs.length; ++i) {
            const arg = this._argDefs[i];
            if (arg.startsWith('/') || arg.startsWith('./')) {
                this._argDefs[i] = selectorStorage.createAndRegisterSelector(arg, this._node, i);
            } else {
                // Try casting to number
                const num = Number(arg);
                if (num === num) {
                    this._argDefs[i] = num;
                }
                // Keep it as string
            }
        }
    }
}


export { DDSelector, DDSelectorInstance, DDSelectorStorage, DDFormula };