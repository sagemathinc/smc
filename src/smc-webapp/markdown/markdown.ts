/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as MarkdownIt from "markdown-it";
import * as emojiPlugin from "markdown-it-emoji";
import { checkboxPlugin } from "./checkbox-plugin";
import { hashtagPlugin } from "./hashtag-plugin";
import { mentionPlugin } from "./mentions-plugin";

const MarkdownItFrontMatter = require("markdown-it-front-matter");
import { math_escape, math_unescape } from "smc-util/markdown-utils";
import { remove_math, replace_math } from "smc-util/mathjax-utils"; // from project Jupyter

export const OPTIONS: MarkdownIt.Options = {
  html: true,
  typographer: false,
  linkify: true,
  breaks: false, // breaks=true is NOT liked by many devs.
};

const PLUGINS = [emojiPlugin, checkboxPlugin, hashtagPlugin, mentionPlugin];
const PLUGINS_NO_HASHTAGS = [emojiPlugin, checkboxPlugin, mentionPlugin];

function usePlugins(m, plugins) {
  for (const plugin of plugins) {
    m.use(plugin);
  }
}

export const markdown_it = new MarkdownIt(OPTIONS);
usePlugins(markdown_it, PLUGINS);

/*
export function markdownParser() {
  const m = new MarkdownIt(OPTIONS);
  usePlugins(m, PLUGINS);
  return m;
}*/

/*
Inject line numbers for sync.
 - We track only headings and paragraphs, at any level.
 - TODO Footnotes content causes jumps. Level limit filters it automatically.

See https://github.com/digitalmoksha/markdown-it-inject-linenumbers/blob/master/index.js
*/
function inject_linenumbers_plugin(md) {
  function injectLineNumbers(tokens, idx, options, env, slf) {
    if (tokens[idx].map) {
      const line = tokens[idx].map[0];
      tokens[idx].attrJoin("class", "source-line");
      tokens[idx].attrSet("data-source-line", String(line));
    }
    return slf.renderToken(tokens, idx, options, env, slf);
  }

  md.renderer.rules.paragraph_open = injectLineNumbers;
  md.renderer.rules.heading_open = injectLineNumbers;
  md.renderer.rules.list_item_open = injectLineNumbers;
  md.renderer.rules.table_open = injectLineNumbers;
}
const markdown_it_line_numbers = new MarkdownIt(OPTIONS);
markdown_it_line_numbers.use(inject_linenumbers_plugin);
usePlugins(markdown_it_line_numbers, PLUGINS);

/*
Turn the given markdown *string* into an HTML *string*.
We heuristically try to remove and put back the math via
remove_math, so that markdown itself doesn't
mangle it too much before Mathjax/Katex finally see it.
Note that remove_math is NOT perfect, e.g., it messes up

<a href="http://abc" class="foo-$">test $</a>

However, at least it is based on code in Jupyter classical,
so agrees with them, so people are used it it as a "standard".

See https://github.com/sagemathinc/cocalc/issues/2863
for another example where remove_math is annoying.
*/

export interface MD2html {
  html: string;
  frontmatter: string;
}

interface Options {
  line_numbers?: boolean; // if given, embed extra line number info useful for inverse/forward search.
  no_hashtags?: boolean; // if given, do not specially process hashtags with the plugin
  processMath?: (string) => string; // if given, apply this function to all the math
}

function process(
  markdown_string: string,
  mode: "default" | "frontmatter",
  options?: Options
): MD2html {
  let text: string;
  let math: string[];
  [text, math] = remove_math(math_escape(markdown_string));
  if (options?.processMath != null) {
    for (let i = 0; i < math.length; i++) {
      math[i] = options.processMath(math[i]);
    }
  }

  let html: string;
  let frontmatter = "";

  // avoid instantiating a new markdown object for normal md processing
  if (mode == "frontmatter") {
    const md_frontmatter = new MarkdownIt(OPTIONS).use(
      MarkdownItFrontMatter,
      (fm) => {
        frontmatter = fm;
      }
    );
    html = md_frontmatter.render(text);
  } else {
    if (options?.no_hashtags) {
      html = markdown_it_no_hashtags.render(text);
    } else if (options?.line_numbers) {
      html = markdown_it_line_numbers.render(text);
    } else {
      html = markdown_it.render(text);
    }
  }

  // console.log(3, JSON.stringify(html));
  // Substitute processed math back in.
  html = replace_math(html, math);
  // console.log(4, JSON.stringify(html));
  html = math_unescape(html);
  // console.log(5, JSON.stringify(html));
  return { html, frontmatter };
}

export function markdown_to_html_frontmatter(s: string): MD2html {
  return process(s, "frontmatter");
}

// This is needed right now for todo list (*ONLY* because they use an
// old approach to parsing hashtags).
const markdown_it_no_hashtags = new MarkdownIt(OPTIONS);
usePlugins(markdown_it, PLUGINS_NO_HASHTAGS);

export function markdown_to_html(s: string, options?: Options): string {
  return process(s, "default", options).html;
}
