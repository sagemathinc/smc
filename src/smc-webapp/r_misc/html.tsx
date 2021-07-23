/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Set } from "immutable";
import {
  CSS,
  React,
  ReactDOM,
  useEffect,
  useIsMountedRef,
  useRef,
} from "../app-framework";
import { is_share_server } from "./share-server";
import { sanitize_html, sanitize_html_safe } from "../misc-page/sanitize";

declare var $;

export interface Props {
  value?: string;
  style?: CSS;
  auto_render_math?: boolean; // optional -- used to detect and render math
  project_id?: string; // optional -- can be used to improve link handling (e.g., to images)
  file_path?: string; // optional -- ...
  className?: string; // optional class

  /* optional -- default true, if true scripts and unsafe attributes are removed
     from sanitized html WARNING!!! ATTN! false does not work / cannot work!! scripts
     will NEVER be run. See commit 1abcd43bd5fff811b5ffaf7c76cb86a0ad494498, which
     I've reverted, since it breaks katex... and on balance if we can get by with
     other approaches to this problem we should since script is dangerous. See also
     https://github.com/sagemathinc/cocalc/issues/4695
  */
  safeHTML?: boolean;

  // optional function that link/src hrefs are fed through
  href_transform?: (string) => string;

  /* optional function post_hook(elt), which should mutate elt, where elt is
     the jQuery wrapped set that is created (and discarded!) in the course of
     sanitizing input.  Use this as an opportunity to modify the HTML structure
     before it is exported to text and given to react.   Obviously, you can't
     install click handlers here.
  */
  post_hook?: (any) => void;

  // Highlight a list of words (e.g., search results):
  highlight?: Set<string>;

  content_editable?: boolean; // if true, makes rendered HTML contenteditable; otherwise, explicitly set false.

  // If true, after any update to component, force reloading of all images.
  reload_images?: boolean;

  /* If true, after rendering run the smc_image_scaling pluging to handle
     smc-image-scaling= attributes, which are used in smc_sagews to rescale certain
     png images produced by other kernels (e.g., the R kernel). See
     https://github.com/sagemathinc/cocalc/issues/4421. This functionality is NOT
     actually used at all right now, since it doesn't work on the share server
     anyways...
  */
  smc_image_scaling?: boolean;

  // if true, highlight some <code class='language-r'> </code> blocks.
  // this uses a jquery plugin that I wrote that uses codemirror.
  highlight_code?: boolean;

  id?: string;

  // if given, only run mathjax on result of jquery select with this
  // selector and never use katex.
  mathjax_selector?: string;

  onClick?: (event?: any) => void;
  onDoubleClick?: (event?: any) => void;
}

export const HTML: React.FC<Props> = (props) => {
  const isMountedRef = useIsMountedRef();
  const ref = useRef(null);

  function jq(): any {
    if (!isMountedRef.current) return;
    return $(ReactDOM.findDOMNode(ref.current)) as any;
  }

  function update_mathjax(): void {
    if (!isMountedRef.current) {
      // see https://github.com/sagemathinc/cocalc/issues/1689
      return;
    }
    if (!props.auto_render_math) {
      return;
    }
    jq()?.katex();
  }

  function update_highlight(): void {
    if (!isMountedRef.current || props.highlight == null) {
      return;
    }
    // Use jquery-highlight, which is a pretty serious walk of the DOM tree, etc.
    jq()?.highlight(props.highlight.toJS());
  }

  function update_links(): void {
    if (!isMountedRef.current) {
      return;
    }
    jq()?.process_smc_links({
      project_id: props.project_id,
      file_path: props.file_path,
      href_transform: props.href_transform,
    });
  }

  function update_tables(): void {
    if (!isMountedRef.current) {
      return;
    }
    jq()?.find("table").addClass("table");
  }

  function update_images(): void {
    if (!isMountedRef.current) {
      return;
    }
    if (props.reload_images) {
      jq()?.reload_images();
    }
    if (props.smc_image_scaling) {
      jq()?.smc_image_scaling();
    }
  }

  function update_code(): void {
    if (isMountedRef.current && props.highlight_code) {
      // note that the highlight_code plugin might not be defined.
      jq()?.highlight_code?.();
    }
  }

  function do_updates(): void {
    if (is_share_server()) {
      return;
    }
    update_mathjax();
    update_links();
    update_tables();
    update_highlight();
    update_code();
    update_images();
  }

  function update_content(): void {
    if (!isMountedRef.current) {
      return;
    }
    do_updates();
  }

  useEffect(update_content);

  function render_html(): { __html: string } {
    let html;
    if (!props.value) {
      return { __html: "" };
    }

    if (is_share_server()) {
      /* No sanitization at all for share server.  For now we
         have set things up so that the share server is served
         from a different subdomain and user can't sign into it,
         so XSS is not an issue.  Note that the sanitizing
         in the else below (on non-share server) is expensive and
         can crash on "big" documents (e.g., 500K).
      */
      const elt = $("<div>") as any;
      elt.html(props.value);
      if (props.auto_render_math) {
        elt.katex();
      }
      elt.find("table").addClass("table");
      if (props.highlight_code) {
        elt.highlight_code();
      }
      require("smc-webapp/process-links");
      elt.process_smc_links({
        project_id: props.project_id,
        file_path: props.file_path,
        href_transform: props.href_transform,
      });
      html = elt.html();
    } else {
      if (props.safeHTML) {
        html = sanitize_html_safe(props.value, props.post_hook);
      } else {
        html = sanitize_html(props.value, true, true, props.post_hook);
      }
    }

    return { __html: html };
  }

  /* The random key is the whole span (hence the html) does
     get rendered whenever this component is updated.  Otherwise,
     it will NOT re-render except when the value changes.
  */
  if (props.content_editable) {
    return (
      <div
        ref={ref}
        id={props.id}
        contentEditable={true}
        key={Math.random()}
        className={`${props.className ?? ""} cocalc-html-component`}
        dangerouslySetInnerHTML={render_html()}
        style={props.style}
        onClick={props.onClick}
        onDoubleClick={props.onDoubleClick}
      ></div>
    );
  } else {
    return (
      <span
        ref={ref}
        id={props.id}
        contentEditable={false}
        key={Math.random()}
        className={`${props.className ?? ""} cocalc-html-component`}
        dangerouslySetInnerHTML={render_html()}
        style={props.style}
        onClick={props.onClick}
        onDoubleClick={props.onDoubleClick}
      ></span>
    );
  }
};

// this displayName is assumed and USED in the smc-hub/share/mathjax-support
// to identify this component; do NOT change or remove!!
HTML.displayName = "Misc-HTML";

HTML.defaultProps = {
  auto_render_math: true,
  safeHTML: true,
  highlight_code: true,
};
