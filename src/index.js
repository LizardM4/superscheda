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

// Lazily load bootstrap
const bootstrapPromise = import(/* webpackChunkName: "controller", webpackPreload: true */
    'bootstrap');

const APPID = 'h2jyx20rz9lbwiw';

async function prepareControllerAndDropbox(appId) {
    const [controller, fetch, Dropbox] = await Promise.all([
        import(/* webpackChunkName: "controller", webpackPreload: true */
            './js/controller.js').then(
            ({SuperschedaController: SuperschedaController}) => new SuperschedaController()),
        import(/* webpackChunkName: "fetch",   webpackPrefetch: true */
            'isomorphic-fetch').then(
            ({default: fetch}) => fetch),
        import(/* webpackChunkName: "dropbox", webpackPrefetch: true */
            'dropbox').then(
            ({Dropbox: Dropbox}) => Dropbox),
    ]);
    const dbxFactory = (args) => {
        args.fetch = fetch;
        return new Dropbox(args);
    };
    window.DD = controller;
    DD.setupDropbox(appId, dbxFactory);
    DD.toggleWaiting(false);
    return DD;
}

window.addEventListener('load', (evt) => {
    // Make sure bootstrap is also loaded before starting to poke at the setup
    bootstrapPromise.then(
        () => prepareControllerAndDropbox(APPID)
    );
});

import './css/damagetype.css';
import './css/forkme.css';
import './css/bootstrap.scss';


import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faFile, faFolder } from '@fortawesome/free-regular-svg-icons';
import { faDropbox, faGitlab } from '@fortawesome/free-brands-svg-icons';
import {
    faAngleDoubleUp,
    faBars,
    faBolt,
    faBullseye,
    faCheck,
    faChevronCircleDown,
    faChevronCircleUp,
    faCommentDots,
    faCopyright,
    faDownload,
    faEllipsisH,
    faFileAlt,
    faFire,
    faFolderOpen,
    faHourglassStart,
    faMinus,
    faMinusSquare,
    faMortarPestle,
    faPlus,
    faPlusSquare,
    faPrayingHands,
    faPullLeft,
    faRecycle,
    faSave,
    faShieldAlt,
    faSignOutAlt,
    faSort,
    faSpin,
    faSyncAlt,
    faTimes
} from '@fortawesome/free-solid-svg-icons';

library.add(
    faFile,
    faFolder,
    faDropbox,
    faGitlab,
    faAngleDoubleUp,
    faBars,
    faBolt,
    faBullseye,
    faCheck,
    faChevronCircleDown,
    faChevronCircleUp,
    faCommentDots,
    faCopyright,
    faDownload,
    faDropbox,
    faEllipsisH,
    faFileAlt,
    faFire,
    faFolderOpen,
    faGitlab,
    faHourglassStart,
    faMinus,
    faMinusSquare,
    faMortarPestle,
    faPlus,
    faPlusSquare,
    faPrayingHands,
    faPullLeft,
    faRecycle,
    faSave,
    faShieldAlt,
    faSignOutAlt,
    faSort,
    faSpin,
    faSyncAlt,
    faTimes
);
dom.watch();

// console.log('Hello webpack');

// const sth = (a) => 2 * a;

// console.log(sth(22));
// import { Sortable } from 'sortablejs';


// dbxFactory({a: 52});

