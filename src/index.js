import './css/damagetype.css';
import './css/forkme.css';
import './css/bootstrap.scss';

import 'bootstrap';
import { Sortable } from 'sortablejs';

import(/* webpackChunkName: "controller" */ './js/controller').then(controller => console.log(controller));


import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faCamera } from '@fortawesome/free-solid-svg-icons';
library.add(faCamera);
dom.watch();

console.log('Hello webpack');

const sth = (a) => 2 * a;

console.log(sth(22));