function getHierPath(obj) {
    var parents = $(obj).parents('[data-dd-id]');
    var path = [];
    if (parents.length > 0) {
        path = $.makeArray(
            parents.map(function(i, item) { return $(item).data('dd-id'); })
        ).reverse();
    }
    path.push($(obj).data('dd-id'));
    return path.join('.');
}

function loadHier(hier) {
    $('input[data-dd-path]').each(function (idx, obj) {
        hier.set($(obj).data('dd-path'), $(obj).val());
    });
}

$(function() {
    $('input[data-dd-id]').each(function (idx, obj) {
        $(obj).attr('data-dd-path', getHierPath(obj));
        // TODO bind on change and update the hierarchical object. Or on focus lost
    });
});
