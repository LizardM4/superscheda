// Shim Promises on older browsers
import 'es6-promise/auto';


// Import fetch for Dropbox to use
import(/* webpackChunkName: "fetch" */ 'isomorphic-fetch').then(fetch => {
    console.log('fetch', fetch);
});

// Lazily import dropbox
import(/* webpackChunkName: "dropbox" */ 'dropbox').then(Dropbox => {
    console.log('Dropbox', Dropbox);
});

// Load the controller
import(/* webpackChunkName: "controller" */ './js/controller').then(controller => {
    console.log('controller', controller);
});


// TODO: construct the controller with dropbox


import './css/damagetype.css';
import './css/forkme.css';
import './css/bootstrap.scss';



import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faCamera } from '@fortawesome/free-solid-svg-icons';
library.add(faCamera);
dom.watch();

console.log('Hello webpack');

const sth = (a) => 2 * a;

console.log(sth(22));

import 'bootstrap';
import { Sortable } from 'sortablejs';

