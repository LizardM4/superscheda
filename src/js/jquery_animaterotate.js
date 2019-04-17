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

import jQuery from 'jquery';

// https://stackoverflow.com/a/15191130/1749822
jQuery.fn.extend({
    animateRotate: function(angle, duration, easing, complete) {
        const args = $.speed(duration, easing, complete);
        const step = args.step;
        for (let i = 0; i < this.length; i++) {
            const e = this[i];
            args.complete = $.proxy(args.complete, e);
            args.step = (now) => {
                $.style(e, 'transform', 'rotate(' + now + 'deg)');
                if (step) return step.apply(e, arguments);
            };
            $({deg: 0}).animate({deg: angle}, args);
        }
    }
});
