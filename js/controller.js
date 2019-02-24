// Superscheda
// Copyright (C) 2017-2018  Pietro Saccardi
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

function fromIntegerField(rawVal, passthrough) {
    return fromNaturalField(rawVal, passthrough);
}

let _timeItCnt = 0;
const _debug = false;

function timeIt(desc, body) {
    if (!_debug) {
        body();
        return;
    }
    const start = performance.now();
    _timeItCnt++;
    console.log('>'.repeat(_timeItCnt) + ' ' + desc + '...');
    body();
    const end = performance.now();
    console.log('>'.repeat(_timeItCnt) + ' ' + desc + ' took ' + (end - start).toString() + 'ms');
    _timeItCnt--;

}

function toIntegerField(num) {
    if (num == null) {
        return '';
    } else if (typeof num === 'number' && num > 0) {
        return '+' + num.toString();
    } else {
        return num.toString();
    }
}

function fromNaturalField(rawVal, passthrough=false) {
    if (rawVal == null) {
        return passthrough ? null : 0;
    } else {
        rawVal = rawVal.replace(' ', '');
    }
    if (rawVal == '') {
        return passthrough ? null : 0;
    }
    const cast = parseInt(rawVal);
    if (cast != cast) {
        // Nan, casting failed.
        return passthrough ? rawVal : null;
    }
    return cast;
}

function indexOfMod(mod, fieldNames) {
    mod = mod.toLowerCase();
    for (let i = 0; i < fieldNames.length; i++) {
        if (fieldNames[i].replace('/', '').split('.').indexOf(mod) >= 0) {
            return i;
        }
    }
    return -1;
}

function toNaturalField(num) {
    if (num == null) {
        return '';
    } else {
        return num.toString();
    }
}


jQuery.fn.extend({
    ddIsVoid: function () {
        const val = $(this).val();
        // Note: val == 0 is a non-void value.
        return typeof val === 'undefined' || val == null || val.trim() == '';
    },
    ddSetDefault: function(arg) {
        const obj = $(this);
        const oldPlaceholder = obj.attr('placeholder');
        if (obj.hasClass('dd-integer-field')) {
            obj.attr('placeholder', toIntegerField(arg));
        } else if (obj.hasClass('dd-natural-field')) {
            obj.attr('placeholder', toNaturalField(arg));
        } else {
            obj.attr('placeholder', arg.toString());
        }
        return oldPlaceholder != obj.attr('placeholder');
    },
    ddVal: function(arg) {
        const obj = $(this);
        const isCheckbox = (obj.attr('type') === 'checkbox');
        if (typeof arg === 'undefined') {
            // Return the value
            if (isCheckbox) {
                return obj.is(':checked');
            }
            let val = obj.val();
            if (obj.hasClass('dd-integer-field')) {
                val = fromIntegerField(val, true);
            } else if (obj.hasClass('dd-natural-field')) {
                val = fromNaturalField(val, true);
            }
            if (typeof val === 'undefined') {
                val = null;
            }
            return val;
        } else {
            // Set the value
            if (isCheckbox) {
                arg = !!arg; // Cast to bool
                obj.prop('checked', arg);
                // Make sure to handle also custom checkboxes
                const label = obj.closest('.btn-custom-checkbox');
                if (label.length > 0) {
                    if (arg) {
                        label.addClass('active');
                    } else {
                        label.removeClass('active');
                    }
                }
            } else if (obj.hasClass('dd-integer-field')) {
                obj.val(toIntegerField(arg));
            } else if (obj.hasClass('dd-natural-field')) {
                obj.val(toNaturalField(arg));
            } else {
                obj.val(arg);
            }
        }
    },
    ddFormulaVal: function (arg) {
        const obj = $(this);
        // If the object has no val, return a placeholder
        let rawVal = obj.val()
        if (typeof rawVal === 'undefined' || rawVal.trim() == '') {
            rawVal = obj.attr('placeholder');
            if (typeof rawVal === 'undefined') {
                rawVal = null;
            }
        }
        if (obj.hasClass('dd-integer-field')) {
            return fromIntegerField(rawVal, false);
        } else if (obj.hasClass('dd-natural-field')) {
            return fromNaturalField(rawVal, false);
        } else {
            return rawVal;
        }
    }
});

function Controller(dbxAppId) {
    const self = this;

    self.appId = dbxAppId;
    self.data = new Hier();
    self.dropbox = null;
    self.hasLocalStorage = true;

    self._saveModal = null;
    self._saveExplorer = null;

    self._loadModal = null;
    self._loadExplorer = null;

    self.formulasActive = false;

    self._getHierPath = function(obj) {
        obj = $(obj);
        let path = obj.attr('data-dd-id');
        if (obj.attr('data-dd-index') != null) {
            path += '[' + obj.attr('data-dd-index') + ']'
        }
        // Up one step
        obj = obj.parent();
        if (obj.length > 0) {
            obj = obj.closest('[data-dd-id]');
        }
        if (obj.length > 0) {
            path = self._getHierPath(obj) + '.' + path;
        }
        return path;
    };

    self._resolveTarget = function(obj) {
        obj = $(obj);
        if (obj.attr('data-target')) {
            return $(obj.attr('data-target'));
        }
        return obj;
    };

    self._allControls = function(parent=$, extraFilter='') {
        const selectors = ['input[data-dd-path]', 'select[data-dd-path]', 'textarea[data-dd-path]'];
        for (var i = 0; i < selectors.length; i++) {
            selectors[i] += extraFilter;
        }
        const filter = selectors.join(', ');
        return $(parent).find(filter);
    };

    self._setupDDPaths = function(objs=$('body')) {
        const matches = $(objs)
            .find('input[data-dd-id], select[data-dd-id], textarea[data-dd-id]')
            .not('[data-dd-array="master"] *');
        for (let i = 0; i < matches.length; i++) {
            const match = $(matches[i]);
            match.attr('data-dd-path', self._getHierPath(match));
        }
    };

    self._initLocalStorage = function () {
        self.hasLocalStorage = storageAvailable('localStorage');
        if (self.hasLocalStorage) {
            // Did we already open this?
            if (window.localStorage.getItem('acknowledge_cookies') == null) {
                // No.
                const alert = $('<a href="#" class="alert-link" data-target="#cookie_explain" data-toggle="modal"></a>');
                self.notify('warning', alert);
                alert.text('per cosa')
                    .before('Questa pagina usa il local storage (vedi ')
                    .after('). Disattiva i cookie per questa pagina se non lo desideri.');
                alert.parents('.alert').on('closed.bs.alert', function() {
                    window.localStorage.setItem('acknowledge_cookies', true);
                });
            }
        } else {
            // Toggle the warning in the save dialog
            $('#no_local_storage_warning').removeClass('d-none');
            // Print a warning with the limitations
            const alert = $('<a href="#" class="alert-link" data-target="#cookie_explain" data-toggle="modal"></a>')
            self.notify('warning', alert);
            alert.text('usare superscheda senza cookies')
                .before('Il local storage è disabilitato; hai disattivato i cookie? Vedi quali limitazioni ci sono ad ')
                .after('.');
        }
    }

    self._retrieveAccessToken = function() {
        // Try to get the access token from the local storage
        let accessToken = null;
        let appId = null;
        if (self.hasLocalStorage) {
            // Use the app id for versioning; forget the token if needed
            accessToken = window.localStorage.getItem('access_token');
            appId = window.localStorage.getItem('app_id');
        }
        if (!accessToken || appId != self.appId) {
            accessToken = null;
            const parms = parseQueryString();
            if ('access_token' in parms) {
                accessToken = parms['access_token'];
            }
        }
        if (accessToken) {
            self.dropbox = new Dropbox.Dropbox({accessToken: accessToken});
            // Test if this dropbox works
            self.dropbox.usersGetCurrentAccount()
                .then(function() { self._setHasDropbox(true); })
                .catch(function() { self._setHasDropbox(false); });
        } else {
            self._setHasDropbox(false);
        }
    };

    self._setHasDropbox = function(hasDbx) {
        if (hasDbx) {
            $('body').addClass('has-dbx');
            $('#btn_logout').prop('disabled', false);
            if (self.hasLocalStorage) {
                // Save the access token
                window.localStorage.setItem('access_token', self.dropbox.getAccessToken());
                window.localStorage.setItem('app_id', self.appId);
            }
            self._setupSaveModal();
            self._setupLoadModal();
        } else {
            if (self.hasLocalStorage) {
                // Forget the access token if any
                window.localStorage.removeItem('access_token');
                // Make sure we autosave before leaving this page
                $('.btn-dbx-login').click(function() {
                    self.autosave();
                });
            }
            // Fall back on a client-id base dbx
            self.dropbox = new Dropbox.Dropbox({clientId: self.appId});
            // Generate  the authentication url
            let url = null;
            if (window.location.hostname == 'localhost') {
                url = window.location;
            } else {
                // Ensure https or Dropbox won't accept the redirect URI
                // https://stackoverflow.com/a/5818284/1749822
                url = 'https://' + location.hostname + (location.port ? ':' + location.port : '')
                url += location.pathname + (location.search ? location.search : '')
            }
            $('.btn-dbx-login').attr('href', self.dropbox.getAuthenticationUrl(url));
            // Display the login dialog
            $('#auth_dbx').modal('show');
        }
        // No matter what, enable the buttons
        $('nav#main_nav button[disabled]').not('#btn_logout').prop('disabled', false);
    };

    self.autosave = function() {
        // Save everything before changing window
        if (self.hasLocalStorage) {
            self.updateHier();
            window.localStorage.setItem('_autosave', self.data.dump());
        }
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

    self.loadAutosave = function() {
        if (self.hasLocalStorage) {
            // Check if there is anything to load
            const toLoad = window.localStorage.getItem('_autosave');
            if (toLoad && toLoad.length > 0) {
                window.localStorage.removeItem('_autosave');
                console.log('Reloading latest save.');
                self.data.load(toLoad);
                self._postLoadSync();
            }
        }
    };

    self._setupLogoutButton = function() {
        $('#btn_logout').click(function() {
            self.dropbox.authTokenRevoke();
            self.autosave();
            if (self.hasLocalStorage) {
                window.localStorage.removeItem('access_token');
            }
            // Clear access token parms
            window.location.hash = '';
            window.location.reload(true);
        });
    };

    self._setupAutosave = function() {
        if (self.hasLocalStorage) {
            $(window).bind('unload', function() {
                self.autosave();
            });
        }
        const autosaveInterval = 1000 * 60;
        setInterval(function() { self.autosave(); }, autosaveInterval);
    };

    self._setupDlButton = function() {
        self._saveModal.on('show.bs.modal', function () {
            self.updateHier();
            self._saveModal.find('a.btn[download]')
                .attr('href', 'data:application/json;charset=utf-8,' +
                    encodeURIComponent(self.data.dump()));
        });
        self._saveModal.find('a.btn[download]').click(function() {
            self.autosave();
        });
    }

    self._setupSaveModal = function() {
        const saveForm = self._saveModal.find('form');
        const fileNameInput = saveForm.find('input');

        // Setup dropbox explorer
        self._saveExplorer = new Explorer(
            self.dropbox,
            self._saveModal.find('.dropbox-explorer'),
            function(evt) {
                // Change the control value
                evt.preventDefault();
                evt.stopPropagation();
                fileNameInput.val($(this).attr('data-file')).change();
            },
            function(tag, name) {
                // Only folders and json files
                return tag == 'folder' || name.endsWith('.json');
            }
        );

        // Make sure that on submit, we intercept the event and call the propert function
        saveForm.on('submit', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            if (saveForm[0].checkValidity() === true) {
                self._saveModal.modal('hide');
                self.toggleWaiting(true);

                const path = combine(self._saveExplorer.pwd(), fileNameInput.val(), true);
                self.saveDB(path, function(res) { self.toggleWaiting(false, res); });

                // Manually copy the path on the load dialog
                self._loadExplorer.chdir(self._saveExplorer.pwd(), false);
            }
            saveForm.addClass('was-validated');
        });

        // Make sure that the proposed name for download is something sensitive
        fileNameInput.change(function() {
            self._saveModal.find('a[download]').attr('download', fileNameInput.val());
        });

        // When we open the modal, update everything that is needed
        self._saveModal.on('show.bs.modal', function () {
            saveForm.removeClass('was-validated');
            self._saveExplorer.refresh();
        });
    };

    self._setupLoadModal = function() {
        // Setup dropbox explorer
        self._loadExplorer = new Explorer(
            self.dropbox,
            self._loadModal.find('.dropbox-explorer'),
            function(evt) {
                // Change the control value
                evt.preventDefault();
                evt.stopPropagation();
                self._loadModal.modal('hide');
                self.toggleWaiting(true);
                const file = $(this).attr('data-file');
                const path = combine(self._loadExplorer.pwd(), file, true);
                self.loadDB(path, function(res) { self.toggleWaiting(false, res); });
                // Manually copy the path on the save dialog
                self._saveExplorer.chdir(self._loadExplorer.pwd(), false);
                // And also suggest the name
                self._saveModal.find('input').val(file).change();
            },
            function(tag, name) {
                // Only folders and json files
                return tag == 'folder' || name.endsWith('.json');
            }
        );

        self._loadModal.on('show.bs.modal', function () {
            self._loadExplorer.refresh();
        });
    };

    self._setupAnimatedChevrons = function() {
        // Find all the chevron buttons
        const matches = $('div.card div.card-header button.close i.fas');
        for (let i = 0; i < matches.length; i++) {
            const match = $(matches[i]);
            const button = match.parents('button');
            const card = button.parents('div.card');
            card.on('hide.bs.collapse', function() {
                button.prop('disabled', true);
                match.animateRotate(180, {
                    complete: function() {
                        button.prop('disabled', false);
                        match.css('transform', '')
                            .removeClass('fa-chevron-circle-up')
                            .addClass('fa-chevron-circle-down');
                    }
                });
            });
            card.on('show.bs.collapse', function() {
                button.prop('disabled', true);
                match.animateRotate(180, {
                    complete: function() {
                        button.prop('disabled', false);
                        match.css('transform', '')
                            .removeClass('fa-chevron-circle-down')
                            .addClass('fa-chevron-circle-up');
                    }
                });
            });
        }
    };

    self._setupWaitingModal = function() {
        self._modalWaiting = $('#waiting');

        self._modalWaiting.on('hidden.bs.modal', function () {
            // Reset the content
            const dialog = self._modalWaiting.find('div.modal-dialog');
            dialog.empty();
            $('<i class="fas fa-spinner fa-pulse fa-5x"></i>').appendTo(dialog);
        });
    };

    self._inverseResolveArg = function(obj) {
        obj = $(obj);
        const absFilter = '[data-dd-formula~="/' + obj.attr('data-dd-path') + '"]';
        const relFilter = '[data-dd-formula~="./' + obj.attr('data-dd-id') + '"]';
        return self._allControls($, absFilter).add(self.findSiblings(obj, relFilter));
    };

    self._resolveArg = function(obj, arg) {
        if (arg == '') {
            return null;
        }
        obj = $(obj);
        if (arg[0] == '/') {
            // Absolute path
            return self.findByPath(arg.substring(1));
        } else if (arg.substring(0, 2) == './') {
            return self.findNext(self.findParent(obj), arg.substring(2));
        } else {
            // Try number
            const num = Number(arg);
            if (num != num) {
                return arg;
            }
            return num;
        }
    };

    self._formulaGetCtrls = function(obj) {
        obj = $(obj);
        const args = obj.attr('data-dd-formula').split(' ');
        const ctrls = [];
        for (let i = 1; i < args.length; i++) {
            const arg = self._resolveArg(obj, args[i]);
            if (typeof arg === 'object' && arg != null) {
                ctrls.push(arg);
            }
        }
        return ctrls;
    };

    self._formulaEvaluateArgs = function(obj) {
        obj = $(obj);
        const isNull = function(v) {
            return typeof v === 'undefined' || (typeof v === 'object' && (v == null || v.length == 0));
        };
        const args = obj.attr('data-dd-formula').split(' ');
        for (let i = 1; i < args.length; i++) {
            args[i] = self._resolveArg(obj, args[i]);
            if (typeof args[i] === 'object' && args[i] != null && args[i].length > 0) {
                args[i] = args[i].ddFormulaVal();
            }
            if (isNull(args[i])) {
                return null;
            }
        }
        return args;
    };

    self._evalFormula = function(obj) {
        const ensureNumbers = function(the_args) {
            for (let i = 0; i < the_args.length; i++) {
                if (typeof the_args[i] !== 'number') {
                    return false;
                }
            }
            return true;
        };
        obj = $(obj);
        const args = self._formulaEvaluateArgs(obj, false, true, false);
        if (args == null || args.length == 0) {
            return null;
        }
        // All arguments are defined and numerical
        switch (args.shift()) {
            case 'sum':
                if (!ensureNumbers(args)) {
                    return null;
                }
                return args.reduce((a, b) => a + b, 0);
                break;
            case 'select_mod':
                if (args.length < 1) {
                    return null;
                }
                const requestedMod = args.shift();
                const fieldNames = obj.attr('data-dd-formula').split(' ').slice(2);
                const idxOfMod = indexOfMod(requestedMod, fieldNames);
                if (idxOfMod != null) {
                    return args[idxOfMod];
                }
                return null;
                break;
            case 'mod':
                if (!ensureNumbers(args)) {
                    return null;
                }
                const div = args.shift();
                return Math.floor(args.reduce((a, b) => a + b, 0) / div);
                break;
            case 'ref':
                return args[0];
                break;
            default:
                return null;
                break;
        }
    };

    self.refreshFormulas = function(onlyVoids=true) {
        const oldActive = self.formulasActive;
        self.formulasActive = false;
        timeIt('Recomputing ' + (onlyVoids ? 'void' : 'all') + ' formulas manually', function() {
            let level = 0;
            timeIt('Partitioning dependency graph into levels', function() {
                let levelSet = $('.dd-formula-arg:not([data-dd-formula])');
                while (levelSet.length > 0) {
                    const newLevelSet = [];
                    if (level > 10) {
                        console.log('Maximum formula depth of ' + level.toString() + ' reached!');
                        for (let i = 0; i < levelSet.length; i++) {
                            console.log((i + 1).toString() + '. ' + $(levelSet[i]).attr('data-dd-path'));
                        }
                        break;
                    }
                    for (let i = 0; i < levelSet.length; i++) {
                        const obj = $(levelSet[i]);
                        if (!onlyVoids || obj.ddIsVoid()) {
                            obj.attr('data-dd-depth', level);
                            newLevelSet.push(...self._inverseResolveArg(obj));
                        }
                    }
                    ++level;
                    levelSet = newLevelSet;
                }
            });
            timeIt('Recomputing each level', function() {
                for (let i = 1; i < level; ++i) {
                    const matches = $('[data-dd-depth="' + i.toString() + '"]');
                    for (let j = 0; j < matches.length; j++) {
                        const match = $(matches[j]);
                        match.ddSetDefault(self._evalFormula(match));
                    }
                }
                $('[data-dd-depth]').removeAttr('data-dd-depth');
            });
        });
        self.formulasActive = oldActive;
    };

    self._setupFormulas = function(parent) {
        const ctrls = self._allControls(parent);
        const ctrlsWithFormula = ctrls.filter('[data-dd-formula]');
        for (let i = 0; i < ctrlsWithFormula.length; i++) {
            // Mark all the arguments
            const argCtrls = self._formulaGetCtrls($(ctrlsWithFormula[i]), true, false, true);
            for (let j = 0; j < argCtrls.length; j++) {
                $(argCtrls[j]).addClass('dd-formula-arg');
            }
        }
        const recomputeAndPropagate = function(ctrl) {
            timeIt('Recomputing ' + ctrl.attr('data-dd-path'), function() {
                // Does this control need to reevaluate its formula?
                if (ctrl.ddIsVoid() && ctrl.attr('data-dd-formula')) {
                    ctrl.ddSetDefault(self._evalFormula(ctrl));
                }
                const matches = self._inverseResolveArg(ctrl);
                for (let i = 0; i < matches.length; i++) {
                    const match = $(matches[i]);
                    if (match.ddIsVoid()) {
                        // Do not use the event system to save churn an memory
                        recomputeAndPropagate(match);
                    }
                }
            });
        };

        ctrls.filter('.dd-formula-arg').change(function(e) {
            if ($(this).attr('data-dd-id') == 'chiave') {
                console.log('Triggered!! ' + $(this).attr('data-dd-path'));
            }
            if (self.formulasActive) {
                recomputeAndPropagate($(this));
            }
        });
    };

    self._setupDynamicTitles = function() {
        const matches = $('[data-dd-id][data-dd-array="master"]');
        for (let i = 0; i < matches.length; i++) {
            const match = $(matches[i]);
            const input = match.find('input.dd-dyn-title')
                .filter(firstLevFilter(match));
            if (input.length == 0) {
                return;
            }
            // Ok, set up an event on this container
            const container = match.closest('[data-dd-array="container"]');
            container.on('ddarray.insertion', function(evt, inserted_item) {
                const itemInput = inserted_item.find('input.dd-dyn-title')
                    .filter(firstLevFilter(inserted_item));
                itemInput.change(function() {
                    const newTitle = $(this).val().trim();
                    // Bubble an event up!!
                    container.trigger('ddarray.title', [inserted_item, newTitle]);
                });
            });
        }
        const originalTitle = document.title;
        $('#dd-page-title[data-dd-id]').change(function () {
            const val = $(this).val();
            if (val.length > 0) {
                document.title = val + ' - ' + originalTitle;
            } else {
                document.title = originalTitle;
            }
        });
    };


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


    self._setupAttackTOC = function() {
        const tocSm = $('#toc_attacchi_sm').data('ddArrayController');
        const tocMd = $('#toc_attacchi_md').data('ddArrayController');
        $('#array_attacchi')
            .on('ddarray.title', function(evt, item, title) {
                evt.stopPropagation();
                if (title.length == 0) {
                    title = 'Attacco';
                }
                item.find('span.dd-dyn-title').text(title);
                // Update the tocs too
                const idx = Number.parseInt(item.attr('data-dd-index'));
                tocSm.get(idx).find('a').text(title);
                tocMd.get(idx).find('a').text(title);
            })
            .on('ddarray.insertion', function(evt, item) {
                evt.stopPropagation();
                const idx = Number.parseInt(item.attr('data-dd-index'));
                item.find('.hidden-anchor').attr('id', 'att_' + idx.toString());
                tocSm.append().find('a').attr('href', '#att_' + idx.toString());
                tocMd.append().find('a').attr('href', '#att_' + idx.toString());
            })
            .on('ddarray.removal', function(evt, item) {
                evt.stopPropagation();
                const idx = Number.parseInt(item.attr('data-dd-index'));
                tocSm.remove(tocSm.get(idx));
                tocMd.remove(tocMd.get(idx));
            })
            .on('ddarray.reindex', function(evt, item, prev_idx, new_idx) {
                evt.stopPropagation();
                item.find('.hidden-anchor').attr('id', 'att_' + new_idx.toString());
            });
        const onReindex = function(evt, item, prev_idx, new_idx) {
            evt.stopPropagation();
            item.find('a').attr('href', '#att_' + new_idx.toString());
        };
        tocSm.container.on('ddarray.reindex', onReindex);
        tocMd.container.on('ddarray.reindex', onReindex);
    };

    self._setupCustomDropdown = function() {
        $('.input-group-prepend .dropdown-menu .dropdown-item').click(function(evt) {
            evt.preventDefault();
            const obj = $(this);
            obj.closest('.input-group-prepend')
                .find('input[type="text"]')
                .val(obj.text())
                .change();
        });
        $('.input-group-append .dropdown-menu .dropdown-item').click(function(evt) {
            evt.preventDefault();
            const obj = $(this);
            obj.closest('.input-group-append')
                .find('input[type="text"]')
                .val(obj.text())
                .change();
        });
    };

    self._setupArrays = function() {
        initDDArrays({
            insertion: function(evt, item) { self._setupDDPaths(item); self._setupFormulas(item); },
            reindex: function(evt, item, old_idx, new_idx) { self._setupDDPaths(item); }
        });
    }

    self._resizeAllFormArrays = function() {
        timeIt('Resizing arrays', function() {
            const arraySizes = self.data.getArraySizes();
            arraySizes.sort(function (a, b) { return a[0].localeCompare(b[0]); });
            for (let i = 0; i < arraySizes.length; ++i) {
                const arrayPath = arraySizes[i][0];
                const arraySize = arraySizes[i][1];
                // Is this a dynamic array?
                const arrayMaster = self.findArrayMaster(arrayPath);
                if (arrayMaster != null && arrayMaster.length > 0) {
                    // Arr points at the master
                    arrayMaster.closest('[data-dd-array="container"]')
                        .data('ddArrayController')
                        .resize(arraySize);
                }
            }
        });
    }

    self._truncateAllHierArrays = function() {
        const matches = $('[data-dd-id][data-dd-array="master"]');
        for (let i = 0; i < matches.length; i++) {
            const match = $(matches[i]);
            const nChildren = match.siblings('[data-dd-array="item"]').length;
            const path = self._getHierPath(match);
            const item = self.data.get(path);
            if (item) {
                item.length = nChildren;
            } else {
                self.data.set(path, []);
            }
        }
    }

    self.findNext = function(parent, dd_id) {
        return $(parent).find('[data-dd-id="' + dd_id +'"]').filter(function (idx, obj) {
            return $(obj).parentsUntil(parent, '[data-dd-id]').length == 0;
        });
    };

    self.findChildren = function(parent, extraFilter='') {
        parent = $(parent);
        return parent.find('[data-dd-id]' + extraFilter).filter(function (idx, obj) {
            // Make sure there is nothing in the middle
            return $(obj).parentsUntil(parent, '[data-dd-id]').length == 0;
        });
    };

    self.findSiblings = function(obj, extraFilter='') {
        return self.findChildren(self.findParent(obj), extraFilter).not(obj);
    };

    self.findParent = function(obj) {
        const parents = $(obj).parents('[data-dd-id], [data-dd-index]');
        if (parents.length == 0) {
            return $;
        } else {
            return $(parents[0]);
        }
    };

    self.findByPath = function (path) {
        return $('[data-dd-path="' + path + '"]');
    }

    self.findArrayMaster = function (path) {
        // Remove the last path components
        const pieces = path.split('.');
        const lastComp = pieces.pop();
        let parent = $;
        if (pieces.length > 0) {
            parent = self.findByPath(pieces.join('.'));
        }
        return self.findNext(parent, lastComp).filter('[data-dd-array="master"]');
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
        self.dropbox.filesUpload({
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
        self.dropbox.filesDownload({path: path})
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
