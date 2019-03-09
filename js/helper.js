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

const _debug = true;
let _timeItCnt = 0;

function timeIt(desc, body) {
    if (!_debug) {
        return body();
    }
    const start = performance.now();
    _timeItCnt++;
    console.log('>'.repeat(_timeItCnt) + ' ' + desc + '...');
    const retval = body();
    const end = performance.now();
    console.log('>'.repeat(_timeItCnt) + ' ' + desc + ' took ' + (end - start).toString() + 'ms');
    _timeItCnt--;
    return retval;

}

function arrayBinarySearch(a, elm, compareFn) {
    let m = 0;
    let n = a.length - 1;
    while (m <= n) {
        const k = (n + m) >> 1;
        const cmp = compareFn(elm, a[k]);
        if (cmp > 0) {
            m = k + 1;
        } else if (cmp < 0) {
            n = k - 1;
        } else {
            return k;
        }
    }
    return -m - 1;
}

function arrayCompare(l, r) {
    const lUndef = (typeof l === 'undefined');
    const rUndef = (typeof r === 'undefined');
    if (lUndef && !rUndef) {
        return -1;
    } else if (!lUndef && rUndef) {
        return 1;
    } else if (lUndef && rUndef) {
        return 0;
    }
    const lNull = (l === null);
    const rNull = (r === null);
    if (lNull && !rNull) {
        return -1;
    } else if (!lNull && rNull) {
        return 1;
    } else if (lNull && rNull) {
        return 0;
    }
    for (let i = 0; i < Math.min(l.length, r.length); ++i) {
        if (l[i] < r[i]) {
            return -1;
        } else if (l[i] > r[i]) {
            return 1;
        }
        console.assert(l[i] === r[i]);
    }
    if (l.length < r.length) {
        return -1;
    } else if (l.length > r.length) {
        return 1;
    }
    return 0;
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


export { arrayCompare, arrayMultidimensionalPrefill, timeIt };