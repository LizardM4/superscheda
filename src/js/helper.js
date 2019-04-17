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

let _timeItCnt = 0;
const _intRgx = /^[+-]?\d+$/;
// Locale: detect decimal separator. Disabled because it seems browsers ignore locale.
// const _localeDecimalSeparator = (1.5).toLocaleString().substring(1, 2);
// const _localeDecimalSeparatorRgx = new RegExp(escapeRegExp(_localeDecimalSeparator), 'g');
// const _floatRgx = new RegExp(
//     '^[+-]?(\\d+(' + escapeRegExp(_localeDecimalSeparator) +
//         '\\d*)?|' + escapeRegExp(_localeDecimalSeparator) +
//             '\\d+)([eE][+-]?\\d+)?$');
const _floatRgx = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;


function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function stringStrip(str) {
    return str.replace(/\s/g, '');
}

function strictParseInt(str) {
    str = stringStrip(str);
    if (_intRgx.test(str)) {
        return Number.parseInt(str);
    }
    return NaN;
}

function strictParseFloat(str) {
    str = stringStrip(str);
    if (_floatRgx.test(str)) {
        // Locale: normalize for parsing. Disabled because it seems browsers ignore locale.
        // str = str.replace(_localeDecimalSeparatorRgx, '.');
        // str = str.replace(/[^0-9eE+-.]/g, '');
        return Number.parseFloat(str);
    }
    return NaN;
}

function timeIt(desc, body) {
    const start = performance.now();
    _timeItCnt++;
    console.log('>'.repeat(_timeItCnt) + ' ' + desc + '...');
    const retval = body();
    const end = performance.now();
    console.log('>'.repeat(_timeItCnt) + ' ' + desc + ' took ' + Math.round(end - start).toString() + 'ms');
    _timeItCnt--;
    return retval;
}

// https://stackoverflow.com/a/29018745/1749822
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
        if (l[i] === null && r[i] !== null) {
            return -1;
        } else if (l[i] !== null && r[i] === null) {
            return 1;
        }
        if (typeof l[i] === typeof r[i]) {
            if (l[i] < r[i]) {
                return -1;
            } else if (l[i] > r[i]) {
                return 1;
            }
        } else {
            const result = l[i].toString().localeCompare(r[i].toString());
            if (result != 0) {
                return result;
            }
        }
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
            retval.push(arrayMultidimensionalPrefill(size, dims - 1, defaultValue));
        } else {
            retval.push(defaultValue);
        }
    }
    return retval;
}


function dictShallowCopy(dict) {
    const retval = {};
    Object.keys(dict).forEach(key => {
        retval[key] = dict[key];
    });
    return retval;
}


function pathCombine(path, file, absolute=true) {
    return pathNormalize(path.split('/').concat([file]), absolute);
}

function pathNormalize(path, absolute=true) {
    if (!Array.isArray(path)) {
        path = path.split('/');
    }
    path = path.filter(piece => piece.length > 0).join('/');
    if (absolute) {
        path = '/' + path;
    }
    return path;
}


// https://stackoverflow.com/a/2880929/1749822
function parseQueryString() {
    const pl = /\+/g;  // Regex for replacing addition symbol with a space
    const search = /([^&=]+)=?([^&]*)/g;
    const decode = function (s) { return decodeURIComponent(s.replace(pl, ' ')); };
    const query = window.location.hash.substring(1);
    let match = null;
    const urlParams = {};
    while (match = search.exec(query)) {
        urlParams[decode(match[1])] = decode(match[2]);
    }
    return urlParams;
}


// https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API
function storageAvailable(type) {
    try {
        const storage = window[type],
            x = '__storage_test__';
        storage.setItem(x, x);
        storage.removeItem(x);
        return true;
    }
    catch (e) {
        return e instanceof DOMException && (
            // everything except Firefox
            e.code === 22 ||
            // Firefox
            e.code === 1014 ||
            // test name field too, because code might not be present
            // everything except Firefox
            e.name === 'QuotaExceededError' ||
            // Firefox
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
            // acknowledge QuotaExceededError only if there's something already stored
            storage.length !== 0;
    }
}


export {
    arrayCompare,
    arrayMultidimensionalPrefill,
    arrayBinarySearch,
    timeIt,
    strictParseInt,
    strictParseFloat,
    dictShallowCopy,
    pathCombine,
    pathNormalize,
    parseQueryString,
    storageAvailable
};