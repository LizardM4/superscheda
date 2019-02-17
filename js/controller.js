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

function toIntegerField(num) {
    if (num == null) {
        return '';
    } else if (typeof num === 'number' && num > 0) {
        return '+' + num.toString();
    } else {
        return num.toString();
    }
}

function fromNaturalField(rawVal, passthrough) {
    if (typeof passthrough === 'undefined') {
        passthrough = false;
    }
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
        return passthrough ? rawVal : 0;
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
    ddVal: function(arg) {
        if ($(this).hasClass('dd-integer-field')) {
            if (typeof arg === 'undefined') {
                return fromIntegerField($(this).val(), true);
            } else {
                return $(this).val(toIntegerField(arg));
            }
        } else if ($(this).hasClass('dd-natural-field')) {
            if (typeof arg === 'undefined') {
                return fromNaturalField($(this).val(), true);
            } else {
                return $(this).val(toNaturalField(arg));
            }
        } else {
            if (typeof arg === 'undefined') {
                return $(this).val();
            } else {
                return $(this).val(arg);
            }
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

    self.loadAutosave = function() {
        if (self.hasLocalStorage) {
            // Check if there is anything to load
            var to_load = window.localStorage.getItem('_autosave');
            if (to_load && to_load.length > 0) {
                window.localStorage.removeItem('_autosave');
                self.data.load(to_load);
                self._applyPatchesIfNeeded();
                self.updateForm();
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
        $(array).data('dd-array-controller').sort(compare);
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
        var toc_sm = $('#toc_attacchi_sm').data('dd-array-controller');
        var toc_md = $('#toc_attacchi_md').data('dd-array-controller');
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
                   .data('dd-array-controller')
                   .resize(array_size);
            }
        }
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
            // Make sure there is nothing in the middle
            return $(obj).parentsUntil($(parent)).filter('[data-dd-id]').length == 0;
        });
    };

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
        self._setupAttackTOC();
        self._setupCustomDropdown();
        self._setupDlButton();
        self._setupLogoutButton();
        self._setupAutosave();
        self.loadAutosave();
    };

    self.updateHier = function() {
        self._allControls().each(function (idx, obj) {
            obj = $(obj);
            if (obj.attr('type') === 'checkbox') {
                self.data.set(obj.attr('data-dd-path'), obj.is(':checked'));
            } else {
                self.data.set(obj.attr('data-dd-path'), obj.ddVal());
            }
        });
        self._truncateAllHierArrays();
    };

    self.updateForm = function() {
        self._resizeAllFormArrays();
        var flat_data = self.data.flatten();
        var ctrls = self._allControls();
        for (var path in flat_data) {
            var ctrl = ctrls.filter('[data-dd-path="' + path + '"]');
            if (ctrl.attr('type') === 'checkbox') {
                ctrl.prop('checked', flat_data[path]);
                // Make sure to handle also custom checkboxes
                var label = ctrl.closest('.btn-custom-checkbox');
                if (label.length > 0) {
                    if (flat_data[path]) {
                        label.addClass('active');
                    } else {
                        label.removeClass('active');
                    }
                }
            } else {
                ctrl.ddVal(flat_data[path]);
                ctrl.change();
            }
            if (ctrl.is('.dd-dyn-title')) {
                // Trigger a change event because this manages a dynamic title.
                ctrl.change();
            }
        }
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

    self._applyPatchesIfNeeded = function() {
        if (window.DDver) {
            if (window.DDver.needsPatch(self.data)) {
                window.DDver.apply(self.data);
                console.log('Successfully updated to version ' + window.DDver.getLatestVersionString());
            } else {
                console.log('Up to date with version ' + window.DDver.getLatestVersionString());
            }
        }
    };

    self.loadRemote = function(name, post_action=null) {
        $.getJSON(name, function(json_data) {
            self.data.obj = json_data;
            self._applyPatchesIfNeeded();
            self.updateForm();
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
        self.dropbox.filesDownload({path: path})
            .then(function (response) {
                var blob = response.fileBlob;
                var reader = new FileReader();
                reader.addEventListener('loadend', function() {
                    self.data.load(reader.result);
                    self._applyPatchesIfNeeded();
                    self.updateForm();
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
