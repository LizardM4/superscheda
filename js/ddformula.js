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

import { DDGraph, DDNode, DFSEvent } from './ddgraph.js?v=%REV';

class DDMatcher {
    get isRelative() {
        return this._relative;
    }

    get matchParts() {
        return this._matchParts;
    }

    static tryMatchIndices(matchParts, matchPartsIdx, indices) {
        if (matchPartsIdx + indices.length > matchParts.length) {
            return false;
        }
        for (let i = 0; i < indices.length; ++i) {
            if (indices[i] === -1) {
                return false; // No array master
            }
            const tryMatchIndex = matchParts[matchPartsIdx + i];
            if (tryMatchIndex === -1) {
                continue; // Matches all indices
            } else if (tryMatchIndex !== indices[i]) {
                return false;
            }
        }
        return true;
    }

    static tryMatchNode(matchParts, matchPartsIdx, node) {
        console.assert(matchPartsIdx < matchParts.length);
        if (node.baseId !== matchParts[matchPartsIdx]) {
            return 0;
        }
        if (node.indices) {
            if (DDMatcher.tryMatchIndices(matchParts, matchPartsIdx + 1, node.indices)) {
                // Matches, consumes 1 unit for the baseId plus the indices length
                return 1 + node.indices.length;
            }
            return 0; // Doesn't match;
        } else {
            return 1; // Matches and consumes one unit
        }
    }

    static traverseMatchingNodes(matchParts, startNode) {
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
            const matchLength = DDMatcher.tryMatchNode(matchParts, idxs[idxs.length - 1], node);
            if (matchLength > 0) {
                // Update the idxs we will be using for the chldren to consume the matched subsequence
                idxs[idxs.length - 1] += matchLength;
                if (idxs[idxs.length - 1] >= matchParts.length) {
                    // Found a matching node!
                    if (!matchingNodes) {
                        matchingNodes = [];
                    }
                    matchingNodes.push(node);
                    console.assert(idxs[idxs.length - 1] === matchParts.length);
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

    static tryMatchParts(matchParts, candidate, startIdx=0, matchToEnd=true) {
        if (matchToEnd) {
            if (matchParts.length !== candidate.length - startIdx) {
                return false;
            }
        } else {
            if (matchParts.length > candidate.length - startIdx) {
                return false;
            }
        }

        for (let i = 0; i < matchParts.length; ++i) {
            const candidatePart = candidate[startIdx + i];
            if (candidatePart === -1) {
                // No array masters here
                return false;
            }
            if (matchParts[i] === -1) {
                // Match all numbers
                if (typeof candidatePart !== 'number') {
                    return false;
                }
            } else if (matchParts[i] !== candidatePart) {
                return false;
            }
        }
        return true;
    }

    static tryMatchAbsolute(matchParts, candidate) {
        return DDMatcher.tryMatchParts(matchParts, candidate, 0, true);
    }

    static tryMatchRelative(matchParts, commonParent, candidate) {
        if (!DDMatcher.tryMatchParts(commonParent, candidate, 0, false)) {
            return false;
        }
        return DDMatcher.tryMatchParts(matchParts, candidate, commonParent.length, true);
    }

    static parseMatchString(matchString) {
        let relative = false;
        let matchParts = [];
        if (matchString.startsWith('./')) {
            relative = true;
            matchString = matchString.slice(2);
        } else if (matchString.startsWith('/')) {
            matchString = matchString.slice(1);
        }
        // Get the pieces
        matchString.split('.').forEach(piece => {
            const [baseId, indices] = DDGraph.parseIndicesFromId(piece, true);
            console.assert(baseId && baseId.length > 0);
            matchParts.push(baseId);
            if (indices && indices.length > 0) {
                matchParts.push(...indices);
            }
        });
        return [relative, matchParts];
    }

    forwardMatch(formulaNode, sort=true) {
        console.assert(formulaNode.holdsData);
        let results = null;
        if (this.isRelative) {
            results = DDMatcher.traverseMatchingNodes(this.matchParts, formulaNode.parent);
        } else {
            results = DDMatcher.traverseMatchingNodes(this.matchParts, formulaNode.graph.root);
        }
        if (results && sort) {
            results.sort((a, b) => DDNode.nodeCompare(a, b));
        }
        return results;
    }

    reverseMatch(candidateNode) {
        let results = null
        Object.keys(this._nodesUsingThis).forEach(key => {
            const usage = this._nodesUsingThis[key];
            if (this._reverseMatch(usage.node, candidateNode)) {
                if (results) {
                    results.push(usage);
                } else {
                    results = [usage];
                }
            }
        });
        return results;
    }

    _reverseMatch(formulaNode, candidateNode) {
        console.assert(candidateNode.holdsData);
        if (this.isRelative) {
            return DDMatcher.tryMatchRelative(this.matchParts, formulaNode.parent.pathPieces,
                candidateNode.pathPieces);
        } else {
            return DDMatcher.tryMatchAbsolute(this.matchParts, candidateNode.pathPieces);
        }
    }

    _registerNode(node, idxOfMatcherInFormula) {
        const usage = this._nodesUsingThis[node.path];
        if (!usage) {
            usage = new DDMatcherUsage(node);
            this._nodesUsingThis[node.path] = usage;
        }
        usage.matcherIdxsInFormula.add(idxOfMatcherInFormula);
    }

    _updateNode(oldPath, updatedNode) {
        const usage = this._nodesUsingThis[oldPath];
        console.assert(usage.node === updatedNode);
        delete this._nodesUsingThis[oldPath];
        this._nodesUsingThis[updatedNode.path] = usage;
    }

    _unregisterNode(node) {
        delete this._nodesUsingThis[node.path];
    }

    constructor(matchString) {
        this._relative = null;
        this._matchParts = null;
        this._nodesUsingThis = {};
        [this._relative, this._matchParts] = DDMatcher.parseMatchString(matchString);
    }
}

class DDMatcherUsage {
    get node() {
        return this._node;
    }

    get matcherIdxsInFormula() {
        return this._matcherIdxsInFormula;
    }

    constructor(node) {
        this._node = node;
        this._matcherIdxsInFormula = new Set();
    }
}

class DDMatcherStorage {
    constructor() {
        this._storage = {};
    }
    createAndRegisterMatcher(matchString, node, idxOfMatcherInFormula) {
        const matcher = this._storage[matchString];
        if (!matcher) {
            matcher = new DDMatcher(matchString);
            this._storage[matchString] = matcher;
        }
        matcher._registerNode(node, idxOfMatcherInFormula);
        return matcher;
    }
}


class DDFormula {
    constructor(matcherStorage, formulaNode, expression) {
        this._argDefs = expression.split(/\s+/);
        this._operator = this._argDefs.shift();
        this._setupArguments(matcherStorage);
    }

    resolveArguments(formulaNode) {
        return this._argDefs.map(argDef => {
            if (argDef instanceof DDMatcher) {
                // Resolve
                argDef = argDef.forwardMatch(formulaNode, true);
            }
            return argDef;
        });
    }

    _updateNode(oldPath, updatedNode) {
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDMatcher) {
                argDef._updateNode(oldPath, updatedNode);
            }
        });
    }

    _removeNode(nodeToRemove) {
        this._argDefs.forEach(argDef => {
            if (argDef instanceof DDMatcher) {
                argDef._unregisterNode(nodeToRemove);
            }
        });
    }

    _setupArguments(matcherStorage, formulaNode) {
        for (let i = 0; i < this._argDefs.length; ++i) {
            const arg = this._argDefs[i];
            if (arg.startsWith('/') || arg.startsWith('./')) {
                this._argDefs[i] = matcherStorage.createAndRegisterMatcher(arg, formulaNode, i);
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


export { DDMatcher };