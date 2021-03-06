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

import { DDGraph, DFSEvent } from './dd-graph.js';
import { arrayBinarySearch, timeIt } from './helper.js';

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
            // No array masters
            if (node.isArrayMaster) {
                return false;
            }
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
            Object.keys(this._instances).forEach(key => {
                const selInstance = this._instances[key];
                const isMatch = DDSelector.tryMatchRelative(this.selectorParts, selInstance.node.parent.pathPieces, candidateNode.pathPieces);
                if (isMatch) {
                    if (results) {
                        results.push(selInstance);
                    } else {
                        results = [selInstance];
                    }
                }
            });
            return results;
        } else {
            const matchAll = DDSelector.tryMatchAbsolute(this.selectorParts, candidateNode.pathPieces);
            if (matchAll) {
                return Object.values(this._instances);
            } else {
                return null;
            }
        }
    }

    _registerNodeUsingSelector(node, idxOfSelectorInFormula) {
        let selInstance = this._instances[node.path];
        if (!selInstance) {
            selInstance = new DDSelectorInstance(this, node);
            this._instances[node.path] = selInstance;
        }
        selInstance.selectorIdxsInFormula.add(idxOfSelectorInFormula);
        return selInstance;
    }

    _updateNodeUsingSelector(oldPath, updatedNode, argDefSelInst) {
        console.assert(argDefSelInst.node === updatedNode);
        // Another node may have taken the place of the old path
        if  (this._instances[oldPath].node === updatedNode) {
            console.assert(argDefSelInst === this._instances[oldPath])
            delete this._instances[oldPath];
        }
        this._instances[updatedNode.path] = argDefSelInst;
    }

    _unregisterNodeUsingSelector(node) {
        delete this._instances[node.path];
    }

    constructor(selectorString) {
        this._relative = null;
        this._selectorParts = null;
        this._instances = {};
        [this._relative, this._selectorParts] = DDSelector.parseSelectorString(selectorString);
    }

    static nodeCompare(a, b) {
        const aIsRoot = (a === null || a === '' || a.isRoot);
        const bIsRoot = (b === null || b === '' || b.isRoot);
        if (aIsRoot && !bIsRoot) {
            return -1;
        } else if (!aIsRoot && bIsRoot) {
            return 1;
        } else if (aIsRoot && bIsRoot) {
            return 0;
        }
        const aPath = (typeof a === 'string' ? a : a.path);
        const bPath = (typeof b === 'string' ? b : b.path);
        return aPath.localeCompare(bPath);
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
        const fwdMatchResults = this.selector.forwardMatch(this.node);
        if (this._matchingNodes) {
            this._matchingNodes.clear();
        } else {
            this._matchingNodes = new Set();
        }
        if (fwdMatchResults) {
            fwdMatchResults.forEach(item => { this._matchingNodes.add(item); });
        }
    }

    addToMatchingNodes(node) {
        if (this._matchingNodes === null) {
            this.recacheMatchingNodes();
            console.assert(this._matchingNodes.has(node));
        } else {
            console.assert(!this._matchingNodes.has(node));
            this._matchingNodes.add(node);
        }
    }

    removeFromMatchingNodes(node) {
        if (this._matchingNodes === null) {
            return;
        }
        console.assert(this._matchingNodes.has(node));
        this._matchingNodes.delete(node);
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

    reverseMatch(candidateNode) {
        const results = new Set();
        Object.values(this._storage).forEach(selector => {
            const selectorResults = selector.reverseMatch(candidateNode);
            if (selectorResults && selectorResults.length > 0) {
                selectorResults.forEach(item => { results.add(item); });
            }
        });
        return results;
    }

    createAndRegisterSelector(selectorString, node, idxOfSelectorInFormula) {
        let selector = this._storage[selectorString];
        if (!selector) {
            selector = new DDSelector(selectorString);
            this._storage[selectorString] = selector;
        }
        return selector._registerNodeUsingSelector(node, idxOfSelectorInFormula);
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

    get node() {
        return this._node;
    }

    _evalSum() {
        const args = this.evaluateArguments();
        if (args.length === 0) {
            return 0;
        }
        let retval = 0;
        let truncate = false;
        if (typeof args[0] !== 'number') {
            const op = args.shift();
            switch (op) {
                case 'trunc':
                    truncate = true;
                    break;
                default:
                    break;
            }
        }
        const activationStack = [];
        for (let i = 0; i < args.length; i++) {
            if (typeof args[i] === 'boolean') {
                activationStack.push(args[i]);
                continue;
            } if (typeof args[i] !== 'number') {
                return null; // Cannot compute
            }
            // If there is any bool in the activation stack, use it to toggle the current element
            if (activationStack.length > 0 && !activationStack.shift()) {
                continue;
            }
            retval += args[i];
        }
        if (truncate) {
            retval = Math.trunc(retval);
        }
        return retval;
    }

    _evalMul() {
        const args = this.evaluateArguments();
        if (args.length === 0) {
            return 1;
        }
        let retval = 1;
        for (let i = 0; i < args.length; i++) {
            if (typeof args[i] !== 'number') {
                return null; // Cannot compute
            }
            retval *= args[i];
        }
        return retval;
    }

    _evalCondSumMul() {
        const args = this.evaluateArguments();
        if (args.length < 1) {
            return null;
        }
        const mul = args.shift();
        if (typeof mul !== 'number') {
            return null;
        }
        const classCond = args.splice(0, Math.floor(args.length / 2));
        if (classCond.length !== args.length) {
            return null;
        }
        let sum = 0;
        for (let i = 0; i < classCond.length; ++i) {
            if (typeof classCond[i] !== 'boolean') {
                return null;
            } else if (typeof args[i] !== 'number') {
                return null;
            }
            sum += (classCond[i] ? args[i] : mul * args[i]);
        }
        return sum;
    }

    _evalCountSpells() {
        const args = this.evaluateArguments();
        if (args.length < 2) {
            return null;
        }
        const lev = args.shift();
        const status = args.shift();
        const levels = args.splice(0, Math.floor(args.length / 2));
        if (levels.length !== args.length) {
            return null;
        }
        let count = 0;
        for (let i = 0; i < levels.length; ++i) {
            if (levels[i] !== lev || args[i] !== status) {
                continue;
            }
            ++count;
        }
        return count;
    }

    _evalRef() {
        const args = this.evaluateArguments();
        console.assert(args.length === 1);
        if (args.length !== 1) {
            return null;
        }
        return args[0];
    }

    _evalSizeMod() {
        const args = this.evaluateArguments();
        console.assert(args.length === 1);
        if (args.length !== 1 || typeof args[0] !== 'string') {
            return null;
        }
        const sz = args[0].toLowerCase();
        switch (sz) {
            case 'colossale':
                return -8;
            case 'mastodontica':
                return -4;
            case 'enorme':
                return -2;
            case 'grande':
                return -1;
            case 'media':
                return 0;
            case 'piccola':
                return 1;
            case 'minuscola':
                return 2;
            case 'minuta':
                return 4;
            case 'piccolissima':
                return 8;
        }
        return null;
    }

    _evalMod() {
        const args = this.evaluateArguments();
        if (args.length <= 2) {
            return 0;
        }
        const mode = args.shift();
        const div = args.shift();
        if (typeof div !== 'number') {
            return null;
        }
        let tot = 0;
        const activationStack = [];
        for (let i = 0; i < args.length; i++) {
            // If you find a boolean, make it conditionally activate or deactivate the next modifier
            if (typeof args[i] === 'boolean') {
                activationStack.push(args[i]);
                continue;
            } else if (typeof args[i] !== 'number') {
                return null; // Cannot compute
            }
            // If there is any bool in the activation stack, use it to toggle the current element
            if (activationStack.length > 0 && !activationStack.pop(0)) {
                continue;
            }
            tot += args[i];
        }
        tot = Math.floor(tot / div);
        switch (mode) {
            case 'any': break;
            case 'pos': tot = Math.max(0, tot); break;
            case 'neg': tot = Math.min(0, tot); break;
            default: return null; break;
        }
        return tot;
    }

    _evalSel() {
        if (this._argDefs.length <= 2) {
            return null;
        }
        let select = this._argDefs[0];
        if (select instanceof DDSelectorInstance) {
            // Evaluate the selector
            console.assert(select.matchingNodes.size === 1);
            if (select.matchingNodes.size !== 1) {
                // Must be a unique node
                return null;
            }
            // Just extract any element of the set
            select.matchingNodes.forEach(element => {
                select = element.formulaValue;
            });
            if (typeof select === 'string') {
                select = select.toLowerCase();
            }
        }
        let selDefault = this._argDefs[1];
        if (selDefault instanceof DDSelectorInstance) {
            selDefault.matchingNodes.forEach(element => {
                selDefault = element.formulaValue;
            });
        }
        // select should appear in only one selector
        for (let i = 2; i < this._argDefs.length; ++i) {
            const argDef = this._argDefs[i];
            console.assert(argDef instanceof DDSelectorInstance);
            // Does the selected path contain the selector
            if (argDef.selector.selectorParts.indexOf(select) >= 0) {
                // Evaluate the selector
                console.assert(argDef.matchingNodes.size === 1);
                if (argDef.matchingNodes.size !== 1) {
                    // Must be a unique node
                    return null;
                }
                // Just extract any element of the set
                let retval = null;
                argDef.matchingNodes.forEach(element => {
                    retval = element.formulaValue;
                });
                return retval;
            }
        }
        return selDefault;
    }

    getAllSelectorInstances() {
        return this._argDefs.filter(argDef => argDef instanceof DDSelectorInstance);
    }

    getAllMatchingNodes(recacheFromScratch=false) {
        this.rebuildMatchingNodesCache(recacheFromScratch);
        const matchingNodes = new Set();
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDSelectorInstance) {
                if (argDef.matchingNodes && argDef.matchingNodes.size > 0) {
                    argDef.matchingNodes.forEach(item => { matchingNodes.add(item); });
                }
            }
        });
        return matchingNodes;
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
            case 'mul': return this._evalMul(); break;
            case 'sel': return this._evalSel(); break;
            case 'mod': return this._evalMod(); break;
            case 'ref': return this._evalRef(); break;
            case 'cond_sum_mul': return this._evalCondSumMul(); break;
            case 'count_spells': return this._evalCountSpells(); break;
            case 'size_mod': return this._evalSizeMod(); break;
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
                argDef.selector._updateNodeUsingSelector(oldFormulaNodePath, this.node, argDef);
            }
        });
    }

    _remove() {
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDSelectorInstance) {
                argDef.selector._unregisterNodeUsingSelector(this.node);
            }
        });
        // The args are now not usable anymore
        this._argDefs = null;
    }

    _setupArguments(selectorStorage) {
        for (let i = 0; i < this._argDefs.length; ++i) {
            const arg = this._argDefs[i];
            if (arg.startsWith('/') || arg.startsWith('./')) {
                this._argDefs[i] = selectorStorage.createAndRegisterSelector(arg, this.node, i);
            } else {
                if (arg === 'true') {
                    this._argDefs[i] = true;
                } else if (arg === 'false') {
                    this._argDefs[i] = false;
                } else if (arg === 'null') {
                    this._argDefs[i] = null;
                } else if (arg === "''" || arg == '""') {
                    // Keep it as string. Except if it's the empty string
                    this._argDefs[i] = '';
                } else {
                    // Try casting to number
                    const num = Number(arg);
                    if (num === num) {
                        this._argDefs[i] = num;
                    }
                }
            }
        }
    }
}

class DDFormulaNode {
    get node() {
        return (this._nodeOrFormula instanceof DDFormula) ? this._nodeOrFormula.node : this._nodeOrFormula;
    }
    get formula() {
        return (this._nodeOrFormula instanceof DDFormula) ? this._nodeOrFormula : null;
    }
    set formula(v) {
        console.assert((this._nodeOrFormula instanceof DDFormula) === (v === null));
        console.assert(v === null || this._nodeOrFormula === v.node);
        this._nodeOrFormula = v;
    }
    _rebuildPredecessors(recacheFromScratch=false) {
        console.assert(this.formula);
        this.predecessorNodes = this.formula.getAllMatchingNodes(recacheFromScratch);
    }
    _rebuildSuccessors(selectorStorage) {
        this.successorSelInstances = selectorStorage.reverseMatch(this.node);
    }
    _addToSuccessorsMatchingNodes() {
        this.successorSelInstances.forEach(selInstance => {
            selInstance.addToMatchingNodes(this.node);
        });
    }
    _removeFromSuccessorsMatchingNodes() {
        this.successorSelInstances.forEach(selInstance => {
            selInstance.removeFromMatchingNodes(this.node);
        });
    }
    constructor(node) {
        this._level = -1;
        this._nodeOrFormula = node;
        this.predecessorNodes = new Set();
        this.successorSelInstances = new Set();
    }
}


class DDFormulaGraph {
    get selectorStorage() {
        return this._selectorStorage;
    }

    _traverse(formulaNode, fn) {
        const res = fn(formulaNode, DFSEvent.ENTER);
        if (typeof res === 'undefined' || res === null || res === true) {
            formulaNode.successorSelInstances.forEach(selInstance => {
                this._traverse(selInstance.node._formulaNode, fn);
            })
        }
        fn(this, DFSEvent.EXIT);
    }

    _getRoots() {
        return this._formulaNodes.filter(formulaNode => formulaNode.predecessorNodes.size === 0);
    }

    _reassignLevelsIfNeeded() {
        if (!this._levelsOutdated) {
            return;
        }
        this._maxLevel = 0;
        this._formulaNodes.forEach(formulaNode => {
            formulaNode._level = -1;
        });
        this._getRoots().forEach(root => {
            let level = -1;
            this._traverse(root, (formulaNode, evt) => {
                if (evt === DFSEvent.ENTER) {
                    ++level;
                    formulaNode._level = Math.max(formulaNode._level, level);
                    this._maxLevel = Math.max(this._maxLevel, level);
                } else {
                    --level;
                }
            });
        });
        this._levelsOutdated = false;
        return this._maxLevel;
    }

    toDOT(buildFromPredecessors=false) {
        let retval = 'digraph {\n   graph[rankdir=LR, ranksep=2];\n';
        this._formulaNodes.forEach(formulaNode => {
            retval += '   "'  + formulaNode.node.path + '"';
            if (buildFromPredecessors) {
                retval += ';\n';
                formulaNode.predecessorNodes.forEach(predecessorNode => {
                    retval += '   "' + predecessorNode.path + '" -> "' + formulaNode.node.path + '";\n';
                });
            } else {
                if (formulaNode.successorSelInstances.size > 0) {
                    retval += ' -> {';
                    formulaNode.successorSelInstances.forEach(successorNodeData => {
                        retval += ' "' + successorNodeData.node.path + '"';
                    });
                    retval += ' }';
                }
                retval += ';\n'
            }
        });
        retval += '}';
        return retval;
    }

    _partitionInLevels(formulaNodes=null) {
        this._reassignLevelsIfNeeded();
        const levels = [];
        for (let i = 0; i <= this._maxLevel; i++) {
            levels.push([]);
        }
        if (formulaNodes === null) {
            formulaNodes = this._formulaNodes;
        }
        formulaNodes.forEach(formulaNode => {
            // Store at the appropriate level
            levels[formulaNode._level].push(formulaNode);
        });
        return levels;
    }

    get dynamicUpdateGraph() {
        return this._dynamicUpdateGraph[this._dynamicUpdateGraph.length - 1];
    }

    set dynamicUpdateGraph(v) {
        this._dynamicUpdateGraph[this._dynamicUpdateGraph.length - 1] = v;
    }

    get dynamicRecomputeFormulas() {
        return this._dynamicRecomputeFormulas[this._dynamicRecomputeFormulas.length - 1];;
    }

    set dynamicRecomputeFormulas(v) {
        this._dynamicRecomputeFormulas[this._dynamicRecomputeFormulas.length - 1] = v;
    }

    dynamicUpdateGraphPush(v) {
        this._dynamicUpdateGraph.push(v);
    }

    dynamicUpdateGraphPop() {
        console.assert(this._dynamicUpdateGraph.length > 1);
        this._dynamicUpdateGraph.pop();
    }

    dynamicRecomputeFormulasPush(v) {
        this._dynamicRecomputeFormulas.push(v);
    }

    dynamicRecomputeFormulasPop() {
        console.assert(this._dynamicRecomputeFormulas.length > 1);
        this._dynamicRecomputeFormulas.pop();
    }

    removeIsolatedNodes() {
        this._formulaNodes.forEach(formulaNode => {
            if (!formulaNode.formula && formulaNode.predecessorNodes.size === 0 && formulaNode.successorSelInstances.size === 0) {
                this.removeFormulaNode(formulaNode.node);
            }
        });
    }

    rebuild(recompute=true) {
        timeIt('Building formula graph', () => {
            this.dynamicUpdateGraphPush(false);
            this._formulaNodes.forEach(formulaNode => {
                formulaNode.successorSelInstances.clear();
            });
            this._formulaNodes.forEach(formulaNode => {
                if (formulaNode.formula) {
                    formulaNode._rebuildPredecessors(true);
                    this._addToPredecessorsOfNode(formulaNode);
                }
            });
            this.removeIsolatedNodes();
            this._levelsOutdated = true;
            this._pendingFormulaUpdate.clear();
            if (this.dynamicRecomputeFormulas || recompute) {
                this.recomputeFormulas();
            } else {
                this._getRoots().forEach(formulaNode => this._pendingFormulaUpdate.add(formulaNode));
            }
            this.dynamicUpdateGraphPop();
        });
    }

    _detachFormulaNodeFromSuccessors(formulaNode) {
        this._removeFromSuccessorsOfNode(formulaNode);
        formulaNode._removeFromSuccessorsMatchingNodes();
        // While the successors are still known to the node, recompute their formulas
        if (this.dynamicRecomputeFormulas) {
            this.recomputeFormulas(formulaNode, false, true);
        } else {
            formulaNode.successorSelInstances.forEach(selInstance => {
                this._pendingFormulaUpdate.add(selInstance.node._formulaNode);
            });
        }
    }

    _attachFormulaNodeToSuccessors(formulaNode) {
        formulaNode._rebuildSuccessors(this.selectorStorage);
        formulaNode._addToSuccessorsMatchingNodes();
        this._addToSuccessorsOfNode(formulaNode);
        if (this.dynamicRecomputeFormulas) {
            this.recomputeFormulas(formulaNode, false, false);
        } else {
            this._pendingFormulaUpdate.add(formulaNode);
        }
    }

    _addFormulaNode(formulaNode) {
        if (!this.dynamicUpdateGraph) {
            return;
        }
        this._levelsOutdated = true;
        if (formulaNode.formula) {
            formulaNode._rebuildPredecessors(false);
            this._addToPredecessorsOfNode(formulaNode);
        }
        this._attachFormulaNodeToSuccessors(formulaNode);
    }

    _removeFromPredecessorsOfNode(formulaNode) {
        if (!formulaNode.formula) {
            return;
        }
        formulaNode.formula.getAllSelectorInstances().forEach(selInstance => {
            console.assert(selInstance.matchingNodes);
            selInstance.matchingNodes.forEach(node => {
                node._formulaNode.successorSelInstances.delete(selInstance);
            });
        });
    }

    _removeFromSuccessorsOfNode(formulaNode) {
        formulaNode.successorSelInstances.forEach(selInstance => {
            selInstance.node._formulaNode.predecessorNodes.delete(formulaNode.node);
        });
    }

    _addToSuccessorsOfNode(formulaNode) {
        formulaNode.successorSelInstances.forEach(selInstance => {
            const successorNodeData = this._ensureFormulaNode(selInstance.node);
            successorNodeData.predecessorNodes.add(formulaNode.node);
        });
    }

    _addToPredecessorsOfNode(formulaNode) {
        if (!formulaNode.formula) {
            return;
        }
        formulaNode.formula.getAllSelectorInstances().forEach(selInstance => {
            console.assert(selInstance.matchingNodes);
            selInstance.matchingNodes.forEach(node => {
                this._ensureFormulaNode(node).successorSelInstances.add(selInstance);
            });
        });
    }

    _ensureFormulaNode(node) {
        if (!node._formulaNode) {
            node._formulaNode = new DDFormulaNode(node);
            this._formulaNodes.push(node._formulaNode);
        }
        return node._formulaNode;
    }

    addFormulaNode(node, formulaExpression=null) {
        // Do not allow master nodes in the formula graph.
        console.assert(!node.isInAnyArrayMaster);
        if (typeof formulaExpression === 'undefined' || formulaExpression === null) {
            if (this.dynamicUpdateGraph) {
                const formulaNode = this._ensureFormulaNode(node);
                console.assert(formulaNode.formula === null);
                this._addFormulaNode(formulaNode);
                if (formulaNode.successorSelInstances.size === 0) {
                    // No need to update the nonexistent successors, no need to keep this node.
                    this.removeFormulaNode(node);
                }
            }
            return null;
        } else {
            const formulaNode = this._ensureFormulaNode(node);
            console.assert(formulaNode.formula === null);
            formulaNode.formula = new DDFormula(this.selectorStorage, node, formulaExpression);
            this._addFormulaNode(formulaNode);
            return formulaNode.formula;
        }
    }

    removeFormulaNode(node) {
        if (node._formulaNode) {
            if (this.dynamicUpdateGraph) {
                this._levelsOutdated = true;
                this._removeFromPredecessorsOfNode(node._formulaNode);
                this._detachFormulaNodeFromSuccessors(node._formulaNode);
            }
            if (node._formulaNode.formula) {
                node._formulaNode.formula._remove();
                node._formulaNode.formula = null;
            }
            this._pendingFormulaUpdate.delete(node._formulaNode);
            const idx = this._formulaNodes.indexOf(node._formulaNode);
            console.assert(idx >= 0);
            this._formulaNodes.splice(idx, 1);
            delete node._formulaNode;
        }
    }

    hasFormulaNode(node) {
        return !!node._formulaNode;
    }

    updateFormulaNodeSelectors(oldPath, node) {
        if (!this.dynamicUpdateGraph) {
            return;
        }
        if (node._formulaNode) {
            if (node._formulaNode.formula) {
                node._formulaNode.formula._updateFormulaNode(oldPath);
            }
        }
    }

    updateFormulaNodeNeighbors(oldPath, node) {
        if (!this.dynamicUpdateGraph) {
            return;
        }
        if (node._formulaNode) {
            this._levelsOutdated = true;
            this._detachFormulaNodeFromSuccessors(node._formulaNode);
            this._attachFormulaNodeToSuccessors(node._formulaNode);
        } else {
            // Attempt at adding this node, maybe it matches some selectors
            this.addFormulaNode(node, null);
        }
    }

    _collectDescendants(nodesOrFormulaNodes, beyondNonVoid=true, excludeRoots=false) {
        const retval = new Set();
        if (!nodesOrFormulaNodes.forEach) {
            nodesOrFormulaNodes = [nodesOrFormulaNodes];
        }
        nodesOrFormulaNodes.forEach(nodeOrFormulaNode => {
            if (!(nodeOrFormulaNode instanceof DDFormulaNode)) {
                if (!nodeOrFormulaNode._formulaNode) {
                    return;
                }
                nodeOrFormulaNode = nodeOrFormulaNode._formulaNode;
            }
            this._traverse(nodeOrFormulaNode, (formulaNode, evt) => {
                if (evt === DFSEvent.ENTER) {
                    if (retval.has(formulaNode)) {
                        return false;
                    }
                    if (nodeOrFormulaNode === formulaNode) {
                        // That's the root
                        if (excludeRoots) {
                            return true;
                        }
                    } else if (!beyondNonVoid && !formulaNode.node.isVoid) {
                        // Check if this is one of the nodes beyond which you don't want to go
                        return false;
                    }
                    // Not a root, or !excludeRoots
                    retval.add(formulaNode);
                    return true;
                }
            });
        });
        return retval;
    }

    recomputePendingFormulas(beyondNonVoid=true) {
        this.recomputeFormulas(this._pendingFormulaUpdate, beyondNonVoid, false);
        console.assert(this._pendingFormulaUpdate.size === 0);
    }

    recomputeFormulas(startingAt=null, beyondNonVoid=true, excludeRoots=false) {
        let levels = null;
        if (startingAt === null) {
            levels = this._partitionInLevels();
        } else {
            levels = this._partitionInLevels(this._collectDescendants(startingAt, beyondNonVoid, excludeRoots));
        }
        const action = () => {
            levels.forEach(level => {
                level.forEach(formulaNode => {
                    if (formulaNode.formula) {
                        if (!beyondNonVoid && !formulaNode.node.isVoid) {
                            return;
                        }
                        formulaNode.node.formulaValue = formulaNode.formula.evaluate();
                    }
                    this._pendingFormulaUpdate.delete(formulaNode);
                });
            });
        };
        if (startingAt === null) {
            timeIt('Recomputing all formulas', action);
        } else {
            action();
        }
    }

    constructor() {
        this._selectorStorage = new DDSelectorStorage();
        this._dynamicUpdateGraph = [true];
        this._dynamicRecomputeFormulas = [true];
        this._pendingFormulaUpdate = new Set();
        this._formulaNodes = [];
        this._levelsOutdated = false;
        this._maxLevel = 0;
    }


}


export { DDSelector, DDSelectorInstance, DDSelectorStorage, DDFormula, DDFormulaGraph };