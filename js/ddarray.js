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
        this._container.data('dd-array-controller', this);
        this._master = this.container.children('[data-dd-array="master"]');
        this._items = this._collectItems();
        this._reindex(0, false);
        // Notify of mass insertion
        if (this.length > 0) {
            this.container.trigger('ddarray.insertion', [this._items.slice()]);
        }
    }

    clear() {
        this.resize(0);
    }

    _reindex(startAt=0, collectUpdated=true) {
        let updatedItems = collectUpdated ? [] : null;
        for (let i = startAt; i < this._items.length; ++i) {
            const domItem = this._items[i];
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
                .attr('data-dd-array', 'item')
                .attr('data-dd-index', (idx + i).toString());
            newItems.push($newItem[0]);
        }
        // Insert into the elements
        this._items.splice(idx, 0, ...newItems);
        // Reindex
        const reindexedItems = this._reindex(idx + numInsert, true);
        if (reindexedItems.length > 0) {
            this.container.trigger('ddarray.reindex', [reindexedItems]);
        }
        if (newItems.length > 0) {
            $(newItems).insertAfter(insertAfter);
            this.container.trigger('ddarray.insertion', [newItems]);
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
            this.container.trigger('ddarray.removal', [deletedDomItems.slice()]);
            $(deletedDomItems).remove();
        }
        if (reindexedItems.length > 0) {
            this.container.trigger('ddarray.reindex', [reindexedItems]);
        }
    }

    resize(reqSize) {
        if (this.length > reqSize) {
            this._remove(reqSize, this.length - reqSize);
        } else if (this.length < reqSize) {
            this._insert(this.length, reqSize - this.length);
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

    static getDirectChildrenArrays($parent, type='container') {
        return $parent.find('[data-dd-array="' + type + '"]').filter((_, domElement) => {
            return $(domElement).parentsUntil($parent, '[data-dd-array="container"]').length === 0;
        });
    }

    static setup($parent, customEvents={}) {
        DDArray.getDirectChildrenArrays($parent).each((_, domContainer) => {
            const controller = new DDArray($(domContainer));
            controller.container
                .on('ddarray.insertion', (evt, insertedItems) => {
                    // Recursive array setup
                    insertedItems.forEach(item => {
                        const $item = $(item);
                        DDArray.setup($item, customEvents);
                        DDArray.getDirectChildrenArrays($item, 'remove')
                            .click(() => {controller.remove(item)});
                    });
                    // It is important to stop propagation or the event will bubble up to the parent
                    evt.stopPropagation();
                })
                .on('ddarray.removal', (evt, removedItems) => {
                    // It is important to stop propagation or the event will bubble up to the parent
                    evt.stopPropagation();
                })
                .on('ddarray.reindex', (evt, domItemPrevIdxIdxTriples) => {
                    // It is important to stop propagation or the event will bubble up to the parent
                    evt.stopPropagation();
                });
            // Adders
            DDArray.getDirectChildrenArrays(controller.container, 'append')
                .click(() => { controller.append(); });
            // Custom events
            ['insertion', 'removal', 'reindex'].forEach(evtName => {
                const handler = customEvents[evtName];
                if (handler) {
                    controller.container.on('ddarray.' + evtName, handler);
                }
            });
        });
    }

    static getController(domElement) {
        const matches = $(domElement).parents('[data-dd-array="container"]');
        if (matches && matches.length > 0) {
            return $(matches[0]).data('dd-array-controller');
        }
        return null;
    }
}

export { DDArray };
