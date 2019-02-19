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

var _timeItCnt = 0;

function timeIt(desc, body) {
    let start = performance.now();
    _timeItCnt++;
    console.log('>'.repeat(_timeItCnt) + ' ' + desc + '...');
    body();
    let end = performance.now();
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
    var cast = parseInt(rawVal);
    if (cast != cast) {
        // Nan, casting failed.
        return passthrough ? rawVal : null;
    }
    return cast;
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
        let val = $(this).val();
        // Note: val == 0 is a non-void value.
        return typeof val === 'undefined' || val == null || val.trim() == '';
    },
    ddSetDefault: function(arg) {
        let obj = $(this);
        let oldPlaceholder = obj.attr('placeholder');
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
        let obj = $(this);
        let isCheckbox = (obj.attr('type') === 'checkbox');
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
                let label = obj.closest('.btn-custom-checkbox');
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
                obj.val(arg.toString());
            }
        }
    },
    ddFormulaVal: function (arg) {
        let obj = $(this);
        // If the object has no val, return a placeholder
        var rawVal = obj.val()
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
    var self = this;

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
        var path = obj.attr('data-dd-id');
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

    self._allControls = function() {
        return $('input[data-dd-path], select[data-dd-path], textarea[data-dd-path]');
    };

    self._setupDDPaths = function(objs=$('body')) {
        $(objs).find('input[data-dd-id], select[data-dd-id], textarea[data-dd-id]')
            .not('[data-dd-array="master"] *')
            .each(function (idx, obj) {
                $(obj).attr('data-dd-path', self._getHierPath(obj));
            });
    };

    self._initLocalStorage = function () {
        self.hasLocalStorage = storageAvailable('localStorage');
        if (self.hasLocalStorage) {
            // Did we already open this?
            if (window.localStorage.getItem('acknowledge_cookies') == null) {
                // No.
                var $alert = $('<a href="#" class="alert-link" data-target="#cookie_explain" data-toggle="modal"></a>');
                self.notify('warning', $alert);
                $alert.text('per cosa')
                    .before('Questa pagina usa il local storage (vedi ')
                    .after('). Disattiva i cookie per questa pagina se non lo desideri.');
                $alert.parents('.alert').on('closed.bs.alert', function() {
                    window.localStorage.setItem('acknowledge_cookies', true);
                });
            }
        } else {
            // Toggle the warning in the save dialog
            $('#no_local_storage_warning').removeClass('d-none');
            // Print a warning with the limitations
            var $alert = $('<a href="#" class="alert-link" data-target="#cookie_explain" data-toggle="modal"></a>')
            self.notify('warning', $alert);
            $alert.text('usare superscheda senza cookies')
                .before('Il local storage è disabilitato; hai disattivato i cookie? Vedi quali limitazioni ci sono ad ')
                .after('.');
        }
    }

    self._retrieveAccessToken = function() {
        // Try to get the access token from the local storage
        var access_token = null;
        var app_id = null;
        if (self.hasLocalStorage) {
            // Use the app id for versioning; forget the token if needed
            access_token = window.localStorage.getItem('access_token');
            app_id = window.localStorage.getItem('app_id');
        }
        if (!access_token || app_id != self.appId) {
            access_token = null;
            var parms = parseQueryString();
            if ('access_token' in parms) {
                access_token = parms['access_token'];
            }
        }
        if (access_token) {
            self.dropbox = new Dropbox.Dropbox({accessToken: access_token});
            // Test if this dropbox works
            self.dropbox.usersGetCurrentAccount()
                .then(function() { self._setHasDropbox(true); })
                .catch(function() { self._setHasDropbox(false); });
        } else {
            self._setHasDropbox(false);
        }
    };

    self._setHasDropbox = function(has_dbx) {
        if (has_dbx) {
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
            var url = null;
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
            var to_load = window.localStorage.getItem('_autosave');
            if (to_load && to_load.length > 0) {
                window.localStorage.removeItem('_autosave');
                console.log('Reloading latest save.');
                self.data.load(to_load);
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
        var autosave_interval = 1000 * 60;
        setInterval(function() { self.autosave(); }, autosave_interval);
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
        var save_form = self._saveModal.find('form');
        var file_name_input = save_form.find('input');

        // Setup dropbox explorer
        self._saveExplorer = new Explorer(
            self.dropbox,
            self._saveModal.find('.dropbox-explorer'),
            function(evt) {
                // Change the control value
                evt.preventDefault();
                evt.stopPropagation();
                file_name_input.val($(this).attr('data-file')).change();
            },
            function(tag, name) {
                // Only folders and json files
                return tag == 'folder' || name.endsWith('.json');
            }
        );

        // Make sure that on submit, we intercept the event and call the propert function
        save_form.on('submit', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            if (save_form[0].checkValidity() === true) {
                self._saveModal.modal('hide');
                self.toggleWaiting(true);

                var path = combine(self._saveExplorer.pwd(), file_name_input.val(), true);
                self.saveDB(path, function(res) { self.toggleWaiting(false, res); });

                // Manually copy the path on the load dialog
                self._loadExplorer.chdir(self._saveExplorer.pwd(), false);
            }
            save_form.addClass('was-validated');
        });

        // Make sure that the proposed name for download is something sensitive
        file_name_input.change(function() {
            self._saveModal.find('a[download]').attr('download', file_name_input.val());
        });

        // When we open the modal, update everything that is needed
        self._saveModal.on('show.bs.modal', function () {
            save_form.removeClass('was-validated');
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
                var file = $(this).attr('data-file');
                var path = combine(self._loadExplorer.pwd(), file, true);
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
        $('div.card div.card-header button.close i.fas').each(function (idx, obj) {
            var i = $(obj);
            var button = i.parents('button');
            var card = button.parents('div.card');
            card.on('hide.bs.collapse', function() {
                button.prop('disabled', true);
                i.animateRotate(180, {
                    complete: function() {
                        button.prop('disabled', false);
                        i.css('transform', '')
                            .removeClass('fa-chevron-circle-up')
                            .addClass('fa-chevron-circle-down');
                    }
                });
            });
            card.on('show.bs.collapse', function() {
                button.prop('disabled', true);
                i.animateRotate(180, {
                    complete: function() {
                        button.prop('disabled', false);
                        i.css('transform', '')
                            .removeClass('fa-chevron-circle-down')
                            .addClass('fa-chevron-circle-up');
                    }
                });
            });
        });
    };

    self._setupWaitingModal = function() {
        self._modalWaiting = $('#waiting');

        self._modalWaiting.on('hidden.bs.modal', function () {
            // Reset the content
            var dialog = self._modalWaiting.find('div.modal-dialog');
            dialog.empty();
            $('<i class="fas fa-spinner fa-pulse fa-5x"></i>').appendTo(dialog);
        });
    };

    self._inverseResolveArg = function(obj) {
        obj = $(obj);
        return self._allControls()
            .filter('[data-dd-formula~="/' + obj.attr('data-dd-path') + '"]')
            .add(self.findSiblings(obj)
                .filter('[data-dd-formula~="./' + obj.attr('data-dd-id') + '"]'));
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
            let num = Number(arg);
            if (num != num) {
                return arg;
            }
            return num;
        }
    };

    self._evalFormula = function(obj) {
        let ensure_numbers = function(the_args) {
            for (var i = 0; i < the_args.length; i++) {
                if (typeof the_args[i] !== 'number') {
                    return false;
                }
            }
            return true;
        };
        obj = $(obj);
        let args = obj.data('ddPredecessors');
        let argValues = [];
        for (var i = 0; i < args.length; i++) {
            if (typeof args[i] === 'object') {
                if (args[i] == null || args[i].length == 0) {
                    // Nope, we cannot evaluate this function
                    return null;
                }
                // Replace with actual value
                argValues[i] = args[i].ddFormulaVal();
            } else {
                argValues[i] = args[i];
            }
        }
        // All arguments are defined and numerical
        switch (argValues.shift()) {
            case 'sum':
                if (!ensure_numbers(argValues)) {
                    return null;
                }
                return argValues.reduce((a, b) => a + b, 0);
                break;
            case 'mod':
                if (!ensure_numbers(argValues)) {
                    return null;
                }
                let div = argValues.shift();
                return Math.floor(argValues.reduce((a, b) => a + b, 0) / div);
                break;
            case 'ref':
                return argValues[0];
                break;
            default:
                return null;
                break;
        }
    };

    self.refreshFormulas = function(onlyVoids=true) {
        let oldActive = self.formulasActive;
        self.formulasActive = false;
        timeIt('Recomputing formulas manually', function() {
            let level = 0;
            let levelSet = $();
            do {
                levelSet.each(function(idx, obj) {
                    obj = $(obj)
                     if (obj.attr('data-dd-formula') && (obj.ddIsVoid() || !onlyVoids)) {
                        obj.ddSetDefault(self._evalFormula(obj));
                    }
                });
                // ----
                ++level;
                levelSet = $('[data-dd-depth="' + level.toString() + '"]');
            } while (levelSet.length > 0);
        });
        self.formulasActive = oldActive;
    };

    self._rebuildDepGraph = function() {
        timeIt('Rebuilding dep graph', function() {
            let levelSet = $();

            timeIt('Clearing dep graph', function() {
                // Clear all the deps. Mark as outdated
                $('[data-dd-depth]').removeAttr('data-dd-depth').data('ddSuccessorsOutdated', true);
            });

            timeIt('Building adjacency lists', function() {
                // Loop and rebuild the dependency graph. Collect level 0
                self._allControls().filter('[data-dd-formula]').each(function (idx, obj) {
                    obj = $(obj);
                    let args = obj.attr('data-dd-formula').split(' ');
                    for (let i = 1; i < args.length; i++) {
                        args[i] = self._resolveArg(obj, args[i]);
                        if (typeof args[i] !== 'object' || args[i] == null || args[i].length == 0) {
                            continue;
                        }
                        // Register to the list of dependants
                        let dependants = args[i].data('ddSuccessors');
                        if (!dependants || args[i].data('ddSuccessorsOutdated')) {
                            args[i].data('ddSuccessorsOutdated', false);
                            args[i].data('ddSuccessors', obj);
                        } else {
                            args[i].data('ddSuccessors', dependants.add(obj));
                        }
                        if (!args[i].attr('data-dd-formula')) {
                            levelSet = levelSet.add(args[i]);
                        }
                    }
                    obj.data('ddPredecessors', args);
                });
            });

            timeIt('Traversing dep graph', function() {
                // Assign the level and heuristically detect loops
                let level = 0;
                while (levelSet.length > 0) {
                    let newLevelSet = $();
                    if (level > 10) {
                        console.log('Maximum formula depth of ' + level.toString() + ' reached!');
                        levelSet.each(function(idx, obj) {
                            console.log((idx + 1).toString() + '. ' + $(obj).attr('data-dd-path'));
                        });
                        break;
                    }
                    levelSet
                        .attr('data-dd-depth', level)
                        .each(function (idx, obj) {
                            let dependants = $(obj).data('ddSuccessors');
                            if (dependants) {
                                newLevelSet = newLevelSet.add(dependants);
                            }
                        });
                    ++level;
                    levelSet = newLevelSet;
                }
            });
        });
    };

    self._setupFormulas = function() {
        self._rebuildDepGraph();
        let recomputeAndPropagate = function(ctrl) {
            console.log('Updating ' + ctrl.attr('data-dd-path'));
            // Does this control need to reevaluate its formula?
            if (ctrl.ddIsVoid() && ctrl.attr('data-dd-formula')) {
                ctrl.ddSetDefault(self._evalFormula(ctrl));
            }
            let dependants = ctrl.data('ddSuccessors');
            if (dependants) {
                dependants.each(function (idx, depCtrl) {
                    depCtrl = $(depCtrl);
                    if (depCtrl.ddIsVoid()) {
                        // Do not use the event system to save churn an memory
                        recomputeAndPropagate(depCtrl);
                    }
                });
            }
        };
        $('[data-dd-depth]').change(function(e) {
            if (self.formulasActive) {
                recomputeAndPropagate($(this));
            }
        });
    };

    self._setupDynamicTitles = function() {
        $('[data-dd-id][data-dd-array="master"]').each(function(idx, master) {
            master = $(master);
            var input = master.find('input.dd-dyn-title')
                .filter(firstLevFilter(master));
            if (input.length == 0) {
                return;
            }
            // Ok, set up an event on this container
            var container = master.closest('[data-dd-array="container"]');
            container.on('ddarray.insertion', function(evt, inserted_item) {
                var item_input = inserted_item.find('input.dd-dyn-title')
                    .filter(firstLevFilter(inserted_item));
                item_input.change(function() {
                    var new_title = $(this).val().trim();
                    // Bubble an event up!!
                    container.trigger('ddarray.title', [inserted_item, new_title]);
                });
            });
        });
        var originalTitle = document.title;
        $('#dd-page-title[data-dd-id]').change(function () {
            var val = $(this).val();
            if (val.length > 0) {
                document.title = val + ' - ' + originalTitle;
            } else {
                document.title = originalTitle;
            }
        });
    };


    self.autosort = function(array) {
        var compare = function(x, y) {
          return $(x).find('.dd-sort-key[data-dd-id]').val().localeCompare(
            $(y).find('.dd-sort-key[data-dd-id]').val()
          );
        };
        $(array).data('ddArrayController').sort(compare);
    };

    self._setupAutosort = function() {
        $('.dd-autosort[data-dd-id]').each(function(idx, obj) {
            obj = $(obj);
            var container = $(obj).closest('[data-dd-array="container"]');
            obj.blur(function(evt) {
                self.autosort(container);
            });
        });
    };


    self._setupAttackTOC = function() {
        var toc_sm = $('#toc_attacchi_sm').data('ddArrayController');
        var toc_md = $('#toc_attacchi_md').data('ddArrayController');
        $('#array_attacchi')
            .on('ddarray.title', function(evt, item, title) {
                evt.stopPropagation();
                if (title.length == 0) {
                    title = 'Attacco';
                }
                item.find('span.dd-dyn-title').text(title);
                // Update the tocs too
                var idx = Number.parseInt(item.attr('data-dd-index'));
                toc_sm.get(idx).find('a').text(title);
                toc_md.get(idx).find('a').text(title);
            })
            .on('ddarray.insertion', function(evt, item) {
                evt.stopPropagation();
                var idx = Number.parseInt(item.attr('data-dd-index'));
                item.find('.hidden-anchor').attr('id', 'att_' + idx.toString());
                toc_sm.append().find('a').attr('href', '#att_' + idx.toString());
                toc_md.append().find('a').attr('href', '#att_' + idx.toString());
            })
            .on('ddarray.removal', function(evt, item) {
                evt.stopPropagation();
                var idx = Number.parseInt(item.attr('data-dd-index'));
                toc_sm.remove(toc_sm.get(idx));
                toc_md.remove(toc_md.get(idx));
            })
            .on('ddarray.reindex', function(evt, item, prev_idx, new_idx) {
                evt.stopPropagation();
                item.find('.hidden-anchor').attr('id', 'att_' + new_idx.toString());
            });
        var on_reindex = function(evt, item, prev_idx, new_idx) {
            evt.stopPropagation();
            item.find('a').attr('href', '#att_' + new_idx.toString());
        };
        toc_sm.container.on('ddarray.reindex', on_reindex);
        toc_md.container.on('ddarray.reindex', on_reindex);
    };

    self._setupCustomDropdown = function() {
        $('.input-group-prepend .dropdown-menu .dropdown-item').click(function(evt) {
            evt.preventDefault();
            var obj = $(this);
            obj.closest('.input-group-prepend')
                .find('input[type="text"]')
                .val(obj.text());
        });
        $('.input-group-append .dropdown-menu .dropdown-item').click(function(evt) {
            evt.preventDefault();
            var obj = $(this);
            obj.closest('.input-group-append')
                .find('input[type="text"]')
                .val(obj.text());
        });
    };

    self._setupArrays = function() {
        initDDArrays({
            insertion: function(evt, item) { self._setupDDPaths(item); },
            reindex: function(evt, item, old_idx, new_idx) { self._setupDDPaths(item); }
        });
    }

    self._resizeAllFormArrays = function() {
        timeIt('Resizing arrays', function() {
            var array_sizes = self.data.getArraySizes();
            array_sizes.sort(function (a, b) { return a[0].localeCompare(b[0]); });
            for (var i = 0; i < array_sizes.length; ++i) {
                var array_path = array_sizes[i][0];
                var array_size = array_sizes[i][1];
                // Is this a dynamic array?
                var arr = self.find(array_path + '[-1]');
                if (arr != null && arr.length > 0) {
                    // Arr points at the master
                    arr.closest('[data-dd-array="container"]')
                       .data('ddArrayController')
                       .resize(array_size);
                }
            }
        });
    }

    self._truncateAllHierArrays = function() {
        $('[data-dd-id][data-dd-array="master"]').each(function (idx, obj) {
            var n_children = $(obj).siblings('[data-dd-array="item"]').length;
            var path = self._getHierPath(obj);
            var item = self.data.get(path);
            if (item) {
                item.length = n_children;
            } else {
                self.data.set(path, []);
            }
        });
    }

    self.findNext = function(parent, dd_id) {
        return $(parent).find('[data-dd-id="' + dd_id +'"]').filter(function (idx, obj) {
            return $(obj).parentsUntil($(parent)).filter('[data-dd-id]').length == 0;
        });
    };

    self.findChildren = function(parent) {
        parent = $(parent);
        return parent.find('[data-dd-id]').filter(function (idx, obj) {
            // Make sure there is nothing in the middle
            return $(obj).parentsUntil(parent).filter('[data-dd-id]').length == 0;
        });
    };

    self.findSiblings = function(obj) {
        return self.findChildren(self.findParent(obj)).not(obj);
    };

    self.findParent = function(obj) {
        var parents = $(obj).parents('[data-dd-id], [data-dd-index]');
        if (parents.length == 0) {
            return $;
        } else {
            return $(parents[0]);
        }
    };

    self.findByPath = function (path) {
        return $('[data-dd-path="' + path + '"');
    }

    self.find = function (path) {
        path = self.data.parsePath(path);
        obj = $('body');
        for (var i = 0; i < path.length; ++i) {
            if (i < path.length - 1 && typeof path[i + 1] === 'number') {
                // Search first by full name
                var candidate = self.findNext(obj, path[i] + '[' + path[i + 1].toString() +']');
                if (candidate.length == 0) {
                    // Search by id and index. If the index is -1, the master node is meant
                    candidate = self.findNext(obj, path[i]);
                    if (path[i + 1] < 0) {
                        candidate = candidate.filter('[data-dd-array="master"]');
                    } else {
                        candidate = candidate.filter('[data-dd-index="' + path[i+ 1].toString() + '"]');
                    }
                }
                // Advance also i by 1
                ++i;
                obj = candidate;
            } else {
                // Just look up the nextitem
                obj = self.findNext(obj, path[i]);
            }
            if (obj.length == 0) {
                return null;
            }
        }
        return obj;
    };


    self.notify = function(cls, text, auto_dismiss=-1) {
        var $div = $('<div class="alert alert-dismissible sticky-top fade show" role="alert"></div>');
        var icon = null;
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
        $div.addClass('alert-' + cls);
        if (text instanceof jQuery) {
            text.appendTo($div);
        } else {
            $div.text(text);
        }
        $('<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>').appendTo($div);
        if (icon) {
            $('<i class="fas fa-pull-left fa-2x"></i>').addClass('fa-' + icon).prependTo($div);
        }
        $div.insertAfter('nav.navbar');
        if (auto_dismiss > 0) {
            setTimeout(function() {
                $div.alert('close');
            }, auto_dismiss);
        }
        return $div;
    };

    self._promptReady = function() {
        let modal = $('#loading_modal');
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
        self._allControls().each(function (idx, obj) {
            obj = $(obj);
            self.data.set(obj.attr('data-dd-path'), obj.ddVal());
        });
        self._truncateAllHierArrays();
    };

    self.updateForm = function() {
        self._resizeAllFormArrays();
        timeIt('Updating form', function() {
            let flat_data = self.data.flatten();
            self._allControls().each(function (idx, obj) {
                obj = $(obj);
                let val = flat_data[obj.attr('data-dd-path')];
                if (typeof val === 'undefined') {
                    val = null;
                }
                obj.ddVal(val);
                if (obj.is('.dd-dyn-title, [data-dd-depth], #dd-page-title')) {
                    // Trigger a change event because this manages a dynamic title.
                    obj.change();
                }
            });
        });
    };

    self.toggleWaiting = function(on_off, success=null) {
        if (on_off) {
            self._modalWaiting.modal('show');
        } else if (success === null) {
            self._modalWaiting.modal('hide');
        } else {
            var dialog = self._modalWaiting.find('div.modal-dialog');
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
                var blob = response.fileBlob;
                var reader = new FileReader();
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
    var args = $.speed(duration, easing, complete);
    var step = args.step;
    return this.each(function(i, e) {
        args.complete = $.proxy(args.complete, e);
        args.step = function(now) {
            $.style(e, 'transform', 'rotate(' + now + 'deg)');
            if (step) return step.apply(e, arguments);
        };

        $({deg: 0}).animate({deg: angle}, args);
    });
};

// https://stackoverflow.com/a/2880929/1749822
function parseQueryString() {
    var pl = /\+/g;  // Regex for replacing addition symbol with a space
    var search = /([^&=]+)=?([^&]*)/g;
    var decode = function (s) { return decodeURIComponent(s.replace(pl, ' ')); };
    var query = window.location.hash.substring(1);
    var match;
    var url_params = {};
    while (match = search.exec(query)) {
        url_params[decode(match[1])] = decode(match[2]);
    }
    return url_params;
}

function _find_duplicates() {
  var all_dd_paths = [];
  var duplicates = [];
  $('[data-dd-path]').each(function(idx, obj) {
    all_dd_paths.push($(obj).data('dd-path'));
  });
  all_dd_paths.sort();
  for (var i = 1; i < all_dd_paths.length; ++i) {
    if (all_dd_paths[i - 1] == all_dd_paths[i]) {
      if (duplicates.length == 0 || duplicates[duplicates.length - 1] != all_dd_paths[i]) {
        duplicates.push(all_dd_paths[i]);
      }
    }
  }
  if (duplicates.length == 0) {
    DD.notify('success',
      'There are ' + all_dd_paths.length.toString() + ' identified unique controls. No duplicates.');
  } else {
    $('<pre></pre>').text(duplicates.join('\n')).appendTo(
      DD.notify('danger',
      'There are ' + all_dd_paths.length.toString() + ' identified controls, ' + duplicates.length.toString() + ' of them are duplicated.')
    );
  }
}

// https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API

function storageAvailable(type) {
    try {
        var storage = window[type],
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
