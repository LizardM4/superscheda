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
import { arrayCompare, arrayBinarySearch, timeIt } from './helper.js?v=%REV';
import { DFSEvent } from './ddgraph.js?v=%REV';


function objGet(obj, k, defaultValue, nullIsInvalid=false) {
    const v = obj[k];
    if (typeof v === 'undefined' || (nullIsInvalid && v === null)) {
        return defaultValue;
    }
    return v;
}

function objEnsure(obj, k, defaultValue, nullIsInvalid=false) {
    const v = obj[k];
    if (typeof v === 'undefined' || (nullIsInvalid && v === null)) {
        obj[k] = defaultValue;
        return defaultValue;
    }
    return v;
}


class Patch {
    get version() {
        return this._version;
    }

    get preLoadAction() {
        return this._preLoadAction;
    }

    get newFormulaFilters() {
        return this._newFormulaFilters;
    }

    apply(dataBag) {
        return timeIt('Applying patch ' + Versioner.versionToString(this.version), () => {
            if (this.preLoadAction) {
                this.preLoadAction(dataBag);
            }
            Versioner.setDataBagVersion(dataBag, this.version);
            return dataBag;
        });
    }

    constructor(version, preLoadAction=null, newFormulaFilters=null) {
        this._version = Versioner.versionParse(version);
        this._preLoadAction = preLoadAction;
        if (newFormulaFilters === null) {
            newFormulaFilters = [];
        } else if (!Array.isArray(newFormulaFilters)) {
            newFormulaFilters = [newFormulaFilters];
        }
        this._newFormulaFilters = newFormulaFilters;
    }

    static compare(l, r) {
        return Versioner.versionCompare(l.version, r.version);
    }
}

class Versioner {

    static versionParse(str) {
        if (str instanceof Array) {
            return str;
        } else if (typeof str === 'undefined' || str === null) {
            return [0];
        } else {
            return str.split('.').map(x => parseInt(x))
        }
    }

    static versionToString(v) {
        return v.map(x => x.toString()).join('.');
    }


    static versionCompare(l, r) {
        if (!(l instanceof Array)) {
            l = Versioner.versionParse(l);
        }
        if (!(r instanceof Array)) {
            r = Versioner.versionParse(r);
        }
        return arrayCompare(l, r);
    }

    static getDataBagVersion(dataBag) {
        return Versioner.versionParse(objGet(dataBag, '_version', [0], true));
    }

    static setDataBagVersion(dataBag, version) {
        dataBag['_version'] = Versioner.versionToString(version);
    }

    constructor() {
        this._patches = [];
    }

    get length() {
        return this._patches.length;
    }

    get latestVersion() {
        if (this._patches.length === 0) {
            return [0];
        } else {
            return this._patches[this.length - 1].version;
        }
    }

    _upperBound(version) {
        const dummyPatch = new Patch(version);
        const idx = arrayBinarySearch(this._patches, dummyPatch, Patch.compare);
        if (idx >= 0) {
            // Found exactly the same patch
            return idx + 1;
        } else {
            // Found the sorted insertion point
            return -idx;
        }
    }

    needsPatch(dataBag) {
        if (this.length === 0) {
            return false;
        }
        return Versioner.versionCompare(Versioner.getDataBagVersion(dataBag), this.latestVersion) < 0;
    }

    addPatch(v, preLoadAction=null, newFormulaFilters=null) {
        const p = new Patch(v, preLoadAction, newFormulaFilters);
        const idx = arrayBinarySearch(this._patches, p, Patch.compare);
        console.assert(idx < 0);
        this._patches.splice(-idx - 1, 0, p);
    }

    static _testFormulaFilter(ddNode, filter) {
        if (typeof filter === 'string') {
            return ddNode.path === filter;
        } else if (filter instanceof RegExp) {
            return filter.test(ddNode.path);
        } else if (typeof filter === 'boolean') {
            return filter;
        } else {
            return filter(ddNode);
        }
    }

    static _replaceWithFormulas(ddGraph, newFormulaFilters) {
        ddGraph.formulaGraph.dynamicRecomputeFormulasPush(false);
        ddGraph.root.traverse((ddNode, dfsEvent) => {
            if (dfsEvent === DFSEvent.ENTER) {
                if (ddNode.isArrayMaster) {
                    return false;
                } else if (ddNode.hasFormula && !ddNode.isVoid && ddNode._formulaValue === ddNode.value) {
                    // Test if any matcher knows this node
                    let replace = false;
                    newFormulaFilters.forEach(filter => {
                        if (Versioner._testFormulaFilter(ddNode, filter)) {
                            replace = true;
                        }
                    });
                    if (replace) {
                        console.log('Replacing ' + ddNode.path);
                        ddNode.value = null;
                    } else {
                        console.log('Skipping ' + ddNode.path);
                    }
                }
            }
        });
        ddGraph.formulaGraph.dynamicRecomputeFormulasPop();
    }

    apply(ddGraph, dataBag) {
        const v = Versioner.getDataBagVersion(dataBag);
        const firstPatchIdx = this._upperBound(v);
        const newFormulaFilters = [];
        for (let i = firstPatchIdx; i < this.length; ++i) {
            dataBag = this._patches[i].apply(dataBag);
            if (this._patches[i].newFormulaFilters) {
                // Collect formula filters
                newFormulaFilters.splice(-1, 0, ...this._patches[i].newFormulaFilters);
            }
        }
        if (newFormulaFilters.length > 0) {
            timeIt('Applying formula suggestions', () => {
                ddGraph.loadDataBag(dataBag, false);
                Versioner._replaceWithFormulas(ddGraph, newFormulaFilters);
                dataBag = ddGraph.dumpDataBag();
            });

        }
        return dataBag;
    }

    static instance() {
        return _versioner;
    }

}

const _versioner = new Versioner();


Versioner.instance().addPatch('0.0.9', (dataBag) => {
    const bugfix = (notAnArray) => {
        const realArray = [];
        for (let i = 0; i < notAnArray['length']; ++i) {
            realArray.push(notAnArray[i.toString()]);
        }
        return realArray;
    };
    const skillTricks = dataBag['skill_tricks'];
    if (skillTricks instanceof Object) {
        console.log('Skill tricks have the bug.');
        dataBag['skill_tricks'] = bugfix(skillTricks);
    }
    const privileges = dataBag['privilegi'];
    if (privileges instanceof Object) {
        console.log('Privileges have the bug.');
        dataBag['privilegi'] = bugfix(privileges);
    }
});

Versioner.instance().addPatch('0.1', (dataBag) => {
    console.log('Migrating skill tricks to talents.');
    const skillTricks = dataBag['skill_tricks'];
    if (Array.isArray(skillTricks)) {
        const talents = objEnsure(dataBag, 'talenti', [], true);
        console.log('Got ' + talents.length.toString() + ' talents, appending ' + skillTricks.length.toString() + ' skill tricks.');
        talents.splice(talents.length, 0, ...skillTricks);
        console.log('Got now ' + talents.length + ' talents.');
    }
    delete dataBag['skill_tricks'];
});

Versioner.instance().addPatch('0.1.1', (dataBag) => {
    const attacks = dataBag['attacchi'];
    if (Array.isArray(attacks)) {
        attacks.forEach(attack => {
            const rollToHit = attack['tiro_colpire'];
            if (rollToHit instanceof Object) {
                rollToHit['critico_talenti'] = objGet(rollToHit, 'chierico_talenti', null, false);
                delete rollToHit['chierico_talenti'];
            }
        });
    }
});

Versioner.instance().addPatch('0.1.6', (dataBag) => {
    dataBag['punti_totali'] = objGet(dataBag, 'gradi', null, false);
    delete dataBag['gradi'];
});

Versioner.instance().addPatch('0.2.0', null, true);

Versioner.instance().addPatch('0.2.1', null, 'penalita_nuotare');

export { Versioner };
