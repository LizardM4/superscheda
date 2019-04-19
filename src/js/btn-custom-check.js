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
  BTN_CUSTOM_CHECK    : '.btn-custom-check',
  CHECKBOX            : 'input[type="checkbox"]',
  BTN_GROUP_TOGGLE    : '.btn-group-toggle',
  TOGGLE_ACTIVE_TARGET: 'label'
};

const Classes = {
  ACTIVE: 'active'
};

$(() => {
  $(Selector.BTN_CUSTOM_CHECK).click((evt) => {
    const $check = $(evt.target)
      .closest(Selector.BTN_CUSTOM_CHECK)
      .find(Selector.CHECKBOX);
    $check.prop('checked', !$check.is(':checked'));
  });
});



$(Selector.BTN_GROUP_TOGGLE + ' ' + Selector.CHECKBOX)
.change((evt, ddNode) => {
  // In case of a programmatic change, make sure the "active"
  // class is in sync with the value of the checkbox
  if (!ddNode) {
    return;
  }
  const $check = $(evt.target);
  const $activableTarget = $check.closest(Selector.TOGGLE_ACTIVE_TARGET);
  // Manually toggle the button
  if ($check.is(':checked')) {
    $activableTarget.addClass(Classes.ACTIVE);
  } else {
    $activableTarget.removeClass(Classes.ACTIVE);
  }
});
