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
import { DropboxExplorer } from './dbxexplorer.js';
import { DDArray } from './ddarray.js';
import { DDGraph, DDType } from './ddgraph.js';
import './jquery_animaterotate.js';
import $ from 'jquery';

let _uniqueCnt = 0;

class SuperschedaController {

    get graph() {
        return this._graph;
    }

    constructor(dbxAppId) {
        this._appId = dbxAppId;
        this._dropbox = null;
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
    }

    _initLocalStorage() {
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

    _retrieveAccessToken(dbxConstructor) {
        // Try to get the access token from the local storage
        let accessToken = null;
        let appId = null;
        if (this._hasLocalStorage) {
            // Use the app id for versioning; forget the token if needed
            accessToken = window.localStorage.getItem('access_token');
            appId = window.localStorage.getItem('app_id');
        }
        if (!accessToken || appId !== this._appId) {
            accessToken = null;
            const parms = parseQueryString();
            if ('access_token' in parms) {
                accessToken = parms['access_token'];
            }
        }
        if (accessToken) {
            this._dropbox = dbxConstructor({accessToken: accessToken});
            // Test if this dropbox works
            this._dropbox.usersGetCurrentAccount()
                .then(() => { this._setHasDropbox(true, dbxConstructor); })
                .catch(() => { this._setHasDropbox(false, dbxConstructor); });
        } else {
            this._setHasDropbox(false, dbxConstructor);
        }
    }

    _setHasDropbox(hasDbx, dbxConstructor) {
        if (hasDbx) {
            $('body').addClass('has-dbx');
            $('#btn_logout').prop('disabled', false);
            if (this._hasLocalStorage) {
                // Save the access token
                window.localStorage.setItem('access_token', this._dropbox.getAccessToken());
                window.localStorage.setItem('app_id', this._appId);
            }
            this._setupSaveModal();
            this._setupLoadModal();
        } else {
            if (this._hasLocalStorage) {
                // Forget the access token if any
                window.localStorage.removeItem('access_token');
                // Make sure we autosave before leaving this page
                $('.btn-dbx-login').click(this._autosaveEvent);
            }
            // Fall back on a client-id base dbx
            this._dropbox = dbxConstructor({clientId: this._appId});
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
        $('nav#main_nav button[disabled]').not('#btn_logout').prop('disabled', false);
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
                this._modalWaitingBody.removeClass('fa-times').addClass('fa-check').addClass('show');
            } else {
                this._modalWaitingBody.removeClass('fa-check').addClass('fa-times').addClass('show');
            }
            setTimeout(() => {
                this.toggleWaiting(false);
            }, 400);
        }
    }

    _promptReady() {
        this.toggleWaiting(false);
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

    _setupLogoutButton() {
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

    _setupAutosave() {
        const autosaveInterval = 1000 * 60;
        if (this._hasLocalStorage) {
            $(window).bind('unload', this._autosaveEvent);
        }
        setInterval(this._autosaveEvent, autosaveInterval);
    }

    _setupDlButton() {
        this._saveModal.on('show.bs.modal', () => {
            this._saveModal.find('a.btn[download]')
                .attr('href', 'data:application/json;charset=utf-8,' +
                    encodeURIComponent(JSON.stringify(this.graph.dumpDataBag(), null, 4)));
        });
        this._saveModal.find('a.btn[download]').click(this._autosaveEvent);
    }

    _setupSaveModal() {
        const saveForm = this._saveModal.find('form');
        const fileNameInput = saveForm.find('input');

        // Setup dropbox explorer
        this._saveExplorer = new DropboxExplorer(
            this._dropbox,
            this._saveModal.find('.dropbox-explorer'),
            evt => {
                // Change the control value
                evt.preventDefault();
                evt.stopPropagation();
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

    _setupLoadModal() {
        // Setup dropbox explorer
        this._loadExplorer = new DropboxExplorer(
            this._dropbox,
            this._loadModal.find('.dropbox-explorer'),
            evt => {
                // Change the control value
                evt.preventDefault();
                evt.stopPropagation();
                this._loadModal.modal('hide');
                this.toggleWaiting(true);
                const file = evt.target.getAttribute('data-file');
                const path = pathCombine(this._loadExplorer.workDir, file, true);
                this.loadFromDropbox(path, res => { this.toggleWaiting(false, res); });
                // Manually copy the path on the save dialog
                this._saveExplorer.workDir = this._loadExplorer.workDir;
                // And also suggest the name
                this._saveModal.find('input').val(file).change();
            },
            (tag, name) => {
                // Only folders and json files
                return tag === 'folder' || name.endsWith('.json');
            }
        );

        this._loadModal.on('show.bs.modal', () => {
            this._loadExplorer.refresh();
        });
    }

    _setupAnimatedChevrons() {
        // Find all the chevron buttons
        $('div.card div.card-header button.close i.fas').each((_, match) => {
            const $match = $(match);
            const $button = $match.parents('button');
            const $card = $button.parents('div.card');
            $card.on('hide.bs.collapse', () => {
                $button.prop('disabled', true);
                $match.animateRotate(180, {
                    complete: () => {
                        $button.prop('disabled', false);
                        $match.css('transform', '')
                            .removeClass('fa-chevron-circle-up')
                            .addClass('fa-chevron-circle-down');
                    }
                });
            });
            $card.on('show.bs.collapse', () => {
                $button.prop('disabled', true);
                $match.animateRotate(180, {
                    complete: () => {
                        $button.prop('disabled', false);
                        $match.css('transform', '')
                            .removeClass('fa-chevron-circle-down')
                            .addClass('fa-chevron-circle-up');
                    }
                });
            });
        });
    }

    _setupWaitingModal() {
        this._modalWaiting = $('#waiting');
        this._modalWaitingBackdrop = $('#waiting_backdrop');
        this._modalWaitingBody = this._modalWaiting.find('p > i.fas');
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
    }

    _setupDynamicTitles() {
        // Select all the containers which have a master which contain a direct descendant
        // which itself is a input.dd-dyn-title
        const controllers = [];
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

    _setupDynamicIncrementers() {
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

    _setupDynamicAttacks() {
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
                    insertedItem.find('.custom-checkbox').each((_, chkDiv) => {
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
                    // Set up analogously the collapsible element
                    const $collapsible = insertedItem.find('.collapse');
                    const $collapser = insertedItem.find('[data-toggle="collapse"]');
                    if ($collapsible.length === 1 && $collapser.length === 1) {
                        ++_uniqueCnt;
                        const collapseId = 'collapse_' + _uniqueCnt.toString();
                        $collapsible.attr('id', collapseId);
                        $collapser.attr('data-target', '#' + collapseId);
                        // And turn the icon
                        const $icon = $collapser.find('i');
                        $collapsible.on('hide.bs.collapse', () => {
                            $collapser.prop('disabled', true);
                        });
                        $collapsible.on('hidden.bs.collapse', () => {
                            $collapser.prop('disabled', false);
                            $icon.removeClass('fa-angle-double-up')
                                 .addClass('fa-ellipsis-h');
                        });
                        $collapsible.on('show.bs.collapse', () => {
                            $collapser.prop('disabled', true);
                        });
                        $collapsible.on('shown.bs.collapse', () => {
                            $collapser.prop('disabled', false);
                            $icon.removeClass('fa-ellipsis-h')
                                 .addClass('fa-angle-double-up');
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

    _setupSpells() {
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

        // Apply new status when clicking on button
        this.graph.nodeByPath('incantesimi[-1]').obj.find('button').each((_, btn) => {
            btn = $(btn);
            if (btn.hasClass('dd-if-spell-known')) {
                // Prepare button
                btn.click((evt) => {
                    const parentSpellNode = this.graph.findParentNode($(evt.target));
                    const controller = DDArray.getController(parentSpellNode.obj);
                    const newSpellNode = this.graph.getNodeOfDOMElement(controller.append());
                    newSpellNode.loadDataBag(parentSpellNode.dumpDataBag());
                    newSpellNode.childById('preparazione').value = 'preparato';
                    controller.sort(this._autosortCompareFn);
                });
            } else if (btn.hasClass('dd-if-spell-ready')) {
                // Use button
                btn.click((evt) => {
                    const parentSpellNode = this.graph.findParentNode($(evt.target));
                    const controller = DDArray.getController(parentSpellNode.obj);
                    parentSpellNode.childById('preparazione').value = 'usato';
                    controller.sort(this._autosortCompareFn);
                });
            } else if (btn.hasClass('dd-if-spell-used')) {
                // Reprepare button
                btn.click((evt) => {
                    const parentSpellNode = this.graph.findParentNode($(evt.target));
                    const controller = DDArray.getController(parentSpellNode.obj);
                    parentSpellNode.childById('preparazione').value = 'preparato';
                    controller.sort(this._autosortCompareFn);
                });
            }
        });
    }


    _setupAutosort() {
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


    setup(dbxConstructor) {
        this._saveModal = $('#save_to');
        this._loadModal = $('#load_from');
        this.graph.loadNodesFromDom();
        this._initLocalStorage();
        // TODO move this at the very end
        this._retrieveAccessToken(dbxConstructor);
        // ^ will call _setupLoadModal and _setupSaveModal
        this._setupWaitingModal();
        this._setupAnimatedChevrons();
        this._setupAutosort();
        this._setupSpells();
        this._setupDynamicTitles();
        this._setupDynamicAttacks();
        this._setupDynamicIncrementers();
        this._setupDlButton();
        this._setupLogoutButton();
        this._setupAutosave();
        if (!this.loadAutosave()) {
            this.loadRemoteFile('etc/default.json');
        }
        this._promptReady();
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


    loadRemoteFile(name, postLoadAction=null) {
        console.log('Reloading remote file ' + name);
        $.getJSON(name, (jsonData) => {
            this.graph.loadDataBag(jsonData);
            this.autosort();
            if (postLoadAction) {
                postLoadAction(true);
            }
        }).fail((jqxhr, textStatus, error) => {
            this.notify('danger', 'Error ' + error + ': ' + textStatus + '.');
            if (postLoadAction) {
                postLoadAction(false);
            }
        });
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

}

export { SuperschedaController };
