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

import { DDGraph } from './ddgraph.js?v=%REV';

class DDMatcher {
    get isRelative() {
        return this._relative;
    }

    get matchAgainst() {
        return this._matchAgainst;
    }

    static matchParts(matchAgainst, candidate, startIdx=0, matchToEnd=true) {
        if (matchToEnd) {
            if (matchAgainst.length !== candidate.length - startIdx) {
                return false;
            }
        } else {
            if (matchAgainst.length > candidate.length - startIdx) {
                return false;
            }
        }

        for (let i = 0; i < matchAgainst.length; ++i) {
            const candidatePart = candidate[startIdx + i];
            if (candidatePart === -1) {
                // No array masters here
                return false;
            }
            if (matchAgainst[i] === -1) {
                // Match all numbers
                if (typeof candidatePart !== 'number') {
                    return false;
                }
            } else if (matchAgainst[i] !== candidatePart) {
                return false;
            }
        }
        return true;
    }

    static matchAbsolute(matchAgainst, candidate) {
        return DDMatcher.matchParts(matchAgainst, candidate, 0, true);
    }

    static matchRelative(matchAgainst, commonParent, candidate) {
        if (!DDMatcher.matchParts(commonParent, candidate, 0, false)) {
            return false;
        }
        return DDMatcher.matchParts(matchAgainst, candidate, commonParent.length, true);
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

    reverseMatch(formulaNode, candidateNode) {
        console.assert(candidateNode.holdsData);
        if (this.isRelative) {
            return DDMatcher.matchRelative(this.matchAgainst, formulaNode.parent.pathPieces,
                candidateNode.pathPieces);
        } else {
            return DDMatcher.matchAbsolute(this.matchAgainst, candidateNode.pathPieces);
        }
    }

    constructor(matchString) {
        [this._relative, this._matchAgainst] = DDMatcher.parseMatchString(matchString);
    }
}

/*

./path
../path
../../path

path

path.subpath[0][][].subpath
does ".." match [2]!?
*/