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

const APPID = 'h2jyx20rz9lbwiw';

// -------------------------------------------------------------------------------------------------
// DEPENDENCIES AND LAZY IMPORTS
// -------------------------------------------------------------------------------------------------

// Shim Promises on older browsers
import 'es6-promise/auto';

// Lazily load bootstrap
const bootstrapPromise = Promise.all([
    import(/* webpackChunkName: "bootstrap", webpackPreload: true */
        'bootstrap'),
    import(/* webpackChunkName: "btn-custom-check", webpackPreload: true */
        './js/btn-custom-check.js')
]);

const jQueryPromise = import(/* webpackChunkName: "jquery", webpackPreload: true */
    'jquery');

const sortablePromise = import(/* webpackChunkName: "sortablejs", webpackPreload: true */
    'sortablejs');

import { DDArray } from './js/dd-array.js';
 
// -------------------------------------------------------------------------------------------------
// MAIN SETUP
// -------------------------------------------------------------------------------------------------

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

    // Setup sorting in the array elements
    Promise.all([sortablePromise, jQueryPromise])
    .then(([sortableModule, jQueryModule]) => {
        const Sortable = sortableModule.default;
        const $ = jQueryModule.default;
        // ---
        const $equipList = $('#equipment_list');
        const equipController = DDArray.getController($equipList);
        $equipList.data('sortable', new Sortable($equipList[0], {
            draggable: '[data-dd-array="item"]',
            handle: '.fa-sort',
            onEnd: (evt) => {
                equipController.reindexFromDOM();
            }
        }));
    });

    DD.toggleWaiting(false);
    return DD;
}

// This needs to be set up as soon as possible. We want the real initialization to start as soon as
// all the parts are in place.

window.addEventListener('load', (evt) => {
    // Make sure bootstrap is also loaded before starting to poke at the setup
    jQueryPromise
    .then(({default: $}) => {

        const $window = $(window);

        // Toggle temporary modifiers classes (influences opacity of controls)
        $('#chk_tmp_mod').change((evt, ddNode) => {
            if ($(evt.target).is(':checked')) {
                $('table[data-dd-id="caratteristiche"]').addClass('dd-tmp-on');
            } else {
                $('table[data-dd-id="caratteristiche"]').removeClass('dd-tmp-on');
            }
        });


        // Toggle the dd-nav-toc class that drives the toc; having multiple TOCs
        // causes some not to trigger, so we toggle between one and the other.
        // Since we are at it, let's also hide the top bar if the size is too small
        const $mainNav = $('#main_nav');
        $window.resize(() => {
            if ($window.width() >= 768) {
                if (!$('#toc_md').is('.dd-nav-toc')) {
                    $('#toc_md').addClass('dd-nav-toc');
                    $('#toc_sm').removeClass('dd-nav-toc');
                    // You need both these for scrollspy to refresh properly
                    $('body').scrollspy('refresh');
                    $window.scroll();
                }
            } else {
                if (!$('#toc_sm').is('.dd-nav-toc')) {
                    $('#toc_md').removeClass('dd-nav-toc');
                    $('#toc_sm').addClass('dd-nav-toc');
                    // You need both these for scrollspy to refresh properly
                    $('body').scrollspy('refresh');
                    $window.scroll();
                }
            }
            if ($window.height() < 2 * $mainNav.outerHeight()) {
                if ($mainNav.is(':visible')) {
                    $mainNav.slideUp(200);
                }
            } else if (!$mainNav.is(':visible')) {
                $mainNav.slideDown(200);
            }
        });

        // Autoexpand sections when clicking on the menu
        $('#toc_sm a[href^="#"], #toc_md a[href^="#"]').click((evt) => {
            // Find the target
            const $target = $(evt.target.getAttribute('href'));
            if ($target.length > 0) {
                // Ensure this is visible
                if (!$target.is(':visible')) {
                    const $accordion = $target.closest('.collapse');
                    if ($accordion.length > 0) {
                        $accordion.collapse('show');
                    }
                }
                // Move manually
                $('html, body').animate({scrollTop: $target.offset().top}, 'slow');
            }
            evt.preventDefault();
            evt.stopPropagation();
            return false;
        });

        // Ensure scroll-to-top links are also correct
        $('a.navbar-brand[href="#"]').click((evt) => {
            $('html, body').animate({scrollTop: 0}, 'slow');
            evt.preventDefault();
            evt.stopPropagation();
            return false;
        });

        // Activate the TOCs
        $window.resize();

        // Setup all the tooltips
        $('[title][data-placement]').tooltip();
    })
    .then(() => {
        bootstrapPromise.then(
            () => prepareControllerAndDropbox(APPID)
        );
    });

});

// -------------------------------------------------------------------------------------------------
// ALL CSS STYLES
// -------------------------------------------------------------------------------------------------

import './css/bootstrap.scss';
import './css/btn-custom-check.css';
import './css/fork-me-ribbon.css';
import './css/dd-array.scss';
import './css/dd-spells.scss';
import './css/dd-formula.scss';
import './css/zigzag.scss';
import './css/dbx-helper.scss';
import './css/navbar-helper.scss';

// -------------------------------------------------------------------------------------------------
// FONTAWESOME
// -------------------------------------------------------------------------------------------------

import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faFile, faImages, faFolder, faSquare, faTrashAlt } from '@fortawesome/free-regular-svg-icons';
import { faDropbox, faGitlab } from '@fortawesome/free-brands-svg-icons';
import {
    faAngleDoubleUp,
    faBan,
    faBars,
    faBolt,
    faBullseye,
    faCamera,
    faCheck,
    faCheckSquare,
    faChevronCircleDown,  // not used currently,  needed if we start with collapsed sections
    faChevronCircleUp,
    faCommentDots,
    faCopyright,
    faDownload,
    faEllipsisH,
    faExclamationCircle,
    faExclamationTriangle,
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
    faSpinner,
    faSyncAlt,
    faTimes
} from '@fortawesome/free-solid-svg-icons';
import { fpMace, fpProtest, fpQuiver, fpSword } from './js/fa-freepik.js';

library.add(
    faFile,
    faFolder,
    faDropbox,
    faGitlab,
    faAngleDoubleUp,
    faBan,
    faBars,
    faBolt,
    faBullseye,
    faCamera,
    faCheck,
    faCheckSquare,
    faChevronCircleDown,
    faChevronCircleUp,
    faCommentDots,
    faCopyright,
    faDownload,
    faDropbox,
    faEllipsisH,
    faExclamationCircle,
    faExclamationTriangle,
    faFileAlt,
    faFire,
    faFolderOpen,
    faGitlab,
    faHourglassStart,
    faImages,
    faMinus,
    faMinusSquare,
    faMortarPestle,
    faPlus,
    faPlusSquare,
    faPrayingHands,
    faRecycle,
    faSave,
    faShieldAlt,
    faSignOutAlt,
    faSort,
    faSpinner,
    faSquare,
    faSyncAlt,
    faTimes,
    faTrashAlt,
    fpMace,
    fpProtest,
    fpQuiver,
    fpSword
);
dom.watch();

// -------------------------------------------------------------------------------------------------
// MISC
// -------------------------------------------------------------------------------------------------

// Improve the video appearence if webm+alpha is supported.

jQueryPromise.then(({default: $}) => {
    const $video = $('video');
    const conditionallyChooseBackdrop = () => {
      if ($video[0].currentSrc) {
        if ($video[0].currentSrc.endsWith('webm'))  {
          console.log('Playing WEBM with Alpha channel.');
          // Can improve the video to be fully visible and use webm alpha
          $video.closest('.modal-backdrop').addClass('full-opc')
        } else {
          console.log('Playing fallback MP4.');
        }
      }
    };
    if ($video[0].currentSrc) {
      conditionallyChooseBackdrop();
    } else {
      $video.on('loadeddata', conditionallyChooseBackdrop);
    }
});

