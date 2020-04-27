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

import { arrayCompare, arrayBinarySearch, timeIt, dictShallowCopy, parseDiceExpression } from './helper.js';
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

    const attackRoll = objGet(d, 'tiro_colpire', {}, true);
    const damageRoll = objGet(d, 'tiro_danni', {}, true);

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
    let classes = objGet(dataBag, 'classe', null);
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

Versioner.instance().addPatch('0.2.9', (dataBag) => {
    const remapAbilities = {
        'for': 'str',
        'des': 'dex',
        'cos': 'con',
        'int': 'int',
        'sag': 'wis',
        'car': 'cha'
    };

    const remapAbilityAttributes = {
        'tiro_base': 'base',
        'razza': 'race',
        'archetipo': 'archetype',
        'livello': 'level',
        'magia': 'magic',
        'varie': 'misc',
        'tot': 'tot',
        'temp': 'temp',
        'mod_tot': 'mod_tot',
        'mod_temp': 'mod_temp'
    };

    const remapSavingThrows = {
        'tempra_cos': 'fortitude_con',
        'tempra_des': 'fortitude_dex',
        'riflessi_des': 'reflex_dex',
        'volonta_sag': 'will_wis',
        'volonta_car': 'will_cha',
        'volonta_int': 'will_int'
    };

    const remapSavingThrowsAttributes = {
        'mod': 'mod',
        'classe': 'class',
        'razza': 'race',
        'archetipo': 'archetype',
        'magia': 'magic',
        'varie': 'misc',
        'mod_speciali': 'mod_special',
        'tot': 'tot'
    };

    const remapTranspose = (outerEntryMap, innerEntryMap, src, dst) => {
        for (const [oldInnerEntry, newOuterEntry] of Object.entries(innerEntryMap)) {
            let newEntry = {};
            for (const [oldOuterEntry, newInnerEntry] of Object.entries(outerEntryMap)) {
                const oldEntry = objGet(src, oldOuterEntry, {}, true);
                const value = objGet(oldEntry, oldInnerEntry, null);
                if (Array.isArray(value)) {
                    if (!Array.isArray(newEntry)) {
                        newEntry = [newEntry];
                    }
                    while (value.length > newEntry.length) {
                        newEntry.push(Object.assign({}, newEntry[newEntry.length - 1]))
                    }
                    for (let i = 0; i < value.length; ++i) {
                        newEntry[i][newInnerEntry] = value[i]
                    }
                } else {
                    newEntry[newInnerEntry] = value;
                }
            };
            dst[newOuterEntry] = newEntry;
        };
    };


    const oldAbilities = objGet(dataBag, 'caratteristiche', {}, true);
    const newAbilities = {};
    delete dataBag['caratteristiche'];
    remapTranspose(remapAbilities, remapAbilityAttributes, oldAbilities, newAbilities);

    const oldSavingThrows = objGet(dataBag, 'tiro_salvezza', {}, true);
    const newSavingThrows = {};
    delete dataBag['tiro_salvezza'];
    remapTranspose(remapSavingThrows, remapSavingThrowsAttributes, oldSavingThrows, newSavingThrows);

    // Only special case
    newAbilities['temp']['active'] = objGet(oldAbilities, 'tmp_active', false, true);

    dataBag['ability_scores'] = newAbilities;
    dataBag['saving_throws'] = newSavingThrows;

    objGet(dataBag, 'abilita', [], true).forEach(skill => {
        const oldKey = objGet(skill, 'chiave', null);
        if (oldKey) {
            skill['chiave'] = remapAbilities[oldKey];
        }
    });

    objGet(dataBag, 'attacchi', [], true).forEach(attack => {
        const attackRoll = objGet(attack, 'tiro_colpire', null);
        if (attackRoll) {
            const oldKey = objGet(attackRoll, 'car_chiave', null);
            if (oldKey) {
                attackRoll['car_chiave'] = remapAbilities[oldKey];
            }
        }
        const damageRoll = objGet(attack, 'tiro_danni', null);
        if (damageRoll) {
            const oldKey = objGet(damageRoll, 'car_chiave', null);
            if (oldKey) {
                damageRoll['car_chiave'] = remapAbilities[oldKey];
            }
        }
    });
});

Versioner.instance().addPatch('0.2.10', (dataBag) => {
    const abilityNullableEntries = [
        'str',
        'dex',
        'con',
        'int',
        'wis',
        'cha'
    ];
    const savingThrowNullableEntries = [
        'fortitude_con',
        'fortitude_dex',
        'reflex_dex',
        'will_wis',
        'will_cha',
        'will_int'
    ];
    const optionalModifiers = {
        'archetype': 'Archetipo',
        'magic': 'Magia',
        'misc': 'Varie',
        'temp': 'Temp',
        'mod_special': 'Speciali'
    };

    const abilityScores = objGet(dataBag, 'ability_scores', {}, true);
    const abilityScoresOtherModifiers = objGet(dataBag, 'others', [], true);
    const savingThrows = objGet(dataBag, 'saving_throws', {}, true);
    const savingThrowsOtherModifiers = objGet(dataBag, 'others', [], true);

    const addModifier = (newModifiers, nullableEntries, modifierScores, name) => {
        // Check if all null
        let allNull = true;
        for (let i = 0; i < nullableEntries.length; i++) {
            if (objGet(modifierScores, nullableEntries[i], null) !== null) {
                allNull = false;
                break;
            }
        }
        if (!allNull) {
            modifierScores['name'] = name;
            modifierScores['toggleable'] = (objGet(modifierScores, 'active', null) !== null);
            modifierScores['active'] = objGet(modifierScores, 'active', true, true);
            newModifiers.push(modifierScores);
        }
    };

    const opTable = [
        [abilityScores, abilityScoresOtherModifiers, abilityNullableEntries],
        [savingThrows, savingThrowsOtherModifiers, savingThrowNullableEntries]
    ];

    for (const [table, otherModifiers, nullableEntries] of Object.values(opTable)) {
        for (const [modifierKey, modifierName] of Object.entries(optionalModifiers)) {
            const modifierScores = objGet(table, modifierKey, null);
            delete table[modifierKey];
            if (Array.isArray(modifierScores)) {
                for (let i = 0; i < modifierScores.length; ++i) {
                    addModifier(otherModifiers, nullableEntries, modifierScores[i], modifierName + ' ' + (i + 1).toString());
                }
            } else if (modifierScores !== null) {
                addModifier(otherModifiers, nullableEntries, modifierScores, modifierName);
            }
        }

    }

    abilityScores['others'] = abilityScoresOtherModifiers;
    savingThrows['others'] = savingThrowsOtherModifiers;
    abilityScores['mod'] = objGet(abilityScores, 'mod_temp', null);
    delete abilityScores['mod_temp'];
    savingThrows['key_ability'] = objGet(savingThrows, 'mod', null);
    delete savingThrows['mod'];

});



Versioner.instance().addPatch('0.2.11', (dataBag) => {
    dataBag['race'] = objGet(dataBag, 'razza', null, false);
    delete dataBag['razza'];
});


Versioner.instance().addPatch('0.2.12', (dataBag) => {
    const parseDice = el => {
        if (typeof el === 'string') {
            const diceExpr = parseDiceExpression(el);
            if (diceExpr.length > 0) {
                return diceExpr[0];
            }
            return [null, el];
        } else {
            return [el, 1];
        }
    };
    const nonNull = el => el !== null;

    let raceDescription = 'Razza';
    const raceName = objGet(dataBag, 'race', null, false);
    if (raceName !== null) {
        raceDescription = `${raceName} (${raceDescription})`;
    }

    const hdEntries = [];

    // Get all hit dice
    const hdBag = objGet(dataBag, 'dado_vita', {}, true);
    const hitDices = objGet(hdBag, 'classe', [], true).filter(nonNull).map(parseDice);
    let totHitDices = objGet(hdBag, 'tot', null, false);
    if (totHitDices !== null) {
        const diceExpr = parseDiceExpression(totHitDices);
        if (diceExpr.length > 0) {
            totHitDices = diceExpr[0][1];
        } else {
            const castAttempt = safeParseInt(totHitDices);
            if (castAttempt !== null) {
                totHitDices = castAttempt;
            }
        }
    }


    const pushEntryPopDice = (type, name) => {
        const dice = hitDices.length > 0 ? hitDices.shift() : [null, null];
        hdEntries.push({
            'type': type,
            'name': name,
            'die': dice[0],
            'count': dice[1] === 0 ? null : dice[1]
        });
    }

    // Collect all needed entries
    const classes = objGet(dataBag, 'classe', [], true).filter(nonNull);
    const npcClass = objGet(dataBag, 'classe_png', null, false);
    const archetypes = objGet(dataBag, 'archetipo', [], true).filter(nonNull);
    const racialDice = objGet(hdBag, 'razza', null, false);

    // Do we have racial dice?
    if (racialDice !== null) {
        const dice = parseDice(racialDice);
        hdEntries.push({
            'type': 'race',
            'name': raceDescription,
            'die': dice[0],
            'count': dice[1]
        });
    }

    // Push classes
    for (let i = 0; i < classes.length; ++i) {
        pushEntryPopDice('class', classes[i]);
    }
    // Then archetypes
    for (let i = 0; i < archetypes.length; ++i) {
        pushEntryPopDice('archetype', archetypes[i]);
    }
    // Then png classes
    if (npcClass !== null) {
        pushEntryPopDice('npc_class', npcClass);
    }

    delete dataBag['classe'];
    delete dataBag['archetipo'];
    delete dataBag['classe_png'];
    delete dataBag['dado_vita'];

    const hpBag = objGet(dataBag, 'punti_ferita', {}, true);

    // If there is only one class and the total number of dice is defined, then put that into that class
    if (hdEntries.length === 1 && typeof totHitDices === 'number') {
        hdEntries[0]['count'] = totHitDices;
        totHitDices = null;
    }

    const hd = {
        'entries': hdEntries.length > 0 ? hdEntries : null,
        'hp': {
            'remain': objGet(hpBag, 'temp', null, false),
            'temp': null,
            'next_lev': null,
            'tot': objGet(hpBag, 'tot', null, false),
        },
        'tot': totHitDices
    };

    delete dataBag['punti_ferita'];

    dataBag['hit_dice'] = hd;
});

Versioner.instance().addPatch('0.2.13', (dataBag) => {
    const abilityScores = objGet(dataBag, 'ability_scores', {}, true);
    const savingThrows = objGet(dataBag, 'saving_throws', {}, true);

    let raceDescription = 'Razza';
    const raceName = objGet(dataBag, 'race', null, false);
    if (raceName !== null) {
        raceDescription += ' ' + raceName;
    }

    abilityScores['entries'] = objGet(abilityScores, 'others', null, false);
    savingThrows['entries'] = objGet(savingThrows, 'others', null, false);

    delete abilityScores['others'];
    delete abilityScores['others'];

    const racialAbilityScores = objGet(abilityScores, 'race', {}, true);

    delete abilityScores['race'];

    let anyNonNull = false;
    for (const score of Object.values(racialAbilityScores)) {
        if (score !== null) {
            anyNonNull = true;
            break;
        }
    }

    if (anyNonNull) {
        if (abilityScores['entries'] === null) {
            abilityScores['entries'] = [];
        }
        racialAbilityScores['toggleable'] = false;
        racialAbilityScores['active'] = true;
        racialAbilityScores['name'] = raceDescription;
        abilityScores['entries'].splice(0, 0, racialAbilityScores);
    }
});

Versioner.instance().addPatch('0.2.14', (dataBag) => {
    const defaultCounters = Array(10).fill(null);
    let spellCounters = objGet(dataBag, 'stat_incantesimi', {}, true);
    const spellCounterDailyLimit = objGet(spellCounters, 'al_giorno', defaultCounters, true);
    const spellCounterDailyBonus = objGet(spellCounters, 'bonus', defaultCounters, true);
    const spellCounterSaveThrowDC = objGet(spellCounters, 'cd_salvezza', defaultCounters, true);
    const spellCounterKnown = objGet(spellCounters, 'conosciuti', defaultCounters, true);
    const spellCounterKnownLimit = objGet(spellCounters, 'max_conosciuti', defaultCounters, true);
    const spellCounterReady = objGet(spellCounters, 'preparati', defaultCounters, true);
    const spellCounterDailyTot = objGet(spellCounters, 'totale', defaultCounters, true);
    const spellCounterUsed = objGet(spellCounters, 'usati', defaultCounters, true);
    spellCounters = [];
    for (let i = 0; i < defaultCounters.length; i++) {
        spellCounters.push({
            'level':         i,
            'daily_limit':   spellCounterDailyLimit.length  <= i ? null : spellCounterDailyLimit[i],
            'daily_bonus':   spellCounterDailyBonus.length  <= i ? null : spellCounterDailyBonus[i],
            'save_throw_dc': spellCounterSaveThrowDC.length <= i ? null : spellCounterSaveThrowDC[i],
            'known':         spellCounterKnown.length       <= i ? null : spellCounterKnown[i],
            'known_limit':   spellCounterKnownLimit.length  <= i ? null : spellCounterKnownLimit[i],
            'free':          null,  // New field, would be total - ready
            'daily_tot':     spellCounterDailyTot.length    <= i ? null : spellCounterDailyTot[i],
            'used':          spellCounterUsed.length        <= i ? null : spellCounterUsed[i]
        });
    }

    const spellNotes = objGet(dataBag, 'note_incantesimi', null, false);
    let oldSpells = objGet(dataBag, 'incantesimi', null, false);
    let spellEntries = null;

    if (oldSpells !== null) {

        const remapSchoolDomain = {
            'universale': 'universal',
            'abiurazione': 'abjuration',
            'ammaliamento': 'enchantment',
            'divinazione': 'divination',
            'evocazione': 'conjuration',
            'convocazione': 'conjuration_summoning',
            'richiamo': 'conjuration_calling',
            'guarigione': 'conjuration_healing',
            'teletrasporto': 'conjuration_teleportation',
            'creazione': 'conjuration_creation',
            'illusione': 'illusion',
            'allucinazione': 'illusion_phantasm',
            'finzione': 'illusion_figment',
            'mascheramento': 'illusion_glamer',
            'ombra': 'illusion_shadow',
            'trama': 'illusion_pattern',
            'invocazione': 'evocation',
            'necromanzia': 'necromancy',
            'trasmutazione': 'transmutation',
            'acqua': 'water',
            'animale': 'animal',
            'aria': 'air',
            'bene': 'good',
            'caos': 'chaos',
            'conoscenza': 'knowledge',
            'distruzione': 'destruction',
            'fortuna': 'luck',
            'forza': 'strength',
            'fuoco': 'fire',
            'guarigione': 'healing',
            'guerra': 'war',
            'inganno': 'trickery',
            'legge': 'law',
            'magia': 'magic',
            'male': 'evil',
            'morte': 'death',
            'protezione': 'protection',
            'sole': 'sun',
            'terra': 'earth',
            'vegetale': 'plant',
            'viaggio': 'travel'
        };

        const remapStatus = {
            'preparato': 'ready',
            'usato': 'used'
        };

        spellEntries = [];
        for (let i = 0; i < oldSpells.length; ++i) {
            const spellComponents = objGet(oldSpells[i], 'componenti', {}, true);
            const spellComponentMaterial = objGet(spellComponents, 'materiale', false, true);
            const spellComponentSomatic = objGet(spellComponents, 'somatica', false, true);
            const spellComponentVerbal = objGet(spellComponents, 'verbale', false, true);
            const spellComponentFocus = objGet(spellComponents, 'focus', false, true);
            const spellDescription = objGet(oldSpells[i], 'descrizione', null, false);
            let spellDomainSchool = objGet(oldSpells[i], 'dominio_scuola', null, false);
            spellDomainSchool = objGet(remapSchoolDomain, spellDomainSchool, 'universal', true);
            const spellName = objGet(oldSpells[i], 'incantesimo', null, false);
            const spellLevel = objGet(oldSpells[i], 'liv', null, false);
            let spellStatus = objGet(oldSpells[i], 'preparazione', null, false);
            spellStatus = objGet(remapStatus, spellStatus, null, true);
            const spellRef = objGet(oldSpells[i], 'rif', null, false);
            const spellTag = objGet(oldSpells[i], 'tag', null, false);
            spellEntries.push({
                'components': {
                    'material': spellComponentMaterial,
                    'somatic': spellComponentSomatic,
                    'verbal': spellComponentVerbal,
                    'focus': spellComponentFocus,
                },
                'description': spellDescription,
                'domain_school': spellDomainSchool,
                'name': spellName,
                'level': spellLevel,
                'status': spellStatus,
                'ref': spellRef,
                'tag': spellTag
            });
        }
    }


    delete dataBag['stat_incantesimi'];
    delete dataBag['note_incantesimi'];
    delete dataBag['incantesimi'];

    dataBag['spells'] = {
        'counters': spellCounters,
        'entries': spellEntries,
        'notes': spellNotes
    };
});


Versioner.instance().addPatch('0.2.15', (dataBag) => {
    const skills = objGet(dataBag, 'abilita', [], true);
    for (let i = 0; i < skills.length; i++) {
        const skill = skills[i];
        const archetypes = objGet(skill, 'archetipo', [null, null], true);
        const feat = objGet(skill, 'talento', null, false);
        const misc = objGet(skill, 'vari', null, false);
        let otherFeat = null;
        let otherMisc = null;
        if (Array.isArray(archetypes)) {
            if (archetypes.length > 0) {
                otherFeat = archetypes[0];
            }
            if (archetypes.length > 1) {
                otherMisc = archetypes[1];
            }
        }
        delete skill['archetipo'];
        delete skill['vari'];
        delete skill['talento'];
        skill['varie'] = [misc, otherMisc];
        skill['talento'] = [feat, otherFeat];
    }
});

export { Versioner };
