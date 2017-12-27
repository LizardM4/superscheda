// Superscheda
// Copyright (C) 2017  Pietro Saccardi
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

function Controller(dbxAppId) {
    var self = this;

    self.appId = dbxAppId;
    self.data = new Hier();
    self.dropbox = null;

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

    self._setupDropbox = function() {
        // Try to get the access token from the local storage
        var access_token = null;
        var app_id = null;
        try {
            var access_token = window.localStorage.getItem('access_token');
            // Use the app id for versioning; forget the token if needed
            var app_id = window.localStorage.getItem('app_id');
            if (!access_token || !app_id || app_id != self.appId) {
                access_token = null;
                app_id = null;
                var parms = parseQueryString();
                if ('access_token' in parms) {
                    access_token = parms['access_token'];
                    app_id = self.appId;
                    window.localStorage.setItem('access_token', access_token);
                    window.localStorage.setItem('app_id', app_id);
                }
            }
        } catch (e) {
            self.notify('warning', 'Il tuo browser non supporta (o ha disabilitato) ' +
                'il local storage. Senza di esso non è possibile salvare alcun ' +
                'dato in locale. In particolare, dovrai loggarti volta per volta ' +
                'su Dropbox.');
        }
        if (access_token) {
            self.dropbox = new Dropbox({accessToken: access_token});
            // Enable the open and save button
            $('*[data-target="#load_from"]').parent().removeClass('d-none');
            $('*[data-target="#save_to"]').parent().removeClass('d-none');
        } else {
            self.dropbox = new Dropbox({clientId: self.appId});
            // Enable the button for the authentication
            $('*[data-target="#auth_dbx"]').parent().removeClass('d-none');
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
            $('#auth_dbx a').attr('href', self.dropbox.getAuthenticationUrl(url));
            $(function() {
                $('#auth_dbx').modal('show');
            });
        }
    };

    self._setupSaveToModal = function() {
        self._modalSaveTo = $('#save_to');
        var save_to_list = self._modalSaveTo.find('.dropbox-explorer');
        var save_to_form = self._modalSaveTo.find('form');
        var save_to_file = save_to_form.find('input');
        var download_btt = self._modalSaveTo.find('a.btn[download]');

        save_to_form.on('submit', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (save_to_form[0].checkValidity() === true) {
                self._modalSaveTo.modal('hide');
                self.toggleWaiting(true);
                var full_file_path = self._navGetPath(save_to_list) + save_to_form.find('input').val();
                self.saveDB(full_file_path, function(res) { self.toggleWaiting(false, res); });
                // Manually copy the path on the load dialog
                self._modalLoadFrom
                    .find('.dropbox-explorer .dropbox-nav ol')
                    .attr('data-dirname', self._navGetPath(save_to_list));
            }
            save_to_form.addClass('was-validated');
        });

        save_to_file.change(function() {
            download_btt.attr('download', save_to_file.val());
        });

        self._modalSaveTo.on('show.bs.modal', function (event) {
            var event_fn = function(event2) {
                event2.preventDefault();
                event2.stopPropagation();
                save_to_file.val($(this).attr('data-name')).change();
            };
            save_to_form.removeClass('was-validated');
            self._navSetPath(save_to_list, self._navGetPath(save_to_list), event_fn);
            download_btt.attr('href', 'data:application/json;charset=utf-8,' +
                encodeURIComponent(self.data.dump()));
        });
    };

    self._setupAnimatedChevrons = function() {
        // Find all the chevron buttons
        $('div.card div.card-header button.close i.fa').each(function (idx, obj) {
            var i = $(obj);
            var button = i.parents('button');
            var card = button.parents('div.card');
            card.on('hide.bs.collapse', function(event) {
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
            card.on('show.bs.collapse', function(event) {
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

        self._modalWaiting.on('hidden.bs.modal', function (event) {
            // Reset the content
            var dialog = self._modalWaiting.find('div.modal-dialog');
            dialog.empty();
            $('<i class="fa fa-spinner fa-spin fa-5x"></i>').appendTo(dialog);
        });
    };


    self._setupLoadFromModal = function() {
        self._modalLoadFrom = $('#load_from');
        var load_from_list = self._modalLoadFrom.find('.dropbox-explorer');

        self._modalLoadFrom.on('show.bs.modal', function (event) {
            var event_fn = function(event2) {
                event2.preventDefault();
                event2.stopPropagation();
                self._modalLoadFrom.modal('hide');
                self.toggleWaiting(true);
                var full_file_path = self._navGetPath(load_from_list) + $(this).attr('data-name');
                self.loadDB(full_file_path, function(res) { self.toggleWaiting(false, res); });
                // Manually copy the path on the save dialog
                self._modalSaveTo
                    .find('.dropbox-explorer .dropbox-nav ol')
                    .attr('data-dirname', self._navGetPath(load_from_list));
                self._modalSaveTo.find('input').val($(this).attr('data-name')).change();
            };
            self._navSetPath(load_from_list, self._navGetPath(load_from_list), event_fn);
        });
    };

    self._setupCustomDropdown = function() {
        $('.input-group-btn .dropdown-menu .dropdown-item').click(function(event) {
            event.preventDefault();
            var obj = $(this);
            obj.closest('.input-group-btn')
                .find('input[type="text"]')
                .val(obj.text());
        });
    };

    self._setupArrays = function() {
        $('[data-dd-array="append"]').click(function(event) {
            self._arrayAppend(self._resolveTarget(this));
            event.stopPropagation();
        });
        $('[data-dd-array="remove"]').click(function(event) {
            self._arrayRemove(self._resolveTarget(this));
            event.stopPropagation();
        });
        $('[data-dd-array="master"]').addClass('d-none');
    }

    self._arrayAppend = function(any_obj_in_array) {
        self._arrayResize(any_obj_in_array, 1, true);
    }


    self.arraySort = function(container, key_fn) {
        container = $(container);
        var items = container.children('[data-dd-array="item"]');
        items.sort(key_fn);
        for (var i = 0; i < items.length; ++i) {
            var item = $(items[i]);
            if (item.attr('data-dd-index') != i.toString()) {
                item.attr('data-dd-index', i.toString());
                self._setupDDPaths(item);
            }
            if (i > 0) {
                item.insertAfter(items[i - 1]);
            }
        }
    };


    self._arrayRemove = function(any_obj_in_item) {
        var item = $(any_obj_in_item).closest('[data-dd-array="item"]');
        var container = item.closest('[data-dd-array="container"]')
        item.remove();
        self._arrayReindex(container);
        self._arrayUpdateCount(container);
    }

    self._arrayResize = function(any_obj_in_array, size, relative=false) {
        var container = $(any_obj_in_array).closest('[data-dd-array="container"]');
        var items = container.children('[data-dd-array="item"]');
        if (relative) {
            size = items.length + size;
        }
        if (items.length < size) {
            var master = container.children('[data-dd-array="master"]');
            var insertion_point = items.length > 0 ? items.last() : master;
            for (var i = 0; i < size - items.length; ++i) {
                // Clone the master, but copy the events too (add/remove buttons)
                var new_item = master.clone(true);
                new_item.removeClass('d-none')
                    .attr('data-dd-array', 'item')
                    .attr('data-dd-index', items.length + i)
                    .insertAfter(insertion_point);
                insertion_point = new_item;
                self._setupDDPaths(new_item);
            }
        } else if (items.length > size) {
            // No need for reindexing
            items.each(function (idx, obj) {
                if (idx >= size) {
                    $(obj).remove();
                }
            });
        } else {
            return;
        }
        self._arrayUpdateCount(container);
    }

    self._arrayReindex = function(any_obj_in_array) {
        var container = $(any_obj_in_array).closest('[data-dd-array="container"]');
        var items = container.children('[data-dd-array="item"]');
        items.each(function (idx, item) {
            $(item).attr('data-dd-index', idx.toString());
        });
    }

    self._arrayUpdateCount = function(any_obj_in_array, count=null) {
        var container = $(any_obj_in_array).closest('[data-dd-array="container"]');
        if (count == null) {
            count = container.children('[data-dd-array="item"]').length;
        }
        var find_target = function(count_obj) {
            var target = self._resolveTarget(count_obj);
            if (target.attr('data-dd-array') !== 'container') {
                target = target.closest('[data-dd-array="container"]');
            }
            return target;
        };
        $('[data-dd-array="count"]').each(function (idx, obj) {
            obj = $(obj);
            var target = find_target(obj);
            if (target[0] === container[0]) {
                obj.text(count.toString());
            }
        });
    };

    self._resizeAllFormArrays = function() {
        var array_sizes = self.data.getArraySizes();
        array_sizes.sort(function (a, b) { return a[0].localeCompare(b[0]); });
        for (var i = 0; i < array_sizes.length; ++i) {
            var array_path = array_sizes[i][0];
            var array_size = array_sizes[i][1];
            // Is this a dynamic array?
            var arr = self.find(array_path + '[-1]');
            if (arr != null && arr.length > 0) {
                self._arrayResize(arr, array_size);
            }
        }
    }

    self._truncateAllHierArrays = function() {
        $('[data-dd-array="master"]').each(function (idx, obj) {
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
        $div.addClass('alert-' + cls);
        $div.text(text);
        $('<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>').appendTo($div);
        $div.insertAfter('nav.navbar');
        if (auto_dismiss > 0) {
            setTimeout(function() {
                $div.alert('close');
            }, auto_dismiss);
        }
        return $div;
    };

    self.setup = function() {
        self._setupDDPaths();
        self._setupDropbox();
        self._setupSaveToModal();
        self._setupLoadFromModal();
        self._setupWaitingModal();
        self._setupAnimatedChevrons();
        self._setupArrays();
        self._setupCustomDropdown();
    };

    self.updateHier = function() {
        self._allControls().each(function (idx, obj) {
            obj = $(obj);
            if (obj.attr('type') === 'checkbox') {
                self.data.set(obj.attr('data-dd-path'), obj.is(':checked'));
            } else {
                self.data.set(obj.attr('data-dd-path'), obj.val());
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
                ctrl.val(flat_data[path]);
            }
        }
    };

    self._populateFileListWithEntries = function(obj, entries, file_click_event, folder_click_event) {
        // Sort the entries folders first
        var compare = function(l, r) {
            var lexic_first_comp = l['.tag'].localeCompare(r['.tag']);
            // FOlder must go before FIle
            if (lexic_first_comp < 0) {
                return 1;
            } else if (lexic_first_comp > 0) {
                return -1;
            } else {
                return l['name'].localeCompare(r['name'])
            }
        };
        // Clear the container
        obj.empty();
        entries.sort(compare);
        for (var i = 0; i < entries.length; ++i) {
            var name = entries[i]['name'];
            var tag = entries[i]['.tag']
            if (tag == 'file') {
                // Filter out those that do not end in json.
                if (!name.endsWith('.json')) {
                    continue;
                }
                $('<a href="#"></a>')
                    .text(' ' + name)
                    .attr('data-name', name)
                    .prepend($('<i class="fa fa-file" aria-hidden="true"></i>'))
                    .click(file_click_event)
                    .appendTo(
                        $('<li></li>')
                        .addClass('dropbox-' + tag)
                        .appendTo(obj)
                    );
            } else if (tag == 'folder') {
                $('<a href="#"></a>')
                    .text(' ' + name)
                    .attr('data-name', name)
                    .prepend($('<i class="fa fa-folder" aria-hidden="true"></i>'))
                    .click(folder_click_event)
                    .appendTo(
                        $('<li></li>')
                        .addClass('dropbox-' + tag)
                        .appendTo(obj)
                    );
            }
        }
    };

    self._navGetPath = function(obj) {
        return $(obj).find('.dropbox-nav').find('ol').attr('data-dirname');
    }

    self._navSetPath = function(obj, path, file_click_event) {
        var nav = $(obj).find('.dropbox-nav').find('ol');
        var pieces = null;
        var chain_path = null;
        if (path == '/') {
            pieces = [''];
            chain_path = '/';
        } else {
            while (path.endsWith('/')) {
                path = path.slice(0, path.length - 1);
            }
            pieces = path.split('/');
            chain_path = path + '/';
        }
        nav.attr('data-dirname', chain_path);
        var items = nav.children('.breadcrumb-item');
        for (var i = 0; i < items.length || i < pieces.length; ++i) {
            if (i >= pieces.length) {
                $(items[i]).remove();
                continue;
            }
            var item = null;
            if (i >= items.length) {
                item = $('<li></li>').addClass('breadcrumb-item').appendTo(nav);
            } else {
                item = $(items[i])
                item.empty();
            }
            if (i < pieces.length - 1) {
                item.removeClass('active').removeAttr('aria-current');
                var subpath = '/' + pieces.slice(0, i).join('/');
                item = $('<a href="#"></a>')
                    .appendTo(item)
                    .click(function (evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        self._navSetPath(obj, subpath, file_click_event);
                    });
            } else {
                item.addClass('active').attr('aria-current', 'page');
            }
            if (pieces[i] == '') {
                $('<i class="fa fa-dropbox" aria-hidden="true"></i>').appendTo(item);
            } else {
                item.text(pieces[i]);
            }
        }
        var folder_click_event = function(evt) {
            evt.preventDefault();
            evt.stopPropagation();
            self._navSetPath(obj, chain_path + $(this).attr('data-name'), file_click_event);
        };
        self._populateFileList($(obj).find('.dropbox-file-list'), path, file_click_event, folder_click_event);
    }

    self._populateFileList = function(obj, path, file_click_event, folder_click_event) {
        obj = $(obj);
        obj.empty()
        var spinner = $('<p class="text-center my-5"><i class="fa fa-refresh fa-spin fa-3x"></i></p>')
            .insertAfter(obj);
        if (path.length > 0 && path[path.length - 1] == '/') {
            path = path.slice(0, path.length -1);
        }
        var entries = [];
        var err_evt = function(error) {
            spinner.remove();
                console.log(error);
                $('<p></p>')
                    .addClass('text-danger')
                    .addClass('text-center')
                    .addClass('my-1')
                    .text('Impossibile caricare la lista di file.')
                    .insertBefore(obj);
        };
        var response_evt = function(response) {
            Array.prototype.push.apply(entries, response.entries);
            if (response.has_more) {
                self.dropbox.filesListFolderContinue(response.cursor)
                    .then(response_evt)
                    .catch(err_evt);
            } else {
                spinner.remove();
                self._populateFileListWithEntries(obj, entries, file_click_event, folder_click_event);
            }
        };
        self.dropbox.filesListFolder({
            path: path,
            include_deleted: false,
            include_media_info: false,
            recursive: false,
            include_mounted_folders: true
        })
        .then(response_evt)
        .catch(err_evt);
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
                $('<i class="fa fa-check fa-5x"></i>').appendTo(dialog);
            } else {
                $('<i class="fa fa-times fa-5x"></i>').appendTo(dialog);
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

    self.loadRemote = function(name, post_action=null) {
        $.getJSON(name, function(json_data) {
            self.data.obj = json_data;
            self.updateForm();
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
                    self.updateForm();
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