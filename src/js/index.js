import '../css/damagetype.css';
import '../css/forkme.css';
import 'bootstrap';
import '../css/bootstrap.scss';

import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faCamera } from '@fortawesome/free-solid-svg-icons';
library.add(faCamera);
dom.watch();

console.log('Hello webpack');