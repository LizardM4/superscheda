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

import $ from 'jquery';

const Selector = {
  BTN_CUSTOM_CHECK: '.btn-custom-check',
  CHECKBOX        : 'input[type="checkbox"]',
};

$(() => {
  $(Selector.BTN_CUSTOM_CHECK).click((evt) => {
    const $check = $(evt.target)
      .closest(Selector.BTN_CUSTOM_CHECK)
      .find(Selector.CHECKBOX);
    $check.prop('checked', !$check.is(':checked'));
  });
});
