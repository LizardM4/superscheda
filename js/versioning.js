// Superscheda
// Copyright (C) 2017-2018  Pietro Saccardi
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

function parseVersion(str) {
    if (str instanceof Array) {
        return str;
    } else if (typeof str === 'undefined' || str == null) {
        return [0];
    } else {
        return str.split('.').map(x => parseInt(x))
    }
}

function strVersion(v) {
    return v.map(x => x.toString()).join('.');
}


function compareVersion(l, r) {
    if (!(l instanceof Array)) {
        l = parseVersion(l);
    }
    if (!(r instanceof Array)) {
        r = parseVersion(r);
    }
    for (var i = 0; i < Math.min(l.length, r.length); ++i) {
        if (l[i] < r[i]) {
            return -1;
        } else if (l[i] > r[i]) {
            return 1;
        }
    }
    if (l.length < r.length) {
        return -1;
    } else if (l.length > r.length) {
        return 1;
    }
    return 0;
}


function HierVersioning() {
    var self = this;

    self._patches = [];

    self.getVersion = function(hierarchy) {
        return parseVersion(hierarchy.get('_version'));
    };

    self._upperBound = function(version) {
        // Can trivially improve this to log time
        for (var i = 0; i < self._patches.length; i++) {
            var patch_version = self._patches[i][0];
            if (compareVersion(version, patch_version) < 0) {
                return i;
            }
        }
        return self._patches.length;
    };

    self.getLatestVersion = function() {
        if (self._patches.length == 0) {
            return [0];
        }
        return self._patches[self._patches.length - 1][0];
    };

    self.getLatestVersionString = function() {
        return strVersion(self.getLatestVersion());
    }

    self.needsPatch = function(hierarchy) {
        if (self._patches.length == 0) {
            return false;
        }
        return compareVersion(self.getVersion(hierarchy), self._patches[self._patches.length - 1][0]) < 0;
    };

    self.apply = function(hierarchy) {
        var v = self.getVersion(hierarchy);
        var first_patch_idx = self._upperBound(v);
        for (var i = first_patch_idx; i < self._patches.length; i++) {
            var patch_fn = self._patches[i][1];
            patch_fn(hierarchy);
        }
        hierarchy.set('_version', self.getLatestVersionString());
    };

    self.addPatch = function(version, fn) {
        version = parseVersion(version);
        var insertion_idx = self._upperBound(version);
        self._patches.splice(insertion_idx, 0, [version, fn]);
    };

}

DDver = new HierVersioning()


DDver.addPatch('0.0.9', function(h) {
    var bugfix = function(notAnArray) {
        var realArray = [];
        for (var i = 0; i < notAnArray['length']; ++i) {
            realArray.push(notAnArray[i.toString()]);
        }
        return realArray;
    };
    var skillTricks = h.get('skill_tricks');
    if (skillTricks instanceof Object) {
        console.log('Skill tricks have the bug.');
        h.set('skill_tricks', bugfix(skillTricks))
    }
    var privileges = h.get('privilegi');
    if (privileges instanceof Object) {
        console.log('Privileges have the bug.');
        h.set('privilegi', bugfix(privileges))
    }
});

DDver.addPatch('0.1', function(h) {
    console.log('Migrating skill tricks to talents.');
    var skillTricks = h.get('skill_tricks');
    if (skillTricks != null) {
        var talents = h.ensure('talenti');
        console.log('Got ' + talents.length.toString() + ' talents, appending ' + skillTricks.length.toString() + ' skill tricks.');
        talents.splice(talents.length, 0, ...skillTricks);
        console.log('Got now ' + talents.length + ' talents.');
    }
    h.remove('skill_tricks');
});

DDver.addPatch('0.1.1', function(h) {
    for (var i = 0; i < h.get('attacchi').length; i++) {
        var path_base = 'attacchi[' + i.toString() + '].tiro_colpire.';
        var wrong_path = path_base + 'chierico_talenti';
        var right_path = path_base + 'critico_talenti';
        var critic_talents = h.get(wrong_path);
        if (critic_talents) {
            console.log('Migrating "talenti per il chierico" for attack no. ' + i.toString());
            h.set(right_path, critic_talents);
        }
        h.remove(wrong_path);
    }
});

DDver.addPatch('0.1.3', function(h) {
    $('[data-dd-path][data-dd-formula]').each(function(idx, obj) {
        obj = $(obj);
        let ddPath = obj.attr('data-dd-path');
        if (obj.attr('placeholder') == obj.val()) {
            console.log('Replacing value for ' + ddPath + ' with precomputed default.');
            h.set(ddPath, null);
        }
    });
})