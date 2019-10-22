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

import { timeIt, arrayCompare, parseQueryString, storageAvailable, pathCombine } from './helper.js';
import { DropboxExplorer } from './dbx-explorer.js';
import { DDArray } from './dd-array.js';
import { DDGraph, DDType } from './dd-graph.js';
import './jquery-animaterotate.js';
import $ from 'jquery';
import Popper from 'popper.js';
import Color from 'color';

const defaultCharacterPromise = import(/* webpackChunkName: "default", webpackPrefetch: true */
        '../data/default.json');

let _uniqueCnt = 0;

class SuperschedaController {

    get graph() {
        return this._graph;
    }

    constructor() {
        this._dropbox = null;
        this._dbxConnected = false;
        this._hasLocalStorage = true;
        this._saveModal = null;
        this._saveExplorer = null;
        this._loadModal = null;
        this._loadExplorer = null;
        this._graph = new DDGraph();
        this._autosaveEvent = () => { this.autosave(); };
        this._autosortCompareFn = (a, b) => {
            a = this._getAutosortKey(a);
            b = this._getAutosortKey(b);
            if (typeof a === 'number' && typeof b === 'number') {
                return a - b;
            } else if (a === null && b !== null) {
                return -1
            } else if (a !== null && b === null) {
                return 1;
            } else if (a === b) {
                return 0;
            } else if (Array.isArray(a) && Array.isArray(b)) {
                return arrayCompare(a, b);
            } else {
                return a.toString().localeCompare(b.toString());
            }
        };

        this._initDOM();  // Must come first.

        this._initDlNewBtns();
        this._initArrayAutosort();
        this._initSpells();
        this._initAbilitiesAndSavingThrows();
        this._initAttacks();
        this._initSkills();
        this._initPicture();
        this._initGUIAnimatedChevrons();
        this._initGUIDynamicTitles();
        this._initGUIDynamicIncrementers();
        this._initGUIButtons();

        this._detectLocalStorage();

        this._initAutosave();
        if (!this.loadAutosave()) {
            this.loadRemoteFile(defaultCharacterPromise);
        }
    }

    _detectLocalStorage() {
        this._hasLocalStorage = storageAvailable('localStorage');
        if (this._hasLocalStorage) {
            // Did we already open this?
            if (window.localStorage.getItem('acknowledge_cookies') === null) {
                // No.
                const alert = $('<a href="#" class="alert-link" data-target="#cookie_explain" data-toggle="modal"></a>');
                this.notify('warning', alert);
                alert.text('per cosa')
                    .before('Questa pagina usa il local storage (vedi ')
                    .after('). Disattiva i cookie per questa pagina se non lo desideri.');
                alert.parents('.alert').on('closed.bs.alert', () => {
                    window.localStorage.setItem('acknowledge_cookies', true);
                });
            }
        } else {
            // Toggle the warning in the save dialog
            $('#no_local_storage_warning').removeClass('d-none');
            // Print a warning with the limitations
            const alert = $('<a href="#" class="alert-link" data-target="#cookie_explain" data-toggle="modal"></a>')
            this.notify('warning', alert);
            alert.text('usare superscheda senza cookies')
                .before('Il local storage è disabilitato; hai disattivato i cookie? Vedi quali limitazioni ci sono ad ')
                .after('.');
        }
    }

    _dbxCompleteSetup(appId, hasDbx, dbxConstructor) {
        if (hasDbx) {
            $('body').addClass('has-dbx');
            $('#btn_logout').prop('disabled', false);
            if (this._hasLocalStorage) {
                // Save the access token
                window.localStorage.setItem('access_token', this._dropbox.getAccessToken());
                window.localStorage.setItem('app_id', appId);
            }
            this._dbxSetupSaveToDialog();
            this._dbxSetupLoadFromDialog();
            this._dbxSetupLogoff();
            this._dbxConnected = true;
        } else {
            if (this._hasLocalStorage) {
                // Forget the access token if any
                window.localStorage.removeItem('access_token');
                // Make sure we autosave before leaving this page
                $('.btn-dbx-login').click(this._autosaveEvent);
            }
            // Fall back on a client-id base dbx
            this._dropbox = dbxConstructor({clientId: appId});
            // Generate  the authentication url
            let url = null;
            if (window.location.hostname === 'localhost') {
                url = window.location;
            } else {
                // Ensure https or Dropbox won't accept the redirect URI
                // https://stackoverflow.com/a/5818284/1749822
                url = 'https://' + location.hostname + (location.port ? ':' + location.port : '')
                url += location.pathname + (location.search ? location.search : '')
            }
            $('.btn-dbx-login').attr('href', this._dropbox.getAuthenticationUrl(url));
            // Display the login dialog
            $('#auth_dbx').modal('show');
        }
        // No matter what, enable the buttons
        $('nav#main_nav button[disabled], #btn_load_pic[disabled]').not('#btn_logout').prop('disabled', false);
        // And load the picture if needed
        const node = this.graph.nodeByPath('pic_path');
        if (node.value !== null) {
            node.obj.change();
        }
    }

    autosave() {
        // Save everything before changing window
        if (this._hasLocalStorage) {
            window.localStorage.setItem('_autosave', JSON.stringify(this.graph.dumpDataBag(), null, 4));
        }
    }

    loadAutosave() {
        if (this._hasLocalStorage) {
            // Check if there is anything to load
            const toLoad = window.localStorage.getItem('_autosave');
            if (toLoad && toLoad.length > 0) {
                window.localStorage.removeItem('_autosave');
                console.log('Reloading latest save.');
                const jsonData = JSON.parse(toLoad);
                this.graph.loadDataBag(jsonData);
                this.autosort();
                return true;
            }
        }
        return false;
    }

    notify(cls, text, autoDismiss=-1) {
        const div = $('<div class="alert alert-dismissible sticky-top fade show" role="alert"></div>');
        let icon = null;
        switch(cls) {
            case 'success':
                icon = 'check';
                break;
            case 'warning':
                icon = 'exclamation-triangle';
                break;
            case 'danger':
                icon = 'exclamation-circle';
                break;
        }
        div.addClass('alert-' + cls);
        if (typeof text === 'string') {
            div.text(text);
        } else {
            text.appendTo(div);
        }
        $('<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>').appendTo(div);
        if (icon) {
            $('<i class="fas fa-pull-left fa-2x"></i>').addClass('fa-' + icon).prependTo(div);
        }
        div.insertAfter('nav.navbar');
        if (autoDismiss > 0) {
            setTimeout(() => {
                div.alert('close');
            }, autoDismiss);
        }
        return div;
    }


    toggleWaiting(onOff, success=null) {
        if (onOff) {
            // The display block and z-index wil be removed by the event in setupWaitingModal
            this._modalWaitingBackdrop.find('video')[0].play();
            this._modalWaitingBackdrop.css('z-index', 1040);
            this._modalWaiting.css('display', 'block').addClass('show');
            this._modalWaitingBackdrop.addClass('show');
        } else if (success === null) {
            this._modalWaiting.removeClass('show');
            this._modalWaitingBackdrop.removeClass('show');
        } else {
            if (success) {
                this._modalWaitingBody.find('svg').attr('data-icon', 'check');
                this._modalWaitingBody.addClass('show');
            } else {
                this._modalWaitingBody.find('svg').attr('data-icon', 'times');
                this._modalWaitingBody.addClass('show');
            }
            setTimeout(() => {
                this.toggleWaiting(false);
            }, 400);
        }
    }

    _getAutosortKey(arrayItem) {
        let matches = $(arrayItem).find('.dd-sort-key')
            .filter((_, domElement) => {
                return $(domElement)
                    .parentsUntil(arrayItem, '[data-dd-array="container"]')
                    .length === 0;
            });
        if (matches.length > 0) {
            matches = matches.toArray().map(domElement => $(domElement));
            // Sort by key order
            matches.sort((a, b) => {
                const retval = parseInt(a.attr('data-dd-sort-key-index')) - parseInt(b.attr('data-dd-sort-key-index'));
                if (retval !== retval) {
                    return 0;
                }
                return retval;
            });
            // Map each key element to its value
            const keys = matches.map($match => {
                const node = this.graph.getNodeOfDOMElement($match[0]);
                if (node) {
                    return node.value;
                } else {
                    return matches.val().toString();
                }
            });
            if (keys.length === 1) {
                return keys[0];
            }
            return keys;
        } else {
            return null;
        }
    }

    _dbxSetupLogoff() {
        $('#btn_logout').click(() => {
            this._dropbox.authTokenRevoke();
            this.autosave();
            if (this._hasLocalStorage) {
                window.localStorage.removeItem('access_token');
            }
            // Clear access token parms
            window.location.hash = '';
            window.location.reload(true);
        });
    }

    _initAutosave() {
        const autosaveInterval = 1000 * 60;
        if (this._hasLocalStorage) {
            $(window).bind('unload', this._autosaveEvent);
        }
        setInterval(this._autosaveEvent, autosaveInterval);
    }

    _initDlNewBtns() {
        this._saveModal.on('show.bs.modal', () => {
            this._saveModal.find('a.btn[download]')
                .attr('href', 'data:application/json;charset=utf-8,' +
                    encodeURIComponent(JSON.stringify(this.graph.dumpDataBag(), null, 4)));
        });
        this._saveModal.find('a.btn[download]').click(this._autosaveEvent);

        $('#load_default').click((evt) => {
          // That's an 'a', so we need to prevent jumping to href="#"
          evt.preventDefault();
          evt.stopPropagation();
          this.toggleWaiting(true);
          this.loadRemoteFile(defaultCharacterPromise, (res) => { this.toggleWaiting(false, res); });
        });

    }

    _dbxSetupSaveToDialog() {
        const saveForm = this._saveModal.find('form');
        const fileNameInput = saveForm.find('input');

        // Setup dropbox explorer
        this._saveExplorer = new DropboxExplorer(
            this._dropbox,
            this._saveModal.find('.dropbox-explorer'),
            evt => {
                // Change the control value
                fileNameInput.val(evt.target.getAttribute('data-file')).change();
            },
            (tag, name) => {
                // Only folders and json files
                return tag === 'folder' || name.endsWith('.json');
            }
        );

        // Make sure that on submit, we intercept the event and call the propert function
        saveForm.on('submit', evt => {
            evt.preventDefault();
            evt.stopPropagation();
            if (saveForm[0].checkValidity() === true) {
                this._saveModal.modal('hide');
                this.toggleWaiting(true);

                const path = pathCombine(this._saveExplorer.workDir, fileNameInput.val(), true);
                this.saveToDropbox(path, res => { this.toggleWaiting(false, res); });

                // Manually copy the path on the load dialog
                this._loadExplorer.workDir = this._saveExplorer.workDir;
            }
            saveForm.addClass('was-validated');
        });

        // Make sure that the proposed name for download is something sensitive
        fileNameInput.change(() => {
            this._saveModal.find('a[download]').attr('download', fileNameInput.val());
        });

        // When we open the modal, update everything that is needed
        this._saveModal.on('show.bs.modal', () => {
            saveForm.removeClass('was-validated');
            this._saveExplorer.refresh();
        });
    };

    guiLoadDDFromDropbox() {
        if (this._dbxConnected) {
            const onFileClick = evt => {
                // Change the control value
                this._loadModal.modal('hide');
                this.toggleWaiting(true);
                const file = evt.target.getAttribute('data-file');
                const path = pathCombine(this._loadExplorer.workDir, file, true);
                this.loadFromDropbox(path, res => { this.toggleWaiting(false, res); });
                // Manually copy the path on the save dialog
                this._saveExplorer.workDir = this._loadExplorer.workDir;
                // And also suggest the name
                this._saveModal.find('input').val(file).change();
            };

            const entryFilter = (tag, name) => {
                // Only folders and json files
                return tag === 'folder' || name.endsWith('.json');
            };

            this._loadExplorer.entryFilter = entryFilter;
            this._loadExplorer.fileClickHandler = onFileClick;
        }
        this._loadModal.modal('show');
    }

    guiLoadPicFromDropbox() {
        if (this._dbxConnected) {
            const onFileClick = evt => {
                // Change the control value
                this._loadModal.modal('hide');
                const file = evt.target.getAttribute('data-file');
                const path = pathCombine(this._loadExplorer.workDir, file, true);
                // Will update the raw control value and this will trigger the change event
                this.graph.nodeByPath('pic_path').value = path;
            };

            const entryFilter = (tag, name) => {
                // Only images
                if (tag === 'folder') {
                    return true;
                }
                name = name.toLowerCase();
                return name.endsWith('.jpg')
                    || name.endsWith('.jpeg')
                    || name.endsWith('.png')
                    || name.endsWith('.gif')
                    || name.endsWith('.webp')
                    || name.endsWith('.svg');
            };

            this._loadExplorer.entryFilter = entryFilter;
            this._loadExplorer.fileClickHandler = onFileClick;
        }
        this._loadModal.modal('show');
    }

    _dbxSetupLoadFromDialog() {
        // Setup dropbox explorer
        this._loadExplorer = new DropboxExplorer(
            this._dropbox,
            this._loadModal.find('.dropbox-explorer')
        );

        this._loadModal.on('show.bs.modal', () => {
            this._loadExplorer.refresh();
        });
    }

    _initGUIAnimatedChevrons() {
        // Find all the chevron buttons
        $('div.card div.card-header button.close').each((_, match) => {
            const $button = $(match);
            const $card = $button.parents('div.card');
            $card.on('hide.bs.collapse', () => {
                $button.prop('disabled', true);
                const $icon = $button.find('svg');
                $icon.animateRotate(0, 180, {
                    complete: () => $button.prop('disabled', false)
                });
            });
            $card.on('show.bs.collapse', () => {
                $button.prop('disabled', true);
                const $icon = $button.find('svg');
                $icon.animateRotate(180, 360, {
                    complete: () => $button.prop('disabled', false)
                });
            });
        });
    }

    _initDOM() {
        this._modalWaiting = $('#waiting');
        this._saveModal = $('#save_to');
        this._loadModal = $('#load_from');
        this._picContainer = $('#picture_container');
        this._picLoading = this._picContainer.children('#picture_loading');
        this._picMissing = this._picContainer.children('#picture_missing');

        this._modalWaitingBackdrop = $('#waiting_backdrop');
        this._modalWaitingBody = this._modalWaiting.find('p');
        this._modalWaiting.on('transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd', (evt) => {
            if (evt.target === this._modalWaiting[0]){
                if (!this._modalWaiting.hasClass('show')) {
                    this._modalWaiting.css('display', 'none');
                    this._modalWaitingBackdrop.css('z-index', 0);
                    this._modalWaitingBody.removeClass('show');
                    this._modalWaitingBackdrop.find('video')[0].pause();
                }
            }
        });

        this.graph.loadNodesFromDom();
    }

    _initGUIDynamicTitles() {
        // Select all the containers which have a master which contain a direct descendant
        // which itself is a input.dd-dyn-title
        const controllers = [];
        // TODO there is no need to collect these
        const matches = $('input.dd-dyn-title').each((_, input) => {
            // Find the corresponding container
            controllers.push(DDArray.getController($(input)));
        });

        // Setup an event that upon insertion, bubbles an extra event for the title to appear
        controllers.forEach((controller) => {
            controller.container.on('ddarray.insertion', (evt, insertedItems) => {
                insertedItems.forEach(insertedItem => {
                    const $insertedItem = $(insertedItem);
                    $insertedItem
                        .find('input.dd-dyn-title')
                        .filter((_, input) => {
                            return $(input)
                                .parentsUntil($insertedItem, '[data-dd-array="container"]')
                                .length === 0;
                        })
                        .change((changeEvt) => {
                            controller.container.trigger('ddarray.title', [$insertedItem, changeEvt.target])
                        })
                        .change();
                });
            });
        });

        // Different setup: the dynamic title change
        const originalTitle = document.title;
        $('#dd-page-title[data-dd-id]').change((evt) => {
            const val = $(evt.target).val();
            if (val.length > 0) {
                document.title = val + ' - ' + originalTitle;
            } else {
                document.title = originalTitle;
            }
        });
    }

    _initGUIDynamicIncrementers() {
        $('[data-dd-increment]').click((evt) => {
            const $target = $(evt.target).closest('.btn');
            const $inputs = $target.closest('.input-group')
                .find('input[data-dd-path][data-dd-type]:not([type="hidden"])');
            const node = window.DD.graph.getNodeOfDOMElement($inputs[0]);
            if (node && typeof node.value === 'number') {
                let increment = $target.attr('data-dd-increment');
                if (node.type === DDType.FLOAT) {
                    increment = parseFloat(increment);
                } else {
                    increment = parseInt(increment);
                }
                const newValue = node.value + increment;
                if (typeof newValue === 'number' && newValue === newValue) {
                    node.value = newValue;
                }
            }
        });
    }

    _initGUIButtons() {
        $('#btn_load_dd').click(() => { this.guiLoadDDFromDropbox(); });
        $('#btn_load_pic').click(() => { this.guiLoadPicFromDropbox(); });
        $('#btn_erase_pic').click(() => { this.graph.nodeByPath('pic_path').value = null; });
    }

    _initSkills() {
        $('#skills_list')
            .on('ddarray.insertion', (evt, insertedItems) => {
                evt.stopPropagation();
                insertedItems.forEach(insertedItem => {
                    this._initGUIPopoversInArray($(insertedItem));
                });
            });
    }

    _initPicture() {
        const $picInput = $('input#pic_path');
        $picInput.change((evt) => {
            this.guiChangePicture($picInput.val());
        });
    }

    _initGUIPopoversInArray($item) {
        const $container = DDArray.getController($item).container;
        const directDescendants = (_, domElement) => {
            return $(domElement).parentsUntil($container, '[data-dd-array="container"]').length === 0;
        }
        const $popover = $item.find('.popover').filter(directDescendants);
        const $popoverBtn = $item.find('[data-toggle~="popover"]').filter(directDescendants);
        if ($popoverBtn.length !== 1 || $popover.length !== 1) {
            return;
        }
        // Construct the popper
        const popper = new Popper($popoverBtn[0], $popover[0], {
            placement: 'top', modifiers: {arrow: {element: '.arrow'}}
        });
        // Restore the d-none when hidden to prevent catching other mouse events.
        $popover.on('transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd', (evt) => {
            if ($popover[0] !== evt.target) {
                return;
            }
            if (!$(evt.target).hasClass('show')) {
                $(evt.target).addClass('d-none');
            }
        });
        // Setup the trigger event
        $popoverBtn.click((evt) => {
            if ($popoverBtn.hasClass('active')) {
                // We would need to reapply a d-none, but this is done automatically
                // on transition end. The reason why we need d-none is because popover
                // have a very high zindex and catch the events for the surrounding
                // controls.
                $popover.removeClass('show');
            } else {
                // Dismiss all the currently active tooltips.
                $container
                    .find('button[data-toggle~="popover"].active')
                    .filter(directDescendants)
                    .button('toggle');
                $container
                    .find('div.popover.show')
                    .filter(directDescendants)
                    .removeClass('show');
                $popover.removeClass('d-none');
                // After display, needs repositioning
                popper.update();
                $popover.addClass('show');
            }
        });
    }

    _initCustomCheckboxInArrayItem($arrayItem) {
        $arrayItem.find('.custom-checkbox').each((_, chkDiv) => {
            // Find the label and the input
            chkDiv = $(chkDiv);
            const $input = chkDiv.children('input[type="checkbox"]:not(id)');
            const $label = chkDiv.children('label:not([for])');
            if ($input.length === 1 && $label.length === 1) {
                // Setup a pair of for/id items
                ++_uniqueCnt;
                const inputId = 'chk_' + _uniqueCnt.toString();
                $input.attr('id', inputId);
                $label.attr('for', inputId);
            }
        });
    }

    _initAbilitiesAndSavingThrows() {
        const $tables = [$('#ability_scores_list'), $('#saving_throws_list')];
        $tables.forEach($table => {
            const controller = DDArray.getController($table);
            $table.on('ddarray.insertion', (evt, insertedItems) => {
                insertedItems.forEach(insertedItem => this._initCustomCheckboxInArrayItem($(insertedItem)));
                // Need to sort because hidden elements do not blur
                controller.sort(this._autosortCompareFn);
            });

            DDArray.getDirectChildrenArrays($table, 'append_permanent').click(() => {
                controller.append($newItem => {
                    $newItem.find('input[data-dd-id="toggleable"]').val('false');
                });
            });
        });
    }

    _initAttacks() {
        const smTocController = DDArray.getController($('#toc_attacks_sm'));
        const mdTocController = DDArray.getController($('#toc_attacks_md'));
        $('#attacks_list')
            .on('ddarray.title', (evt, $item, input) => {
                evt.stopPropagation();
                let title = $(input).val().trim();
                if (title.length === 0) {
                    title = 'Attacco';
                }
                $item.find('span.dd-dyn-title').text(title);
                // Update the tocs too
                const idx = DDArray.getIndex($item.closest('[data-dd-index]')[0]);
                $(smTocController.get(idx)).find('a').text(title);
                $(mdTocController.get(idx)).find('a').text(title);
            })
            .on('ddarray.insertion', (evt, insertedItems) => {
                evt.stopPropagation();
                insertedItems.forEach(insertedItem => {
                    const idx = DDArray.getIndex(insertedItem);
                    insertedItem = $(insertedItem)
                    insertedItem.find('.hidden-anchor').attr('id', 'att_' + idx.toString());
                    $(smTocController.append()).find('a').attr('href', '#att_' + idx.toString());
                    $(mdTocController.append()).find('a').attr('href', '#att_' + idx.toString());
                    this._initCustomCheckboxInArrayItem(insertedItem);
                    // Set up analogously the collapsible element
                    const $collapsible = insertedItem.find('.collapse');
                    const $collapser = insertedItem.find('[data-toggle="collapse"]');
                    if ($collapsible.length === 1 && $collapser.length === 1) {
                        ++_uniqueCnt;
                        const collapseId = 'collapse_' + _uniqueCnt.toString();
                        $collapsible.attr('id', collapseId);
                        $collapser.attr('data-target', '#' + collapseId);
                        // And turn the icon
                        $collapsible.on('hide.bs.collapse', () => {
                            $collapser.prop('disabled', true);
                        });
                        $collapsible.on('hidden.bs.collapse', () => {
                            $collapser.prop('disabled', false);
                            $collapser.find('svg').attr('data-icon', 'ellipsis-h');
                        });
                        $collapsible.on('show.bs.collapse', () => {
                            $collapser.prop('disabled', true);
                        });
                        $collapsible.on('shown.bs.collapse', () => {
                            $collapser.prop('disabled', false);
                            $collapser.find('svg').attr('data-icon', 'angle-double-up');
                        });
                    }
                });
            })
            .on('ddarray.removal', (evt, removedItems) => {
                evt.stopPropagation();
                const indicesToRemove = removedItems.map(removedItem => DDArray.getIndex(removedItem));
                indicesToRemove.sort((a, b) => b - a);
                indicesToRemove.forEach(idx => {
                    smTocController.remove(idx);
                    mdTocController.remove(idx);
                });
            })
            .on('ddarray.reindex', (evt, domItemPrevIdxIdxTriples) => {
                evt.stopPropagation();
                domItemPrevIdxIdxTriples.forEach(([domItem, previousIdx, newIdx]) => {
                    $(domItem).find('.hidden-anchor').attr('id', 'att_' + newIdx.toString());
                });
            });
        const evtReindex = (evt, domItemPrevIdxIdxTriples) => {
            evt.stopPropagation();
            domItemPrevIdxIdxTriples.forEach(([domItem, previousIdx, newIdx]) => {
                $(domItem).find('a').attr('href', '#att_' + newIdx.toString());
            });
        };
        smTocController.container.on('ddarray.reindex', evtReindex);
        mdTocController.container.on('ddarray.reindex', evtReindex);
    }

    _initSpells() {
        // Transfer classes to spell array items
        this.graph.nodeByPath('incantesimi[-1].preparazione').obj.change((evt) => {
          const selectNode = this.graph.getNodeOfDOMElement(evt.target);
          const arrayItem = selectNode.parent;
          selectNode.obj.find('option').each((_, option) => {
            option = $(option);
            if (option.is(':selected'))  {
              arrayItem.obj.addClass(option.attr('data-dd-contextual-class'));
            } else {
              arrayItem.obj.removeClass(option.attr('data-dd-contextual-class'));
            }
          });
        });

        $('#spell_list').on('ddarray.insertion', (evt, insertedItems) => {
                evt.stopPropagation();
                insertedItems.forEach(insertedItem => {
                    $(insertedItem).find('[data-toggle="tooltip"]').tooltip({container: insertedItem});
                    this._initGUIPopoversInArray($(insertedItem));
                });
        });

        // Apply new status when clicking on button
        const masterSpell = this.graph.nodeByPath('incantesimi[-1]');
        masterSpell.obj.find('button').each((_, btn) => {
            btn = $(btn);
            if (btn.hasClass('d-inline-block-if-spell-known')) {
                // Prepare button
                btn.click((evt) => {
                    const parentSpellNode = this.graph.findParentNode($(evt.target));
                    const controller = DDArray.getController(parentSpellNode.obj);
                    const newSpellNode = this.graph.getNodeOfDOMElement(controller.append());
                    newSpellNode.loadDataBag(parentSpellNode.dumpDataBag());
                    newSpellNode.childById('preparazione').value = 'preparato';
                    controller.sort(this._autosortCompareFn);
                });
            } else if (btn.hasClass('d-inline-block-if-spell-ready')) {
                // Use button
                btn.click((evt) => {
                    const parentSpellNode = this.graph.findParentNode($(evt.target));
                    const controller = DDArray.getController(parentSpellNode.obj);
                    parentSpellNode.childById('preparazione').value = 'usato';
                    controller.sort(this._autosortCompareFn);
                });
            } else if (btn.hasClass('d-inline-block-if-spell-used')) {
                // Reprepare button
                btn.click((evt) => {
                    const parentSpellNode = this.graph.findParentNode($(evt.target));
                    const controller = DDArray.getController(parentSpellNode.obj);
                    parentSpellNode.childById('preparazione').value = 'preparato';
                    controller.sort(this._autosortCompareFn);
                });
            }
        });

        masterSpell.obj.find('input[type="color"]').change((evt) => {
            const $currentTarget = $(evt.currentTarget);
            const color = $currentTarget.val();
            const parentSpellNode = this.graph.findParentNode($currentTarget);
            const colorableControls = parentSpellNode.obj.find('.dd-colorable');
            colorableControls.css('background-color', color);
            if (Color(color).isDark()) {
                colorableControls.addClass('text-light');
            } else {
                colorableControls.removeClass('text-light');
            }
        });

        masterSpell.obj.find('.popover input').change((evt) => {
            const node = this.graph.getNodeOfDOMElement(evt.target);
            if (node === null) {
                return;
            }
            const spell = this.graph.findParentNode(node.obj.parents('.popover'));
            let desc = spell.childById('descrizione').value;
            if (desc === null) {
                desc = '';
            }
            const comps = [];
            spell.childById('componenti').children.forEach(child => {
                if (child.value) {
                    comps.push(child.id[0].toUpperCase());
                }
            });

            if (comps.length > 0) {
                if (desc.length > 0) {
                    desc += ' ';
                }
                desc += '[' + comps.join('') + ']';
            }

            // https://stackoverflow.com/a/9875490/1749822
            spell.obj
                .find('[data-toggle="tooltip"]')
                .attr('title', desc)
                .tooltip('_fixTitle');
        });

    }


    _initArrayAutosort() {
        $('.dd-sort-key').blur((evt, ddNode) => {
            // If ddNode is set, this is a programmatic change.
            // This means that we may be loading data. Postpone any sorting.
            if (ddNode) {
                return;
            }
            const arrayController = DDArray.getController($(evt.target));
            if (arrayController) {
                arrayController.sort(this._autosortCompareFn);
            }
        });
    }

    autosort() {
        const sortableArrayControllers = new Set();
        $('.dd-sort-key').each((_, domElement) => {
            sortableArrayControllers.add(DDArray.getController($(domElement)));
        });
        sortableArrayControllers.forEach(controller => {
            controller.sort(this._autosortCompareFn);
        });
    }

    setupDropbox(appId, dbxConstructor) {
        // Try to get the access token from the local storage
        let accessToken = null;
        let storedAppId = null;
        if (this._hasLocalStorage) {
            // Use the app id for versioning; forget the token if needed
            accessToken = window.localStorage.getItem('access_token');
            storedAppId = window.localStorage.getItem('app_id');
        }
        if (!accessToken || storedAppId !== appId) {
            accessToken = null;
            const parms = parseQueryString();
            if ('access_token' in parms) {
                accessToken = parms['access_token'];
            }
        }
        if (accessToken) {
            this._dropbox = dbxConstructor({accessToken: accessToken});
            // Modify the hash string to store the access token, in case the users
            // want to add this to their favourites
            window.location.hash = '#access_token=' + encodeURIComponent(accessToken);
            // Test if this dropbox works
            this._dropbox.usersGetCurrentAccount()
                .then(() => { this._dbxCompleteSetup(appId, true, dbxConstructor); })
                .catch(() => { this._dbxCompleteSetup(appId, false, dbxConstructor); });
        } else {
            this._dbxCompleteSetup(appId, false, dbxConstructor);
        }
    }


    saveToDropbox(path, postSaveAction=null) {
        this._dropbox.filesUpload({
                path: path,
                mode: 'overwrite',
                contents: JSON.stringify(this.graph.dumpDataBag(), null, 4)
            })
            .then((response) => {
                this.notify('success', 'Salvato su \'' + path +'\'.', 5000);
                this.autosave();
                if (postSaveAction) {
                    postSaveAction(true);
                }
            })
            .catch((error) => {
                console.log(error);
                this.notify('danger', 'Impossibile salvare su Dropbox.');
                if (postSaveAction) {
                    postSaveAction(false);
                }
            });
    }


    loadRemoteFile(nameOrPromise, postLoadAction=null) {
        const onSuccess = (jsonData) => {
            // Shallow copy jsonData, for a Promise this is an immutable Module object
            jsonData = Object.assign({}, jsonData);
            this.graph.loadDataBag(jsonData);
            this.autosort();
            if (postLoadAction) {
                postLoadAction(true);
            }
        };
        const onFailure = (reason) => {
            this.notify('danger', reason);
            if (postLoadAction) {
                postLoadAction(false);
            }
        };
        if (typeof nameOrPromise === 'string') {
            console.log('Reloading remote file ' + name);
            $.getJSON(name, onSuccess).fail(
                (jqxhr, textStatus, error) => onFailure('Error ' + error + ': ' + textStatus + '.')
            );
        } else {
            nameOrPromise.then(onSuccess, onFailure);
        }
    }

    loadFromDropbox(path, postLoadAction=null) {
        console.log('Loading Dropbox file ' + path);
        this._dropbox.filesDownload({path: path})
            .then((response) => {
                const blob = response.fileBlob;
                const reader = new FileReader();
                reader.addEventListener('loadend', () => {
                    this.graph.loadDataBag(JSON.parse(reader.result));
                    this.autosort();
                    if (postLoadAction) {
                        postLoadAction(true);
                    }
                });
                reader.readAsText(blob);
            })
            .catch((error) => {
                this.notify('danger', 'Impossibile leggere da Dropbox.');
                if (postLoadAction) {
                    postLoadAction(false);
                }
            });
    }

    guiChangePicture(path) {
        this._picContainer.children('img').remove();

        if (path === null || path === '') {
            this._picMissing.addClass('d-none');
            this._picLoading.addClass('d-none');
            return;
        } else if (this._dropbox === null) {
            // Still waiting to complete dropbox setup.
            this._picMissing.addClass('d-none');
            this._picLoading.removeClass('d-none');
            return;
        } else if (!this._dbxConnected) {
            this._picMissing.removeClass('d-none');
            this._picLoading.addClass('d-none');
            return;
        }

        this._picLoading.removeClass('d-none');
        this._picMissing.addClass('d-none');

        console.log('Loading Dropbox file ' + path + ' as character picture.');

        this._dropbox.filesDownload({path: path})
            .then((response) => {
                const blob = response.fileBlob;
                const reader = new FileReader();
                reader.addEventListener('loadend', () => {
                    this._picLoading.addClass('d-none');
                    $('<img class="img-fluid mx-auto">')
                        .attr('src', reader.result)
                        .appendTo(this._picContainer);
                });
                reader.readAsDataURL(blob);
            })
            .catch((error) => {
                this._picMissing.removeClass('d-none');
                this._picLoading.addClass('d-none');
            });
    }

}

export { SuperschedaController };
