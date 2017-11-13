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

    self._setupSaveToModal = function() {
        self._modalSaveTo = $('#save_to');
        var save_to_list = self._modalSaveTo.find('.dropbox-file-list');
        var save_to_form = self._modalSaveTo.find('form');
        var save_to_file = save_to_form.find('input');

        save_to_form.on('submit', function (event) {
          event.preventDefault();
          event.stopPropagation();
          save_to_form.find('input,button').prop('disabled', true);
          if (save_to_form[0].checkValidity() === true) {
            self.save(
              save_to_form.find('input').val(),
              function(success) { self._modalSaveTo.modal('hide'); }
            );
          }
          save_to_form.addClass('was-validated');
        });

        self._modalSaveTo.on('show.bs.modal', function (event) {
            var event_fn = function(event2) {
                save_to_file.val($(this).text().trim()).change();
            };
            self._populateFileList(save_to_list, event_fn);
        });
    };


    self._setupLoadFromModal = function() {
        self._modalLoadFrom = $('#load_from');
        var load_from_list = self._modalLoadFrom.find('.dropbox-file-list');

        self._modalLoadFrom.on('show.bs.modal', function (event) {
            var event_fn = function(event2) {
                self.load($(this).text().trim(), function(success) {
                    self._modalLoadFrom.modal('hide');
                });
            };
            self._populateFileList(load_from_list, event_fn);
        });
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
        self._setupSaveToModal();
        self._setupLoadFromModal();
    };

    self.updateHier = function() {
        self._allControls().each(function (idx, obj) {
            self.data.set($(obj).data('dd-path'), $(obj).val());
        });
    };

    self.updateForm = function() {
        var flat_data = self.data.flatten();
        var ctrls = self._allControls();
        for (var path in flat_data) {
            ctrls.filter('[data-dd-path="' + path + '"]').val(flat_data[path]);
        }
    };

    self._populateFileList = function(obj, file_click_event) {
        obj = $(obj);
        obj.empty();
        $('<i class="fa fa-refresh fa-spin"></i>').appendTo(obj);
        self.dropBox.filesListFolder({path: ''})
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

    self.save = function(name, post_action=null) {
        self.updateHier();
        self.dropBox.filesUpload({
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
                self.notify('danger', 'Impossibile salvare su DropBox.');
                if (post_action) {
                    post_action(false);
                }
            });
    };

    self.load = function(name, post_action=null) {
        self.dropBox.filesDownload({path: '/' + name})
            .then(function (response) {
                var blob = response.fileBlob;
                var reader = new FileReader();
                reader.addEventListener('loadend', function() {
                    self.data.load(reader.result);
                    self.updateForm();
                    self.notify('success', 'Caricato \'' + name + '\' da DropBox.');
                    if (post_action) {
                        post_action(true);
                    }
                });
                reader.readAsText(blob);
            })
            .catch(function (error) {
                self.notify('danger', 'Impossibile leggere da DropBox.');
                if (post_action) {
                    post_action(false);
                }
            });
    };

};