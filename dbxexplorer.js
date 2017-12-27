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

/*

Requires a minimum seup as follows:

<div>
  <nav class="dropbox-nav" data-path="/">
    <ol class="breadcrumb">
      <li class="breadcrumb-item active" aria-current="page">
        <i class="fa fa-dropbox" aria-hidden="true"></i>
      </li>
    </ol>
  </nav>
  <div class="dropbox-alert" role="alert"></div>
  <p class="dropbox-spinner">Caricamento</p>
  <ul class="dropbox-file-list"></ul>
</div>


This must be the jquery object passed as the `explorer` argument.
The `dbx` object is a Dropbox API instance.
`file_click_evt` is a event handler for the click on an entry.
The target of the event has a `data-file` attribute containing the file name.
`entry_filter` is a function(tag, name), where tag is either "file" or "folder",
and name is the filename.

*/

function Explorer(dbx, explorer, file_click_evt, entry_filter=null) {
    var self = this;

    self.dropbox = dbx;
    self.explorer = $(explorer);
    self.entry_filter = entry_filter;
    self._list = self.explorer.find('.dropbox-file-list');
    self._nav = self.explorer.find('.dropbox-nav');
    self._breadcrumb = self._nav.find('ol.breadcrumb');
    self._spinner = self.explorer.find('.dropbox-spinner');
    self._alert = self.explorer.find('.dropbox-alert');
    self._file_evt = file_click_evt;

    self.pwd = function() {
        return self._nav.attr('data-path');
    };

    self._setPath = function(path) {
        self._nav.attr('data-path', normalize(path, true));
    }

    self._syncBreadcrumb = function() {
        var items = self._breadcrumb.children('.breadcrumb-item');
        var pieces = null;
        if (self.pwd() == '/') {
            pieces = [''];
        } else {
            pieces= self.pwd().split('/');
        }

        // Reuse existing items. Loop in the maximum between pieces and items
        for (var i = 0; i < items.length || i < pieces.length; ++i) {
            if (i >= pieces.length) {
                // This is not needed, delete and continue
                $(items[i]).remove();
                continue;
            }
            // The current working item
            var item = null;
            if (i >= items.length) {
                // Generate a new one
                item = $('<li></li>').addClass('breadcrumb-item').appendTo(self._breadcrumb);
            } else {
                // Reuse the previous one, but remove the content
                item = $(items[i])
                item.empty();
            }
            if (i < pieces.length - 1) {
                // Compute the path to this folder
                var subpath = normalize(pieces.slice(0, i), true);
                // Make sure this doesn't have the active look.
                item.removeClass('active').removeAttr('aria-current');
                var subpath = '/' + pieces.slice(0, i).join('/');
                // Generate a new anchor; set that to be the innermost item
                item = $('<a href="#"></a>')
                    .appendTo(item)
                    .click(function (evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        self.chdir(subpath);
                    });
            } else {
                // Add the classes for being active
                item.addClass('active').attr('aria-current', 'page');
            }
            if (pieces[i] == '') {
                // Use a dropbox icon
                $('<i class="fa fa-dropbox" aria-hidden="true"></i>').appendTo(item);
            } else {
                // Set the text instead
                item.text(pieces[i]);
            }
        }
    }

    self._spin = function() {
        self._spinner.removeClass('d-none');
        self._list.addClass('d-none');
        self._alert.addClass('d-none');
    }

    self._unspin = function(err_msg=null) {
        self._spinner.addClass('d-none');
        if (err_msg) {
            self._alert.removeClass('d-none');
            self._alert.text(err_msg);
        } else {
            self._list.removeClass('d-none');
        }
    }

    self._populateFileList = function(entries) {
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
        self._list.empty();
        entries.sort(compare);
        for (var i = 0; i < entries.length; ++i) {
            var name = entries[i]['name'];
            var tag = entries[i]['.tag']
            if (self.entry_filter) {
                if (!self.entry_filter(tag, name)) {
                    continue;
                }
            }
            if (tag == 'file') {
                $('<a href="#"></a>')
                    .text(' ' + name)
                    .attr('data-file', name)
                    .prepend($('<i class="fa fa-file" aria-hidden="true"></i>'))
                    .click(self._file_evt)
                    .appendTo(
                        $('<li></li>')
                        .addClass('dropbox-' + tag)
                        .appendTo(self._list)
                    );
            } else if (tag == 'folder') {
                $('<a href="#"></a>')
                    .text(' ' + name)
                    .attr('data-file', name)
                    .prepend($('<i class="fa fa-folder" aria-hidden="true"></i>'))
                    .click(function(evt) {
                        evt.preventDefault();
                        evt.stopPropagation();
                        self.chdir(combine(self.pwd(), $(this).attr('data-file'), true));
                    })
                    .appendTo(
                        $('<li></li>')
                        .addClass('dropbox-' + tag)
                        .appendTo(self._list)
                    );
            }
        }
    }

    self._fetchFolderContent = function() {
        self._spin();
        var entries = [];
        var err_evt = function(err) {
            console.log(err);
            self._unspin('Impossibile caricare la lista dei file: ' + err.error);
        };
        var response_evt = function(response) {
            Array.prototype.push.apply(entries, response.entries);
            if (response.has_more) {
                self.dropbox.filesListFolderContinue(response.cursor)
                    .then(response_evt)
                    .catch(err_evt);
            } else {
                self._populateFileList(entries);
                self._unspin();
            }
        };
        // Dbx wants root as empty string
        var path = self.pwd();
        if (path == '/') {
            path = '';
        }
        self.dropbox.filesListFolder({
            path: path,
            include_deleted: false,
            include_media_info: false,
            recursive: false,
            include_mounted_folders: true
        })
        .then(response_evt)
        .catch(err_evt);
    }

    self.chdir = function(path, refresh=true) {
        // Apply the wanted path
        self._setPath(path);
        if (refresh) {
            self.refresh();
        }
    }

    self.refresh = function() {
        self._syncBreadcrumb();
        self._fetchFolderContent();
    }

};



function combine(path, file, absolute=true) {
    return normalize(path.split('/').concat([file]), absolute);
}

function normalize(path, absolute=true) {
    if (!(path instanceof Array)) {
        path = path.split('/');
    }
    path = path.filter(piece => piece.length > 0).join('/');
    if (absolute) {
        path = '/' + path;
    }
    return path;
}
