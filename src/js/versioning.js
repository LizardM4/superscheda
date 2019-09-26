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

import { arrayCompare, arrayBinarySearch, timeIt, dictShallowCopy } from './helper.js';
import { DFSEvent } from './dd-graph.js';


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

Versioner.instance().addPatch('0.2.2', (dataBag) => {
    const spells = dataBag['incantesimi'];
    if (Array.isArray(spells)) {
        const toAdd = [];
        spells.forEach(spell => {
            if (typeof spell['preparati'] === 'number' && spell['preparati'] > 0) {
                for (let i = 0; i < spell['preparati']; ++i) {
                    const copy = dictShallowCopy(spell);
                    copy['preparazione'] = 'preparato';
                    toAdd.push(copy);
                }
            }
            if (typeof spell['usati'] === 'number' && spell['usati'] > 0) {
                for (let i = 0; i < spell['usati']; ++i) {
                    const copy = dictShallowCopy(spell);
                    copy['preparazione'] = 'usato';
                    toAdd.push(copy);
                }
            }
            spell['preparazione'] = null;
        });
        spells.splice(-1, 0, ...toAdd);
    }
});

Versioner.instance().addPatch('0.2.3', (dataBag) => {
    const spellStats = dataBag['stat_incantesimi'];
    spellStats['max_conosciuti'] = spellStats['conosciuti'];
    spellStats['conosciuti'] = null;
});


function safeParseInt(v) {
    if (typeof v === 'undefined' || v === null) {
        return null;
    }
    const n = parseInt(v);
    if (n === n) {
        return n;
    }
    return v;
}

function safeParseFloat(v) {
    if (typeof v === 'undefined' || v === null) {
        return null;
    }
    const n = parseFloat(v);
    if (n === n) {
        return n;
    }
    return v;
}


function _migrateAttack(d) {
    const convType = Object.freeze({'null': null, 'mischia': 'mischia_', 'distanza': 'tiro_', 'senza_armi': 'senza_armi'});
    const convSize = Object.freeze({
        '-8': 'colossale',
        '-4': 'mastodontica',
        '-2': 'enorme',
        '-1': 'grande',
        '0': 'media',
        '1': 'piccola',
        '2': 'minuscola',
        '4': 'minuta',
        '8': 'piccolissima'
    });

    d['competente'] = true;

    d['gittata'] = safeParseInt(objGet(d, 'portata', null));
    delete d['portata'];

    d['peso'] = safeParseInt(objGet(d, 'peso', null));

    if (objGet(d, 'munizioni', null) !== null) {
        d['munizioni'] = [{
            'nome': objGet(d, 'munizioni', null),
            'quantita': safeParseInt(objGet(d, 'quantita', null))
        }];
    } else {
        d['munizioni'] = null;
    }
    delete d['quantita'];

    const attackRoll = objGet(d, 'tiro_colpire');
    const damageRoll = objGet(d, 'tiro_danni');

    let newType = convType[objGet(d, 'tipo', null)];
    if (newType !== null && newType[newType.length - 1] === '_') {
        const weaponType = objGet(d, 'tipo_arma', '').toString().toLowerCase();
        if (weaponType.indexOf('guerra') >= 0) {
            newType += 'da_guerra';
        } else if (weaponType.indexOf('esotic') >= 0) {
            newType += 'esotico';
        } else {
            newType += 'semplice';
        }
    }
    d['tipo'] = newType;

    d['taglia'] = convSize[safeParseInt(objGet(attackRoll, 'mod_taglia', 0, true))];
    delete attackRoll['mod_taglia'];

    d['taglia_oggetto'] = objGet(d, 'taglia_oggetto', 'media', true).toLowerCase();
    if (d['taglia_oggetto'] === '') {
        d['taglia_oggetto'] = 'media';
    }

    attackRoll['car_chiave'] = objGet(attackRoll, 'caratteristica', 'des', true).toLowerCase().substring(0, 3);
    delete attackRoll['caratteristica'];

    damageRoll['car_chiave'] = objGet(damageRoll, 'caratteristica', 'des', true).toLowerCase().substring(0, 3);
    delete damageRoll['caratteristica'];

    d['critico'] = objGet(attackRoll, 'critico', null);
    delete attackRoll['critico'];

    delete attackRoll['critico_talenti'];

    attackRoll['mod_c'] = safeParseInt(objGet(attackRoll, 'mod_eff', null));
    if (attackRoll['mod_c'] === null) {
        attackRoll['mod_c'] = safeParseInt(objGet(attackRoll, 'mod', null));
    }
    delete attackRoll['mod'];
    delete attackRoll['mod_eff'];

    damageRoll['mod_c'] = safeParseInt(objGet(damageRoll, 'mod', null));
    delete damageRoll['mod'];

    attackRoll['modificatori'] = objGet(attackRoll, 'mod_vv', []);
    delete attackRoll['mod_vv'];

    damageRoll['modificatori'] = objGet(attackRoll, 'mod_vv', []);
    delete damageRoll['mod_vv'];

    console.assert(Array.isArray(attackRoll['modificatori']));
    console.assert(Array.isArray(damageRoll['modificatori']));

    if (objGet(attackRoll, 'mod_talenti', null) !== null) {
        attackRoll['modificatori'].push({'mod': null, 'nome': objGet(attackRoll, 'mod_talenti', null)});
    }
    delete attackRoll['mod_talenti'];

    if (objGet(damageRoll, 'mod_talenti', null) !== null) {
        damageRoll['modificatori'].push({'mod': null, 'nome': objGet(damageRoll, 'mod_talenti', null)});
    }
    delete damageRoll['mod_talenti'];

    delete attackRoll['mod_critico'];

    attackRoll['modificatori'].push(objGet(attackRoll, 'mod_magici', null));
    attackRoll['modificatori'].push(objGet(attackRoll, 'mod_razziali', null));
    delete attackRoll['mod_magici'];
    delete attackRoll['mod_razziali'];

    damageRoll['modificatori'].push(objGet(damageRoll, 'mod_magici', null));
    damageRoll['modificatori'].push(objGet(damageRoll, 'mod_razziali', null));
    delete damageRoll['mod_magici'];
    delete damageRoll['mod_razziali'];

    d['tiro_colpire_tot'] = safeParseInt(objGet(attackRoll, 'tot', null));
    if (d['tiro_colpire_tot'] === null) {
        d['tiro_colpire_tot'] = safeParseInt(objGet(attackRoll, 'tot_spec', null));
    }
    delete attackRoll['tot'];

    d['tiro_danni_tot'] = safeParseInt(objGet(damageRoll, 'mod_eff', null));
    delete damageRoll['mod_eff'];


    delete damageRoll['danni_speciali'];

    const potentialType = (objGet(damageRoll, 'tipo_speciali', '', true) + objGet(d, 'tipo_arma', '', true)).toLowerCase();
    d['danni'] = [{
        'dado': objGet(damageRoll, 'tot', null),
        'tipo': {
            'contundenti': (potentialType.indexOf('contund') >= 0),
            'non_letali': (potentialType.indexOf('letal') >= 0) || (objGet(damageRoll, 'd_non_let', null) !== null),
            'perforanti': (potentialType.indexOf('perf') >= 0),
            'taglienti': (potentialType.indexOf('tagl') >= 0)
        }
    }];

    delete damageRoll['tipo_speciali'];
    delete damageRoll['d_non_let'];

    delete d['tipo_arma'];

    // Filter mods
    const modFilter = (dMod) => {
        if (dMod === null) {
            return false;
        }
        const modV = objGet(dMod, 'mod', null);
        if (modV === null) {
            return false;
        }
        if (modV === '' && objGet(dMod, 'nome', '', true) === '') {
            return false;
        }
        const modIntV = parseInt(modV);
        if (modIntV === modIntV && modIntV === 0) {
            return false;
        }
        return true;
    };

    attackRoll['modificatori'] = attackRoll['modificatori'].filter(modFilter);
    damageRoll['modificatori'] = damageRoll['modificatori'].filter(modFilter);
}


Versioner.instance().addPatch('0.2.4', (dataBag) => {
        const attacks = objGet(dataBag, 'attacchi', null);
        if (Array.isArray(attacks)) {
            attacks.forEach(d => _migrateAttack(d));
        }
    },
    /attacchi\[\d+\].+/
);

Versioner.instance().addPatch('0.2.5', (dataBag) => {
    if (Array.isArray(dataBag['abilita'])) {
        dataBag['abilita'].forEach(skill => {
            const key = objGet(skill, 'chiave', null);
            if (key !== null) {
                skill['chiave'] = key.toLowerCase();
            }
        });
    }
});

Versioner.instance().addPatch('0.2.6', (dataBag) => {
    if (Array.isArray(dataBag['equipaggiamento'])) {
        dataBag['equipaggiamento'].forEach(equip => {
            equip['quantita'] = 1;
        });
    }
});

Versioner.instance().addPatch('0.2.7', (dataBag) => {
    const npc = objGet(dataBag, 'png', null);
    if (npc === null) {
        return;
    }
    delete dataBag['png'];
    const npcClasses = objGet(npc, 'classe', []);
    if (!Array.isArray(npcClasses)) {
        return;
    }
    let classes = objGet(dataBag, 'classe');
    if (!Array.isArray('classes')) {
        classes = [];
        dataBag['classe'] = classes;
    }
    for (let i = 0; i < npcClasses.length; i++) {
        if (npcClasses[i] === null || npcClasses[i] === '') {
            continue;
        }
        if (i === 0) {
            dataBag['classe_png'] = npcClasses[i];
        } else {
            classes.push(npcClasses[i]);
        }
    }
});


Versioner.instance().addPatch('0.2.8', (dataBag) => {
    dataBag['notes_special'] = objGet(dataBag, 'note', null, false);
    delete dataBag['note'];
});


export { Versioner };
