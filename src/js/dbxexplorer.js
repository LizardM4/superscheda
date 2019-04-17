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

/*

Requires a minimum seup as follows:

<div>
  <nav class="dropbox-nav" data-path="/">
    <ol class="breadcrumb">
      <li class="breadcrumb-item active" aria-current="page">
        <i class="fab fa-dropbox" aria-hidden="true"></i>
      </li>
    </ol>
  </nav>
  <div class="dropbox-alert" role="alert"></div>
  <p class="dropbox-spinner">Caricamento</p>
  <ul class="dropbox-file-list"></ul>
</div>


This must be the jquery object passed as the `explorer` argument.
The `dbx` object is a Dropbox API instance.
`fileClickEvent` is a event handler for the click on an entry.
The target of the event has a `data-file` attribute containing the file name.
`entryFilter` is a function(tag, name), where tag is either "file" or "folder",
and name is the filename.

*/
'use strict';

import { jQuery as $ } from 'jquery';
import { pathCombine, pathNormalize } from './helper.js';

class DropboxExplorer {
    constructor(dbx, explorer, fileClickEvent, entryFilter=null) {
        this._dropbox = dbx;
        this._explorer = $(explorer);
        this._entryFilter = entryFilter;
        this._fileList = this._explorer.find('.dropbox-file-list');
        this._nav = this._explorer.find('.dropbox-nav');
        this._breadcrumb = this._nav.find('ol.breadcrumb');
        this._spinner = this._explorer.find('.dropbox-spinner');
        this._alert = this._explorer.find('.dropbox-alert');
        this._fileClickEvent = fileClickEvent;
        this.workDir = '/';
    }

    get workDir() {
        return this._nav.attr('data-path');
    }

    set workDir(path) {
        if (path === this.workDir) {
            return;
        }
        this._nav.attr('data-path', pathNormalize(path, true));
        this._syncBreadcrumb();
        if (this._explorer.is(':visible')) {
            this._loadFolderContent();
        }
    }

    refresh() {
        this._loadFolderContent();
    }

    _syncBreadcrumb() {
        const $items = this._breadcrumb.children('.breadcrumb-item');
        const pathPieces = (this.workDir === '/' ? [''] : this.workDir.split('/'));

        // Reuse existing items. Loop in the maximum between pathPieces and $items
        for (let i = 0; i < $items.length || i < pathPieces.length; ++i) {
            if (i >= pathPieces.length) {
                // This is not needed, delete and continue
                $($items[i]).remove();
                continue;
            }
            // The current working item
            let $item = null;
            if (i >= $items.length) {
                // Generate a new one
                $item = $('<li></li>').addClass('breadcrumb-item').appendTo(this._breadcrumb);
            } else {
                // Reuse the previous one, but remove the content
                $item = $($items[i]);
                $item.empty();
            }
            if (i < pathPieces.length - 1) {
                // Compute the path to this folder
                const dirPath = pathNormalize(pathPieces.slice(0, i), true);
                // Make sure this doesn't have the active look.
                $item.removeClass('active').removeAttr('aria-current');
                // Generate a new anchor; set that to be the innermost item
                $item = $('<a href="#"></a>')
                    .appendTo($item)
                    .click(evt => {
                        evt.preventDefault();
                        evt.stopPropagation();
                        this.workDir = dirPath;
                    });
            } else {
                // Add the classes for being active
                $item.addClass('active').attr('aria-current', 'page');
            }
            if (pathPieces[i] === '') {
                // Use a dropbox icon
                $('<i class="fab fa-dropbox" aria-hidden="true"></i>').appendTo($item);
            } else {
                // Set the text instead
                $item.text(pathPieces[i]);
            }
        }
    }

    startSpinner() {
        this._spinner.removeClass('d-none');
        this._fileList.addClass('d-none');
        this._alert.addClass('d-none');
    }


    stopSpinner(errMsg=null) {
        this._spinner.addClass('d-none');
        if (errMsg) {
            this._alert.removeClass('d-none');
            this._alert.text(errMsg);
        } else {
            this._fileList.removeClass('d-none');
        }
    }

    _loadFolderContent() {
        this.startSpinner();
        let entries = [];
        const errEvent = err => {
            console.log(err);
            this.stopSpinner('Impossibile caricare la lista dei file: ' + err.error);
        };
        const responseEvent = response => {
            entries.splice(-1, 0, ...response.entries);
            if (response.has_more) {
                this._dropbox.filesListFolderContinue(response.cursor)
                    .then(responseEvent)
                    .catch(errEvent);
            } else {
                this._populateFileList(entries);
                this.stopSpinner();
            }
        };
        // Dbx wants root as empty string
        let path = this.workDir;
        if (path === '/') {
            path = '';
        }
        this._dropbox.filesListFolder({
                path: path,
                include_deleted: false,
                include_media_info: false,
                recursive: false,
                include_mounted_folders: true
            })
            .then(responseEvent)
            .catch(errEvent);
    }

    static entriesCompare(l, r) {
        var lexicFirstCompare = l['.tag'].localeCompare(r['.tag']);
        // FOlder must go before FIle
        if (lexicFirstCompare < 0) {
            return 1;
        } else if (lexicFirstCompare > 0) {
            return -1;
        } else {
            return l['name'].localeCompare(r['name'])
        }
    }

    _populateFileList(entries) {
        // Clear the container
        this._fileList.empty();
        entries.sort(DropboxExplorer.entriesCompare);
        entries.forEach(entry => {
            const name = entry['name'];
            const tag = entry['.tag'];
            if (this._entryFilter && !this._entryFilter(tag, name)) {
                return;
            }
            if (tag === 'file') {
                $('<a href="#"></a>')
                    .text(' ' + name)
                    .attr('data-file', name)
                    .prepend($('<i class="far fa-file" aria-hidden="true"></i>'))
                    .click(this._fileClickEvent)
                    .appendTo(
                        $('<li></li>')
                        .addClass('dropbox-' + tag)
                        .appendTo(this._fileList)
                    );
            } else if (tag === 'folder') {
                $('<a href="#"></a>')
                    .text(' ' + name)
                    .attr('data-file', name)
                    .prepend($('<i class="far fa-folder" aria-hidden="true"></i>'))
                    .click(evt => {
                        evt.preventDefault();
                        evt.stopPropagation();
                        this.workDir = pathCombine(this.workDir, evt.target.getAttribute('data-file'), true);
                    })
                    .appendTo(
                        $('<li></li>')
                        .addClass('dropbox-' + tag)
                        .appendTo(this._fileList)
                    );
            }
        });
    }
}

export { DropboxExplorer };