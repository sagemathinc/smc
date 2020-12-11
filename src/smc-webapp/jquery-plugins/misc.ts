/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const jQuery = $;
declare var $: any;

$.fn.hasParent = function (p) {
  // Returns a subset of items using jQuery.filter
  return this.filter(function () {
    // Return truthy/falsey based on presence in parent
    // @ts-ignore
    return $(p).find(this).length;
  });
};