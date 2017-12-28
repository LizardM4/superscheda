function DDArray(container) {
    var self = this;

    self.container = container;
    self.master = self.container.children('[data-dd-array="master"]');

    self._getItems = function() {
        return self.container.children('[data-dd-array="item"]');
    }

    self.size = function() {
        return self._getItems().length;
    }

    self.clear = function() {
        self.resize(0);
    }

    self.resize = function(size, relative=false) {
        var items = self._getItems();
        if (relative) {
            size = items.length + size;
        }
        if (items.length < size) {
            for (var i = 0; i < size - items.length; ++i) {
                self.append();
            }
        } else if (items.length > size) {
            for (var i = items.length - 1; i >= size; --i) {
                self.remove(items[i]);
            }
        }
    }

    self.append = function() {
        var items = self._getItems();
        var insertion_point = items.length > 0 ? items.last() : self.master;
        // Clone the master, but copy the events too (add/remove buttons)
        var new_item = self.master.clone(true);
        new_item.removeClass('d-none')
            .attr('data-dd-array', 'item')
            .attr('data-dd-index', items.length)
            .insertAfter(insertion_point);
        self.container.trigger('ddarray.insertion', [new_item]);
    }

    self.remove = function(item) {
        item = $(item);
        console.assert(item.closest('[data-dd-array="container"]')[0] == self.container[0]);
        self.container.trigger('ddarray.removal', [item]);
        item.remove();
        self._reindex();
    }

    self._reindex = function() {
        self._getItems().each(function (idx, item) {
            item = $(item);
            var prev_idx = Number.parseInt(item.attr('data-dd-index'));
            if (prev_idx != idx) {
                self.container.trigger('ddarray.reindex', [item, prev_idx, idx]);
                item.attr('data-dd-index', idx.toString());
            }
        });
    }

    self.sort = function(key_fn) {
        var items = self._getItems();
        items.sort(key_fn);
        for (var i = 0; i < items.length; ++i) {
            var item = $(items[i]);
            var prev_idx = Number.parseInt(item.attr('data-dd-index'));
            if (prev_idx != idx) {
                self.container.trigger('ddarray.reindex', [item, prev_idx, idx]);
                item.attr('data-dd-index', idx.toString());
            }
            if (i > 0) {
                item.insertAfter(items[i - 1]);
            }
        }
    };

    // Notify the insertion of the pre-existing elements
    self._getItems().each(function (idx, obj) {
        obj = $(obj);
        obj.attr('data-dd-index', idx.toString());
        self.container.trigger('ddarray.insertion', [obj]);
    });


};


function _first_level_arrays(parent) {
    parent = $(parent);
    return parent
        .find('[data-dd-array="container"]')
        .filter(function (idx, obj) {
            return $(obj).parentsUntil(parent, '[data-dd-array="container"]').length == 0;
        });
}

function _clear_nested_arrays(parent) {
    _first_level_arrays(parent).each(function (idx, obj) {
        obj = $(obj);
        var controller = obj.data('dd-array-controller');
        controller.clear();
        obj.removeData('dd-array-controller');
    });
}

function _recursive_setup(parent, custom_events) {
    _first_level_arrays(parent).each(function (idx, obj) {
        // This is a first level container
        obj = $(obj);

        obj.data('dd-array-controller', new DDArray(obj));
        obj.on('ddarray.insertion', function(idx, inserted_item) {
            _recursive_setup($(inserted_item), custom_events);
        });
        obj.on('ddarray.removal', function(idx, item_to_remove) {
            _clear_nested_arrays($(item_to_remove));
        });
        // Custom events
        for (k in custom_events) {
            obj.on('ddarray.' + k, custom_events[k]);
        }
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

function setup_dd_arrays(custom_events={}) {
    $('[data-dd-array="master"]').addClass('d-none');
    _recursive_setup($('body'), custom_events);
    $('[data-dd-array="append"]').click(function(evt) {
        var container = _resolve_target(this, 'container');
        container.data('dd-array-controller').append();
        evt.stopPropagation();
    });
    $('[data-dd-array="remove"]').click(function(evt) {
        var item = _resolve_target(this, 'item');
        var container = item.closest('[data-dd-array="container"]');
        container.data('dd-array-controller').remove(item);
        evt.stopPropagation();
    });
}
