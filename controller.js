function Controller() {
    var self = this;

    self.data = new Hier();
    self.dropBox = null;

    self._getHierPath = function(obj) {
        var parents = $(obj).parents('[data-dd-id]');
        var path = [];
        if (parents.length > 0) {
            path = $.makeArray(
                parents.map(function(i, item) { return $(item).data('dd-id'); })
            ).reverse();
        }
        path.push($(obj).data('dd-id'));
        return path.join('.');
    };

    self._allControls = function() {
        return $('input[data-dd-path]');
    };

    self._setupDDPaths = function() {
        $('input[data-dd-id]').each(function (idx, obj) {
            $(obj).attr('data-dd-path', self._getHierPath(obj));
        });
    };

    self._setupDropBox = function() {
        if (DDConfig && DDConfig['accessToken']) {
            self.dropBox = new Dropbox({accessToken: DDConfig['accessToken']});
        } else {
            self.notify('danger', 'Unable to load DropBox: missing \'accessToken\' entry in \'dd-config.js\'');
        }
    };


    self.notify = function(cls, text) {
        var $div = $('<div class="alert alert-dismissible fade show" role="alert">');
        $div.addClass('alert-' + cls);
        $div.text(text);
        $('<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span>' +
          '</button>').appendTo($div);
        $div.insertAfter('h1');
    };

    self.setup = function() {
        self._setupDDPaths();
        self._setupDropBox();
    };

    self.update = function() {
        self._allControls().each(function (idx, obj) {
            self.data.set($(obj).data('dd-path'), $(obj).val());
        });
    };

};