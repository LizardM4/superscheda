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

class DDArray {
    get container() {
        return this._container;
    }

    get master() {
        return this._master;
    }

    get length() {
        return this._items.length;
    }

    static getIndex(domItem) {
        const idx = parseInt(domItem.getAttribute('data-dd-index'));
        if (idx !== idx) {
            return null;
        }
        return idx;
    }

    _collectItems() {
        return this.container.children('[data-dd-array="item"]').toArray();
    }

    constructor($container) {
        this._container = $container;
        this._master = this.container.children('[data-dd-array="master"]');
        this._items = this._collectItems();
        this._reindex(0, false);
        // Notify of mass insertion
        this.container.trigger('ddarray.insertion', this._items.slice());
    }

    clear() {
        this.resize(0);
    }

    _reindex(startAt=0, collectUpdated=true) {
        let updatedItems = collectUpdated ? [] : null;
        for (let i = startAt; i < this._items.length; ++i) {
            const previousIdx = DDArray.getIndex(domItem);
            if (previousIdx !== i) {
                domItem.setAttribute('data-dd-index', i.toString());
                if (collectUpdated) {
                    updatedItems.push([domItem, previousIdx, i]);
                }
            }
        }
        return updatedItems;
    }

    _insert(idx, numInsert=1) {
        console.assert(idx <= this.length);
        if (numInsert <= 0) {
            return;
        }
        const insertAfter = idx > 0 ? this._items[idx - 1] : this.master;
        const newItems = [];
        for (let i = 0; i < numInsert; ++i) {
            const $newItem = this.master
                .clone(true)
                .removeClass('d-none')
                .attr('data-dd-array', 'item')
                .attr('data-dd-index', (idx + i).toString());
            newItems.push(newItem[0]);
        }
        // Insert into the elements
        this._items.splice(idx, 0, ...newItems);
        // Reindex
        const reindexedItems = this._reindex(idx + numInsert, true);
        if (reindexedItems.length > 0) {
            this.container.trigger('ddarray.reindex', reindexedItems);
        }
        if (newItems.length > 0) {
            $(newItems).insertAfter(insertAfter);
            this.container.trigger('ddarray.insertion', newItems);
        }
    }

    _remove(idx, numDeleted=1) {
        console.assert(idx < this.length);
        console.assert(idx + numDeleted <= this.length)
        if (idx >= this.length) {
            return;
        }
        if (numDeleted <= 0) {
            return;
        }
        numDeleted = Math.min(numDeleted, this.length - idx);
        const deletedDomItems = this._items.splice(idx, numDeleted);
        const reindexedItems = this._reindex(idx, true);
        if (deletedDomItems.length > 0) {
            this.container.trigger('ddarray.removal', deletedDomItems.slice());
            $(deletedDomItems).remove();
        }
        if (reindexedItems.length > 0) {
            this.container.trigger('ddarray.reindex', reindexedItems);
        }
    }

    resize(reqSize) {
        if (this.length > reqSize) {
            this._remove(reqSize, this.length - reqSize);
        } else if (this.length < reqSize) {
            this._insert(this.length, this.length - reqSize);
        }
    }

    append() {
        this._insert(this.length, 1);
    }

    remove(itemOrIndex) {
        if (typeof itemOrIndex !== 'number') {
            itemOrIndex = this._items.indexOf(itemOrIndex);
        }
        if (itemOrIndex >= 0) {
            this._remove(itemOrIndex, 1);
        }
    }

    sort(compareFn) {
        this._items.sort(compareFn);
        const reindexedItems = this._reindex(0, true);
        // Sort them in such a way that the new index is always the lowest
        reindexedItems.sort((a, b) => a[2] - b[2]);
        // Modify the position in the container.
        let j = 0;
        for (let i = 0; i < this.length; ++i) {
            // Advance as much as possible the reindexed item index until we find some operation to do
            while (j < reindexedItems.length && reindexedItems[j][2] < i) {
                ++j;
            }
            if (j >= reindexedItems.length) {
                break; // Nothing more to do
            }
            const [domItem, previousIdx, newIdx] = reindexedItems[j];
            if (newIdx > i) {
                // Skip to the next event
                i = newIdx - 1;
                continue;
            }
            console.assert(i === newIdx);
            console.assert(domItem === this._items[i]);
            // This element is located somewhere else in the dom and needs to be brought at
            // position newIdx. We know that up to newIdx, the order in the dom matches the
            // order in _items.
            const insertAfter = newIdx > 0 ? this._items[newIdx - 1] : this.master;
            $(domItem).insertAfter(insertAfter);
        }
    }
}

function DDArray(container) {
    var self = this;

    // self.container = container;
    // self.master = self.container.children('[data-dd-array="master"]');

    // self._getItems = function() {
    //     return self.container.children('[data-dd-array="item"]');
    // }

    // self.size = function() {
    //     return self._getItems().length;
    // }

    // self.clear = function() {
    //     self.resize(0);
    // }

    // self.get = function(idx) {
    //     return self.container.children('[data-dd-array="item"][data-dd-index="' + idx.toString() + '"]');
    // }

    // self.resize = function(size, relative=false) {
    //     var items = self._getItems();
    //     if (relative) {
    //         size = items.length + size;
    //     }
    //     if (items.length < size) {
    //         for (var i = 0; i < size - items.length; ++i) {
    //             self.append();
    //         }
    //     } else if (items.length > size) {
    //         for (var i = items.length - 1; i >= size; --i) {
    //             self.remove(items[i]);
    //         }
    //     }
    // }

    // self.append = function() {
    //     var items = self._getItems();
    //     var insertion_point = items.length > 0 ? items.last() : self.master;
    //     // Clone the master, but copy the events too (add/remove buttons)
    //     var new_item = self.master.clone(true);
    //     new_item.removeClass('d-none')
    //         .attr('data-dd-array', 'item')
    //         .attr('data-dd-index', items.length)
    //         .insertAfter(insertion_point);
    //     self.container.trigger('ddarray.insertion', [new_item]);
    //     return new_item;
    // }

    // self.remove = function(item) {
    //     item = $(item);
    //     console.assert(item.closest('[data-dd-array="container"]')[0] == self.container[0]);
    //     self.container.trigger('ddarray.removal', [item]);
    //     item.remove();
    //     self._reindex();
    // }

    // self._reindex = function() {
    //     self._getItems().each(function (idx, item) {
    //         item = $(item);
    //         var prev_idx = Number.parseInt(item.attr('data-dd-index'));
    //         if (prev_idx != idx) {
    //             item.attr('data-dd-index', idx.toString());
    //             self.container.trigger('ddarray.reindex', [item, prev_idx, idx]);
    //         }
    //     });
    // }

    // self.sort = function(key_fn) {
    //     var items = self._getItems();
    //     items.sort(key_fn);
    //     for (var i = 0; i < items.length; ++i) {
    //         var item = $(items[i]);
    //         var prev_idx = Number.parseInt(item.attr('data-dd-index'));
    //         if (prev_idx != i) {
    //             item.attr('data-dd-index', i.toString());
    //             self.container.trigger('ddarray.reindex', [item, prev_idx, i]);
    //         }
    //         if (i > 0) {
    //             item.insertAfter(items[i - 1]);
    //         }
    //     }
    // };

    // // Notify the insertion of the pre-existing elements
    // self._getItems().each(function (idx, obj) {
    //     obj = $(obj);
    //     obj.attr('data-dd-index', idx.toString());
    //     self.container.trigger('ddarray.insertion', [obj]);
    // });


};


var firstLevFilter = function(parent) {
    return function(idx, obj) {
        return $(obj).parentsUntil($(parent), '[data-dd-array="container"]').length == 0;
    }
}

function _first_level_objs(parent, type='container') {
    parent = $(parent);
    return parent
        .find('[data-dd-array="' + type + '"]')
        .filter(firstLevFilter(parent));
}

function _clear_nested_arrays(parent) {
    _first_level_objs(parent, 'container').each(function (idx, obj) {
        obj = $(obj);
        var controller = obj.data('dd-array-controller');
        controller.clear();
        obj.removeData('dd-array-controller');
    });
}

function _recursive_setup(parent, custom_events) {
    _first_level_objs(parent, 'container').each(function (idx, obj) {
        // This is a first level container
        obj = $(obj);

        var dd_arr = new DDArray(obj);

        obj.data('dd-array-controller', dd_arr);
        obj.on('ddarray.insertion', function(evt, inserted_item) {
            inserted_item = $(inserted_item);
            _recursive_setup(inserted_item, custom_events);
            _first_level_objs(inserted_item, 'remove').click(function() {
                dd_arr.remove(inserted_item);
            });
            // It is important to stop propagation or the event will
            // bubble up to the parent
            evt.stopPropagation();
        });
        obj.on('ddarray.removal', function(evt, item_to_remove) {
            _clear_nested_arrays($(item_to_remove));
            // It is important to stop propagation or the event will
            // bubble up to the parent
            evt.stopPropagation();
        });
        obj.on('ddarray.reindex', function(evt) {
            // It is important to stop propagation or the event will
            // bubble up to the parent
            evt.stopPropagation();
        });
        // Custom events
        for (k in custom_events) {
            obj.on('ddarray.' + k, custom_events[k]);
        }
        // Adders and remover
        _first_level_objs(obj, 'append').click(function() {
            dd_arr.append();
        });
    });
}


function _resolve_target(obj, type) {
    obj = $(obj);
    if (obj.attr('data-target')) {
        return $(obj.attr('data-target'));
    } else {
        return obj.closest('[data-dd-array="' + type +'"]');
    }
};

function initDDArrays(custom_events={}) {
    $('[data-dd-array="master"]').addClass('d-none');
    _recursive_setup($('body'), custom_events);
}
