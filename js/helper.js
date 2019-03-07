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

function arrayEquals(l, r) {
    if (typeof l === 'undefined') {
        l = null;
    }
    if (typeof r === 'undefined') {
        r = null;
    }
    if ((l === null) !== (r === null)) {
        return false;
    } else if (l === null) {
        return true;
    } else if (l.length !== r.length) {
        return false;
    } else {
        for (let i = 0; i < l.length; ++i) {
            if (l[i] !== r[i]) {
                return false;
            }
        }
    }
    return true;
}


function arrayMultidimensionalPrefill(size, dims, defaultValue=null) {
    if (dims <= 0) {
        return null;
    }
    let retval = [];
    for (let i = 0; i < size; ++i) {
        if (dims > 1) {
            retval.push(arrayMultidimensionalPrefill(size, dims - 1));
        } else {
            retval.push(defaultValue);
        }
    }
    return retval;
}


export { arrayEquals, arrayMultidimensionalPrefill };