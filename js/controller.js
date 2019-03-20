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

import { timeIt } from './helper.js?v=%REV';
import { DropboxExplorer, pathCombine } from './dbxexplorer.js?v=%REV';
import { DDArray } from './ddarray.js?v=%REV';

// 1. self -> this
// 2. $(this)
// 3. var
// 4. for (let i)
// 5. function
// 6. ==, !=

class SuperschedaController {
    constructor(dbxAppId) {
        this._appId = dbxAppId;
        this._dropbox = null;
        this._hasLocalStorage = true;
        this._saveModal = null;
        this._saveExplorer = null;
        this._loadModal = null;
        this._loadExplorer = null;
        this._graph = null;
        this._autosaveEvent = () => { this.autosave(); };
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

    _retrieveAccessToken() {
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
            this._dropbox = new Dropbox.Dropbox({accessToken: accessToken});
            // Test if this dropbox works
            this._dropbox.usersGetCurrentAccount()
                .then(() => { this._setHasDropbox(true); })
                .catch(() => { this._setHasDropbox(false); });
        } else {
            this._setHasDropbox(false);
        }
    }

    _setHasDropbox(hasDbx) {
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
            this._dropbox = new Dropbox.Dropbox({clientId: this._appId});
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
            window.localStorage.setItem('_autosave', this._graph.dumpDataBag());
        }
    }

    loadAutosave() {
        if (this._hasLocalStorage) {
            // Check if there is anything to load
            const toLoad = window.localStorage.getItem('_autosave');
            if (toLoad && toLoad.length > 0) {
                window.localStorage.removeItem('_autosave');
                console.log('Reloading latest save.');
                this._graph.loadDataBag(toLoad);
                this._postLoadSync();
            }
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
                    encodeURIComponent(this._graph.dumpDataBag()));
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
                this.saveDB(path, res => { this.toggleWaiting(false, res); });

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
                this.loadDB(path, res => { this.toggleWaiting(false, res); });
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
        const matches = $('div.card div.card-header button.close i.fas');
        for (let i = 0; i < matches.length; i++) {
            const $match = $($matches[i]);
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
        }
    }

    _setupWaitingModal() {
        this._modalWaiting = $('#waiting');
        this._modalWaiting.on('hidden.bs.modal', () => {
            // Reset the content
            const dialog = this._modalWaiting.find('div.modal-dialog');
            dialog.empty();
            $('<i class="fas fa-spinner fa-pulse fa-5x"></i>').appendTo(dialog);
        });
    }

    _setupDynamicTitles() {
        // Select all the containers which have a master which contain a direct descendant
        // which itself is a input.dd-dyn-title
        const $containers = [];
        const matches = $('[data-dd-array="master"] input.dd-dyn-title').each((_, input) => {
            // Find the corresponding container
            $containers.push($(input).closest('[data-dd-array="container"]'));
        });

        // Setup an event that upon insertion, bubbles an extra event for the title to appear
        $containers.forEach(($container) => {
            $container.on('ddarray.insertion', (evt, insertedItems) => {
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
                            $container.trigger('ddarray.title', [$insertedItem])
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

    _setupCustomDropdown() {
        $('.input-group-prepend .dropdown-menu .dropdown-item').click((evt) => {
            evt.preventDefault();
            const $obj = $(evt.target);
            $obj.closest('.input-group-prepend')
                .find('input[type="text"]')
                .val($obj.text())
                .change();
        });
        $('.input-group-append .dropdown-menu .dropdown-item').click((evt) => {
            evt.preventDefault();
            const $obj = $(evt.target);
            $obj.closest('.input-group-append')
                .find('input[type="text"]')
                .val($obj.text())
                .change();
        });
    };

    _setupAttackTOC() {
        const smTocController = DDArray.getController($('#toc_attacchi_sm'));
        const mdTocController = DDArray.getController($('#toc_attacchi_md'));
        $('#array_attacchi')
            .on('ddarray.title', (evt, $item) => {
                evt.stopPropagation();
                let title = $item.val().trim();
                if (title.length === 0) {
                    title = 'Attacco';
                }
                $item.find('span.dd-dyn-title').text(title);
                // Update the tocs too
                const idx = DDArray.getIndex($item.closest('[data-dd-index]')[0]);
                $(smTocController.get(idx)).find('a').text(title);
                $(mdTocController.get(idx)).find('a').text(title);
            })
            .on('ddarray.insertion', function(evt, insertedItems) {
                evt.stopPropagation();
                insertedItems.forEach(insertedItem => {
                    const idx = DDArray.getIndex(insertedItem);
                    $(insertedItem).find('.hidden-anchor').attr('id', 'att_' + idx.toString());
                    $(smTocController.append()).find('a').attr('href', '#att_' + idx.toString());
                    $(mdTocController.append()).find('a').attr('href', '#att_' + idx.toString());
                });
            })
            .on('ddarray.removal', function(evt, removedItems) {
                evt.stopPropagation();
                removedItems.forEach(removedItem => {
                    const idx = DDArray.getIndex(removedItem);
                    smTocController.remove(idx);
                    mdTocController.remove(idx);
                }
            })
            .on('ddarray.reindex', function(evt, domItemPrevIdxIdxTriples) {
                evt.stopPropagation();
                domItemPrevIdxIdxTriples.forEach(([domItem, previousIdx, newIdx]) => {
                    $(domItem).find('.hidden-anchor').attr('id', 'att_' + newIdx.toString());
                });
            });
        const evtReindex = function(evt, domItemPrevIdxIdxTriples) {
            evt.stopPropagation();
            domItemPrevIdxIdxTriples.forEach(([domItem, previousIdx, newIdx]) => {
                $(domItem).find('a').attr('href', '#att_' + newIdx.toString());
            });
        };
        smTocController.container.on('ddarray.reindex', evtReindex);
        mdTocController.container.on('ddarray.reindex', evtReindex);
    };

}

function Controller(dbxAppId) {










    self.autosort = function(array) {
        const compare = function(x, y) {
          return $(x).find('.dd-sort-key[data-dd-id]').val().localeCompare(
            $(y).find('.dd-sort-key[data-dd-id]').val()
          );
        };
        $(array).data('ddArrayController').sort(compare);
    };

    self._setupAutosort = function() {
        const matches = $('.dd-autosort[data-dd-id]');
        for (let i = 0; i < matches.length; i++) {
            const match = $(matches[i]);
            const container = match.closest('[data-dd-array="container"]');
            match.blur(function(evt) {
                self.autosort(container);
            });
        }
    };



    self.notify = function(cls, text, auto_dismiss=-1) {
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
        if (text instanceof jQuery) {
            text.appendTo(div);
        } else {
            div.text(text);
        }
        $('<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>').appendTo(div);
        if (icon) {
            $('<i class="fas fa-pull-left fa-2x"></i>').addClass('fa-' + icon).prependTo(div);
        }
        div.insertAfter('nav.navbar');
        if (auto_dismiss > 0) {
            setTimeout(function() {
                div.alert('close');
            }, auto_dismiss);
        }
        return div;
    };

    self._promptReady = function() {
        const modal = $('#loading_modal');
        // https://stackoverflow.com/a/9255507/1749822
        modal.on('transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd', function(e) {
            modal.off(e);
            modal.remove();
        }).removeClass('show');
    };

    self._postLoadSync = function() {
        self.formulasActive = false;
        console.log('Data loaded.');
        timeIt('Patching and loading data', function() {
            if (self._needsPatching()) {
                console.log('Data source needs patching.')
                self._applyPatches();
            }
            self.updateForm();
            self.refreshFormulas();
        });
        self.formulasActive = true;
    };


    self.setup = function() {
        self._saveModal = $('#save_to');
        self._loadModal = $('#load_from');
        self._initLocalStorage();
        self._retrieveAccessToken();
        // ^ will call _setupLoadModal and _setupSaveModal
        self._setupWaitingModal();
        self._setupAnimatedChevrons();
        self._setupDDPaths();
        self._setupAutosort();
        self._setupArrays();
        self._setupDynamicTitles();
        self._setupFormulas();
        self._setupAttackTOC();
        self._setupCustomDropdown();
        self._setupDlButton();
        self._setupLogoutButton();
        self._setupAutosave();
        self.loadAutosave();
        self._promptReady();
    };

    self.updateHier = function() {
        const matches = self._allControls();
        for (let i = 0; i < matches.length; i++) {
            const match = $(matches[i]);
            self.data.set(match.attr('data-dd-path'), match.ddVal());
        }
        self._truncateAllHierArrays();
    };

    self.updateForm = function() {
        self._resizeAllFormArrays();
        timeIt('Updating form', function() {
            const flatData = self.data.flatten();
            const matches = self._allControls();
            for (let i = 0; i < matches.length; i++) {
                const match = $(matches[i]);
                let val = flatData[match.attr('data-dd-path')];
                if (typeof val === 'undefined') {
                    val = null;
                }
                match.ddVal(val);
                if (match.is('.dd-dyn-title, [data-dd-depth], #dd-page-title')) {
                    // Trigger a change event because this manages a dynamic title.
                    match.change();
                }
            }
        });
    };

    self.toggleWaiting = function(on_off, success=null) {
        if (on_off) {
            self._modalWaiting.modal('show');
        } else if (success === null) {
            self._modalWaiting.modal('hide');
        } else {
            const dialog = self._modalWaiting.find('div.modal-dialog');
            dialog.empty();
            if (success) {
                $('<i class="fas fa-check fa-5x"></i>').appendTo(dialog);
            } else {
                $('<i class="fas fa-times fa-5x"></i>').appendTo(dialog);
            }
            setTimeout(function() {
                self._modalWaiting.modal('hide');
            }, 400);
        }
    }

    self.saveDB = function(path, post_action=null) {
        self.updateHier();
        self._dropbox.filesUpload({
            path: path,
            mode: 'overwrite',
            contents: self.data.dump()
        })
            .then(function(response) {
                self.notify('success', 'Salvato su \'' + path +'\'.', 5000);
                self.autosave();
                if (post_action) {
                    post_action(true);
                }
            })
            .catch(function(error) {
                console.log(error);
                self.notify('danger', 'Impossibile salvare su Dropbox.');
                if (post_action) {
                    post_action(false);
                }
            });
    };

    self._needsPatching = function() {
        return window.DDver && window.DDver.needsPatch(self.data);
    };

    self._applyPatches = function() {
        if (!self._needsPatching()) {
            return;
        }
        console.log('Loading data into form for patching.');
        self.updateForm();
        self.refreshFormulas(false);
        timeIt('Patching', function() {
            window.DDver.apply(self.data);
        });
        console.log('Successfully updated to version ' + window.DDver.getLatestVersionString());
    };

    self.loadRemote = function(name, post_action=null) {
        console.log('Reloading remote file ' + name);
        $.getJSON(name, function(json_data) {
            self.data.obj = json_data;
            self._postLoadSync();
            self.autosave();
            if (post_action) {
                post_action(true);
            }
        }).fail(function(jqxhr, textStatus, error) {
            self.notify('danger', 'Error ' + error + ': ' + textStatus + '.');
            if (post_action) {
                post_action(false);
            }
        });
    };

    self.loadDB = function(path, post_action=null) {
        console.log('Loading Dropbox file ' + path);
        self._dropbox.filesDownload({path: path})
            .then(function (response) {
                const blob = response.fileBlob;
                const reader = new FileReader();
                reader.addEventListener('loadend', function() {
                    self.data.load(reader.result);
                    self._postLoadSync();
                    self.autosave();
                    if (post_action) {
                        post_action(true);
                    }
                });
                reader.readAsText(blob);
            })
            .catch(function (error) {
                self.notify('danger', 'Impossibile leggere da Dropbox.');
                if (post_action) {
                    post_action(false);
                }
            });
    };

};


// https://stackoverflow.com/a/15191130/1749822
$.fn.animateRotate = function(angle, duration, easing, complete) {
    const args = $.speed(duration, easing, complete);
    const step = args.step;
    for (let i = 0; i < this.length; i++) {
        const e = this[i];
        args.complete = $.proxy(args.complete, e);
        args.step = function(now) {
            $.style(e, 'transform', 'rotate(' + now + 'deg)');
            if (step) return step.apply(e, arguments);
        };
        $({deg: 0}).animate({deg: angle}, args);
    }
};

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

function _find_duplicates() {
  const allDDPaths = [];
  const duplicates = [];
  const matches = $('[data-dd-path]');
  for (let i = 0; i < matches.length; i++) {
      allDDPaths.push($(matches[i]).attr('data-dd-path'));
  }
  allDDPaths.sort();
  for (let i = 1; i < allDDPaths.length; ++i) {
    if (allDDPaths[i - 1] == allDDPaths[i]) {
      if (duplicates.length == 0 || duplicates[duplicates.length - 1] != allDDPaths[i]) {
        duplicates.push(allDDPaths[i]);
      }
    }
  }
  if (duplicates.length == 0) {
    DD.notify('success',
      'There are ' + allDDPaths.length.toString() + ' identified unique controls. No duplicates.');
  } else {
    $('<pre></pre>').text(duplicates.join('\n')).appendTo(
      DD.notify('danger',
      'There are ' + allDDPaths.length.toString() + ' identified controls, ' + duplicates.length.toString() + ' of them are duplicated.')
    );
  }
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
    catch(e) {
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
