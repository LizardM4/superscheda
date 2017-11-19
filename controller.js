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
        var path = obj.data('dd-id');
        if (obj.data('dd-index') != null) {
            path += '[' + obj.data('dd-index') + ']'
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
        if (obj.data('target')) {
            return $(obj.data('target'));
        }
        return obj;
    };

    self._allControls = function() {
        return $('.form-control[data-dd-path]');
    };

    self._setupDDPaths = function(objs=$) {
        $(objs).find('.form-control[data-dd-id]:not([data-dd-array="master"] *)')
            .each(function (idx, obj) {
                $(obj).attr('data-dd-path', self._getHierPath(obj));
            });
    };

    self._setupDropbox = function() {
        parms = parseQueryString();
        if ('access_token' in parms) {
            self.dropbox = new Dropbox({accessToken: parms['access_token']});
            // Enable the open and save button
            $('button[data-target="#load_from"]').prop('disabled', false);
            $('button[data-target="#save_to"]').prop('disabled', false);
        } else {
            self.dropbox = new Dropbox({clientId: self.appId});
            // Enable the button for the authentication
            $('button[data-target="#auth_dbx"]').prop('disabled', false).removeClass('d-none');
            // Generate  the authentication url
            $('#auth_dbx a').attr('href', self.dropbox.getAuthenticationUrl(window.location));
            $(function() {
                $('#auth_dbx').modal('show');
            });
        }
    };

    self._setupSaveToModal = function() {
        self._modalSaveTo = $('#save_to');
        var save_to_list = self._modalSaveTo.find('.dropbox-file-list');
        var save_to_form = self._modalSaveTo.find('form');
        var save_to_file = save_to_form.find('input');

        save_to_form.on('submit', function (event) {
            // TODO this is not correct
            event.preventDefault();
            event.stopPropagation();
            if (save_to_form[0].checkValidity() === true) {
                self._modalSaveTo.modal('hide');
                self.toggleWaiting(true);
                self.save(save_to_form.find('input').val(), function(res) { self.toggleWaiting(false, res); });
            }
            save_to_form.addClass('was-validated');
        });

        self._modalSaveTo.on('show.bs.modal', function (event) {
            var event_fn = function(event2) {
                save_to_file.val($(this).text().trim()).change();
            };
            save_to_form[0].reset();
            save_to_form.removeClass('was-validated');
            self._populateFileList(save_to_list, event_fn);
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
        var load_from_list = self._modalLoadFrom.find('.dropbox-file-list');

        self._modalLoadFrom.on('show.bs.modal', function (event) {
            var event_fn = function(event2) {
                self._modalLoadFrom.modal('hide');
                self.toggleWaiting(true);
                self.load($(this).text().trim(), function(res) { self.toggleWaiting(false, res); });
            };
            self._populateFileList(load_from_list, event_fn);
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
            for (var i = 0; i < size - items.length; ++i) {
                // Clone the master, but copy the events too (add/remove buttons)
                var new_item = master.clone(true);
                new_item.removeClass('d-none')
                    .attr('data-dd-array', 'item')
                    .attr('data-dd-index', items.length + i)
                    .appendTo(container);
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
            if (target.data('dd-array') !== 'container') {
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
            self.data.get(path).length = n_children;
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


    self.notify = function(cls, text) {
        var $div = $('<div class="alert alert-dismissible sticky-top fade show" role="alert">');
        $div.addClass('alert-' + cls);
        $div.text(text);
        $('<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>').appendTo($div);
        $div.insertAfter('h1');
    };

    self.setup = function() {
        self._setupDDPaths();
        self._setupDropbox();
        self._setupSaveToModal();
        self._setupLoadFromModal();
        self._setupWaitingModal();
        self._setupAnimatedChevrons();
        self._setupArrays();
    };

    self.updateHier = function() {
        self._allControls().each(function (idx, obj) {
            self.data.set($(obj).data('dd-path'), $(obj).val());
        });
        self._truncateAllHierArrays();
    };

    self.updateForm = function() {
        self._resizeAllFormArrays();
        var flat_data = self.data.flatten();
        var ctrls = self._allControls();
        for (var path in flat_data) {
            ctrls.filter('[data-dd-path="' + path + '"]').val(flat_data[path]);
        }
    };

    self._populateFileList = function(obj, file_click_event) {
        obj = $(obj);
        obj.empty();
        $('<p class="text-center"><i class="fa fa-refresh fa-spin fa-3x"></i></p>').appendTo(obj);
        self.dropbox.filesListFolder({path: ''})
            .then(function(response) {
                obj.empty();
                var $ul = $('<ul class="list-unstyled ml-1"></ul>');
                for (var i = 0; i < response.entries.length; ++i) {
                var name = response.entries[i].name;
                $('<a href="#"></a>')
                    .text(' ' + name)
                    .prepend($('<i class="fa fa-file" aria-hidden="true"></i>'))
                    .click(file_click_event)
                    .appendTo($('<li></li>').appendTo($ul));
                }
                $ul.appendTo(obj);
            })
            .catch(function(error) {
                console.log(error);
                $('<p class="text-danger">Impossibile caricare la lista di file.</p>')
                    .appendTo(obj);
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
                $('<i class="fa fa-check fa-5x"></i>').appendTo(dialog);
            } else {
                $('<i class="fa fa-times fa-5x"></i>').appendTo(dialog);
            }
            setTimeout(function() {
                self._modalWaiting.modal('hide');
            }, 400);
        }
    }

    self.save = function(name, post_action=null) {
        self.updateHier();
        self.dropbox.filesUpload({
            path: '/' + name,
            mode: 'overwrite',
            contents: self.data.dump()
        })
            .then(function(response) {
                self.notify('success', 'Salvato su \'' + name +'\'.');
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

    self.load = function(name, post_action=null) {
        self.dropbox.filesDownload({path: '/' + name})
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