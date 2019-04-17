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
// Shim Promises on older browsers
import 'es6-promise/auto';

const appId = 'h2jyx20rz9lbwiw';

const superschedaPromise = import(
    /* webpackChunkName: "controller", webpackPreload: true */ './js/controller'
).then(({SuperschedaController: SuperschedaController}) => {
    return new SuperschedaController(appId);
});

// Import fetch for Dropbox to use
const fetchAndDbxPromise = Promise.all([
    import(/* webpackChunkName: "fetch",   webpackPrefetch: true */ 'isomorphic-fetch'),
    import(/* webpackChunkName: "dropbox", webpackPrefetch: true */ 'dropbox')
]);


// This function constructs Dropbox using the given fetch function only when available,
// otherwise waits.
async function dbxFactory(args) {
    const [{default: fetch}, {Dropbox: Dropbox}] = await fetchAndDbxPromise;
    args.fetch = fetch;
    return new Dropbox(args);
};

window.addEventListener('load', (evt) => {
    superschedaPromise.then(DD => {
        DD.setup(dbxFactory);
    });
});

import './css/damagetype.css';
import './css/forkme.css';
import './css/bootstrap.scss';


// import { library, dom } from '@fortawesome/fontawesome-svg-core';
// import { faCamera } from '@fortawesome/free-solid-svg-icons';
// library.add(faCamera);
// dom.watch();

// console.log('Hello webpack');

// const sth = (a) => 2 * a;

// console.log(sth(22));

// import 'bootstrap';
// import { Sortable } from 'sortablejs';


// dbxFactory({a: 52});

