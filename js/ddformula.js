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

class DDMatcher {
    get isRelative() {
        return this._relative;
    }

    get matchParts() {
        return this._matchParts;
    }

    static tryMatchIndices(matchParts, matchPartsIdx, indices) {
        if (matchPartsIdx + indices.length >= matchParts.length) {
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
        if (node.baseId !== matchParts[0]) {
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
        let matchingNodes = [];
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

    forwardMatch(graph, formulaNode) {
        console.assert(formulaNode.holdsData);
        if (this.isRelative) {
            return DDMatcher.traverseMatchingNodes(this.matchParts, formulaNode.parent);
        } else {
            return DDMatcher.traverseMatchingNodes(this.matchParts, graph.root);
        }
    }

    reverseMatch(candidateNode) {
        let results = [];
        this._nodesUsingThis.forEach(node => {
            if (this._reverseMatch(node, candidateNode)) {
                results.push(node);
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

    _registerNode(node) {
        this._nodesUsingThis.add(node);
    }

    _unregisterNode(node) {
        this._nodesUsingThis.delete(node);
    }

    constructor(matchString) {
        this._relative = null;
        this._matchParts = null;
        this._nodesUsingThis = new Set();
        [this._relative, this._matchParts] = DDMatcher.parseMatchString(matchString);
    }
}
