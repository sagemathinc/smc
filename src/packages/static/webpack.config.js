/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
* Webpack configuration file

See README.md for instructions about how to use this.

---

*# Information for developers

This webpack config file might look scary, but it only consists of a few moving parts.

1. There is the "main" application, which is split into "css", "lib" and "smc":
   1. css: a collection of all static styles from various locations.
      Some css is inserted, but it doesn't work and no styles are applied. In the end,
      it doesn't matter to load it one way or the other. Furthermore, as .js is even better,
      because the initial page load is instant and doesn't require to get the compiled css styles.
   2. lib: this is a compilation of the essential js files in webapp-lib (via webapp-lib.js)
   3. smc: the core smc library.  Besides this, there might also be chunks ([number]-hash.js) that are
      loaded later on demand (read up on `require.ensure`).
      For example, such a chunkfile could hopefully contains latex completions, the data
      for the wizard, etc.

2. There are static html files for the policies.
   The policy files originate in webapp-lib/policies, where at least one file is generated by update_react_static.
   That script runs part of the smc application in node.js to render to html.
   Then, that html output is included into the html page and compiled.
   It's not possible to automate this fully, because during the processing of these templates,
   the "css" chunk from point 1.1 above is injected, too.
   In the future, also other elements from the website (e.g. <Footer/>) will be rendered as
   separate static html template elements and included there.

The remaining configuration deals with setting up variables.

Development vs. Production: There are two variables DEVMODE and PRODMODE.
* PRODMODE:
  * additional compression is enabled (do *not* add the -p switch
    to webpack, that's done here explicitly!)
  * all output filenames, except for the essential .html files,
    do have hashes and a rather flat hierarchy.
* DEVMODE:
  * File names have no hashes, or hashes are deterministically based on the content.
    This means, when running webpack-watch, you do not end up with a growing pile of
    thousands of files in the output directory.

*/

"use strict";

let entries, hashname, MATHJAX_URL, output_fn;
const _ = require("lodash");
const webpack = require("webpack");
const path = require("path");
const fs = require("fs");
const glob = require("glob");
const child_process = require("child_process");
const misc = require("smc-util/misc");
const misc_node = require("smc-util-node/misc_node");
const async = require("async");
const program = require("commander");

const SMC_VERSION = require("smc-util/smc-version").version;
const theme = require("smc-util/theme");
const CDN_VERSIONS = require("@cocalc/cdn").versions;

const plugins = [];
function registerPlugin(desc, plugin, disable) {
  if (disable) {
    console.log("Disabling plugin:  ", desc);
    return;
  }
  console.log("Registering plugin:", desc);
  plugins.push(plugin);
}

const git_head = child_process.execSync("git rev-parse HEAD");
const COCALC_GIT_REVISION = git_head.toString().trim();
const TITLE = theme.SITE_NAME;
const DESCRIPTION = theme.APP_TAGLINE;
const SMC_REPO = "https://github.com/sagemathinc/cocalc";
const SMC_LICENSE = "AGPLv3";
const { WEBAPP_LIB } = misc_node;
const INPUT = path.resolve(__dirname, "node_modules", WEBAPP_LIB);
const OUTPUT = path.resolve(__dirname, "dist");
const NODE_ENV = process.env.NODE_ENV || "development";
const { NODE_DEBUG } = process.env;
const PRODMODE = NODE_ENV == "production";
const COMP_ENV =
  (process.env.CC_COMP_ENV || PRODMODE) &&
  fs.existsSync("webapp-lib/compute-components.json");
const COMMERCIAL = !!COMP_ENV; // assume to be in the commercial setup, if we show the compute environment
const DEVMODE = !PRODMODE;
const { MEASURE } = process.env;
const SOURCE_MAP = !!process.env.SOURCE_MAP;
const date = new Date();
const BUILD_DATE = date.toISOString();
const BUILD_TS = date.getTime();
const { GOOGLE_ANALYTICS } = misc_node;
const CC_NOCLEAN = !!process.env.CC_NOCLEAN;

// The regexp removes the trailing slash, if there is one.
const BASE_URL = (process.env.COCALC_BASE_URL
  ? process.env.COCALC_BASE_URL
  : misc_node.BASE_URL
).replace(/\/$/, "");

// output build environment variables of webpack
console.log(`SMC_VERSION         = ${SMC_VERSION}`);
console.log(`COCALC_GIT_REVISION = ${COCALC_GIT_REVISION}`);
console.log(`NODE_ENV            = ${NODE_ENV}`);
console.log(`NODE_DEBUG          = ${NODE_DEBUG}`);
console.log(`COMP_ENV            = ${COMP_ENV}`);
console.log(`BASE_URL            = ${BASE_URL}`);
console.log(`MEASURE             = ${MEASURE}`);
console.log(`INPUT               = ${INPUT}`);
console.log(`OUTPUT              = ${OUTPUT}`);
console.log(`GOOGLE_ANALYTICS    = ${GOOGLE_ANALYTICS}`);
console.log(`CC_NOCLEAN          = ${CC_NOCLEAN}`);
console.log(`SOURCE_MAP          = ${SOURCE_MAP}`);

({ MATHJAX_URL } = misc_node); // from where the files are served
const { MATHJAX_ROOT } = misc_node; // where the symlink originates
const { MATHJAX_LIB } = misc_node; // where the symlink points to
console.log(`MATHJAX_URL      = ${MATHJAX_URL}`);
console.log(`MATHJAX_ROOT     = ${MATHJAX_ROOT}`);
console.log(`MATHJAX_LIB      = ${MATHJAX_LIB}`);

// TODO: NO - this utterly breaks modularity/packaging...
/*
// fallback case: if COMP_ENV is false (default) we still need empty json files to satisfy the webpack dependencies
if (!COMP_ENV) {
  for (let fn of [
    "webapp-lib/compute-components.json",
    "webapp-lib/compute-inventory.json",
  ]) {
    if (fs.existsSync(fn)) {
      continue;
    }
    fs.writeFileSync(fn, "{}");
  }
}
*/

// adds a banner to each compiled and minified source .js file
// webpack2: https://webpack.js.org/guides/migrating/#bannerplugin-breaking-change
registerPlugin(
  "BannerPlugin -- adds banner to each compiled source .js file",
  new webpack.BannerPlugin({
    banner: `\
This file is part of ${TITLE}.
It was compiled ${BUILD_DATE} at revision ${COCALC_GIT_REVISION} and version ${SMC_VERSION}.
See ${SMC_REPO} for its ${SMC_LICENSE} code.\
`,
    entryOnly: true,
  })
);

// webpack plugin to do the linking after it's "done"
class MathjaxVersionedSymlink {
  apply(compiler) {
    // make absolute path to the mathjax lib (lives in node_module
    // of smc-webapp)
    const symto = path.resolve(__dirname, `${MATHJAX_LIB}`);
    console.log(`mathjax symlink: pointing to ${symto}`);
    const mksymlink = (dir, cb) =>
      fs.access(dir, function (err) {
        if (err) {
          fs.symlink(symto, dir, cb);
        }
      });
    const done = (compilation) =>
      async.concat([MATHJAX_ROOT, misc_node.MATHJAX_NOVERS], mksymlink);
    const plugin = { name: "MathjaxVersionedSymlink" };
    compiler.hooks.done.tap(plugin, done);
  }
}

registerPlugin(
  "MathjaxVersionedSymlink -- creates mathjax symlinks",
  new MathjaxVersionedSymlink(),
  true
);

if (!CC_NOCLEAN) {
  // cleanup like "make distclean".
  // otherwise, compiles create an evergrowing pile of files
  const { CleanWebpackPlugin } = require("clean-webpack-plugin");
  registerPlugin(
    "CleanWebpackPlugin -- cleanup generated dist directory to save space",
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: [OUTPUT],
      verbose: true,
      dry: false,
    })
  );
}

// assets.json file
const AssetsPlugin = require("assets-webpack-plugin");
registerPlugin(
  "AssetsPlugin -- create assets.json file",
  new AssetsPlugin({
    path: OUTPUT,
    filename: "assets.json",
    fullPath: false,
    prettyPrint: true,
    metadata: {
      git_ref: COCALC_GIT_REVISION,
      version: SMC_VERSION,
      built: BUILD_DATE,
      timestamp: BUILD_TS,
    },
  })
);

// https://www.npmjs.com/package/html-webpack-plugin
const HtmlWebpackPlugin = require("html-webpack-plugin");
// we need our own chunk sorter, because just by dependency doesn't work
// this way, we can be 100% sure
function chunksSortMode(a, b) {
  const order = ["load", "css", "fill", "smc"];
  try {
    if (order.indexOf(a) < order.indexOf(b)) {
      return -1;
    } else {
      return 1;
    }
  } catch (err) {
    console.log("WARNING in smcChunkSorter", err);
    return -1;
  }
}

registerPlugin(
  "HTML -- generates the app.html file",
  new HtmlWebpackPlugin({
    filename: "app.html",
    template: "src/app.html",
    chunksSortMode,
    hash: PRODMODE,
  })
);

// global css loader configuration
const cssConfig = JSON.stringify({
  sourceMap: false,
});

// Tthis is like C's #ifdef for the source code. It is particularly useful in the
// source code of CoCalc's webapp, such that it knows about itself's version and where
// mathjax is. The version&date is shown in the hover-title in the footer (year).
// If any of these are not used, then they get removed.  They are textually
// substituted in when the key identifier on the left is used, hence the
// JSON.stringify of all of them.
registerPlugin(
  "DefinePlugin -- define frontend constants -- versions, modes, dates, etc.",
  new webpack.DefinePlugin({
    "process.env": {
      NODE_ENV: JSON.stringify(NODE_ENV),
    },
    MATHJAX_URL: JSON.stringify(MATHJAX_URL),
    SMC_VERSION: JSON.stringify(SMC_VERSION),
    COCALC_GIT_REVISION: JSON.stringify(COCALC_GIT_REVISION),
    BUILD_DATE: JSON.stringify(BUILD_DATE),
    BUILD_TS: JSON.stringify(BUILD_TS),
    DEBUG: JSON.stringify(!PRODMODE),
    BASE_URL: JSON.stringify(BASE_URL),
    CDN_VERSIONS: JSON.stringify(CDN_VERSIONS),
  })
);

// Writes a JSON file containing the main webpack-assets and their filenames.
const { StatsWriterPlugin } = require("webpack-stats-plugin");
registerPlugin(
  "StatsWriterPlugin -- write json file with webpack assets",
  new StatsWriterPlugin({
    filename: "webpack-stats.json",
  })
);

// https://webpack.js.org/guides/migrating/#uglifyjsplugin-minimize-loaders
registerPlugin(
  "html-minify-loader options -- configure how html loader works",
  new webpack.LoaderOptionsPlugin({
    minimize: true,
    options: {
      "html-minify-loader": {
        empty: true, // KEEP empty attributes
        cdata: true, // KEEP CDATA from scripts
        comments: false,
        removeComments: true,
        minifyJS: true,
        minifyCSS: true,
        collapseWhitespace: true,
        conservativeCollapse: true,
      },
    },
  })
);

// ATTN don't alter or add names here, without changing the sorting function above!
entries = {
  load: "./src/load.tsx",
  css: "./src/webapp-css.js",
  fill: "@babel/polyfill",
  smc: "./src/webapp-cocalc.js",
  "pdf.worker":
    "./node_modules/smc-webapp/node_modules/pdfjs-dist/build/pdf.worker.entry",
};

if (DEVMODE) {
  console.log(`\
*************************************************************************************

    https://cocalc.com${BASE_URL}/app

*************************************************************************************`);
}

// tuning generated filenames and the configs for the aux files loader.
// FIXME this setting isn't picked up properly
if (PRODMODE) {
  hashname = "[sha256:hash:base62:33].cacheme.[ext]"; // don't use base64, it's not recommended for some reason.
} else {
  hashname = "[path][name].nocache.[ext]";
}
const pngconfig = { name: hashname, limit: 16000, mimetype: "image/png" };
const svgconfig = { name: hashname, limit: 16000, mimetype: "image/svg+xml" };
const icoconfig = { name: hashname, mimetype: "image/x-icon" };
const woffconfig = { name: hashname, mimetype: "application/font-woff" };

// This is the path that is encoded in the static files, so it's
// what they reference when grabbing more content.
const publicPath = path.join(BASE_URL, "static") + "/";

if (MEASURE) {
  const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
  registerPlugin(
    "BundleAnalyzerPlugin -- visualize size of webpack output files with an interactive zoomable treemap",
    new BundleAnalyzerPlugin({
      analyzerMode: "static",
    })
  );
}

module.exports = {
  cache: true,

  // https://webpack.js.org/configuration/devtool/#devtool
  // **do** use cheap-module-eval-source-map; it produces too large files, but who cares since we are not
  // using this in production.  DO NOT use 'source-map', which is VERY slow.
  //devtool: SOURCE_MAP ? "#cheap-module-eval-source-map" : undefined,
  devtool: SOURCE_MAP ? "eval" : undefined,

  mode: PRODMODE ? "production" : "development",

  optimization: {
    usedExports: true,
  },

  entry: entries,

  output: {
    path: OUTPUT,
    publicPath,
    filename: PRODMODE ? "[name]-[hash].cacheme.js" : "[name].nocache.js",
    chunkFilename: PRODMODE ? "[id]-[hash].cacheme.js" : "[id].nocache.js",
    hashFunction: "sha256",
  },

  module: {
    rules: [
      { test: /\.coffee$/, loader: "coffee-loader" },
      {
        test: /\.cjsx$/,
        use: [{ loader: "coffee-loader" }, { loader: "cjsx-loader" }],
      },
      { test: [/node_modules\/prom-client\/.*\.js$/], loader: "babel-loader" },
      { test: [/latex-editor\/.*\.jsx?$/], loader: "babel-loader" },
      { test: [/build\/pdf.js$/], loader: "babel-loader" }, // since they messed up their release including Optional Chaining in built files!
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: { transpileOnly: true },
          // NOTE: We must disable typescript checking, since it is way too slow and uses
          // too much RAM.  Instead you must use `tsc --watch` directly in another shell,
          // or an IDE that supports typescript.
        },
      },
      {
        test: /\.less$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 2,
            },
          },
          "postcss-loader",
          `less-loader?${cssConfig}`,
        ],
      },
      {
        test: /\.scss$/i,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 2,
            },
          },
          "postcss-loader",
          `sass-loader?${cssConfig}`,
        ],
      },
      {
        test: /\.sass$/i,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 2,
            },
          },
          "postcss-loader",
          `sass-loader?${cssConfig}`,
        ],
      },
      {
        test: /\.png$/,
        use: [{ loader: "file-loader", options: pngconfig }],
      },
      {
        test: /\.ico$/,
        use: [{ loader: "file-loader", options: icoconfig }],
      },
      {
        test: /\.svg(\?[a-z0-9\.-=]+)?$/,
        use: [{ loader: "url-loader", options: svgconfig }],
      },
      {
        test: /\.(jpg|jpeg|gif)$/,
        use: [{ loader: "file-loader", options: { name: hashname } }],
      },
      {
        test: /\.html$/,
        use: [
          { loader: "raw-loader" },
          {
            loader: "html-minify-loader",
            options: { conservativeCollapse: true },
          },
        ],
      },
      {
        test: /\.txt$/,
        use: [{ loader: "raw-loader" }],
      },
      { test: /\.hbs$/, loader: "handlebars-loader" },
      {
        test: /\.woff(2)?(\?[a-z0-9\.-=]+)?$/,
        use: [{ loader: "url-loader", options: woffconfig }],
      },
      {
        test: /\.ttf(\?[a-z0-9\.-=]+)?$/,
        use: [
          {
            loader: "url-loader",
            options: { limit: 10000, mimetype: "application/octet-stream" },
          },
        ],
      },
      {
        test: /\.eot(\?[a-z0-9\.-=]+)?$/,
        use: [{ loader: "file-loader", options: { name: hashname } }],
      },
      {
        test: /\.css$/i,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
            },
          },
          "postcss-loader",
        ],
      },
      { test: /\.pug$/, loader: "pug-loader" },
      {
        // This rule makes source maps compatible with other modules like smc-util.
        // https://stackoverflow.com/questions/61767538/devtools-failed-to-load-sourcemap-for-webpack-node-modules-js-map-http-e
        test: /\.(j|t)s$/,
        enforce: "pre",
        use: ["source-map-loader"],
      },
    ],
  },

  resolve: {
    alias: {
      // smc-webapp alias so we can write `require("smc-webapp/...")`
      // anywhere in that library:
      "smc-webapp": path.resolve(__dirname, "node_modules", "smc-webapp"),
      // This entities/maps alias is needed due to a weird markdown-it import
      // that webpack 5 won't resolve:
      "entities/maps": path.resolve(
        __dirname,
        "node_modules/entities/lib/maps"
      ),
    },
    // So we can require('file') instead of require('file.coffee'), etc.
    extensions: [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".json",
      ".coffee",
      ".cjsx",
      ".scss",
      ".sass",
    ],
    symlinks: true,
    modules: [
      __dirname,
      path.resolve(__dirname, "node_modules"),
      path.resolve(__dirname, "node_modules", "webapp-lib"),
      path.resolve(__dirname, "node_modules", "webapp-lib/node_modules"),
      path.resolve(__dirname, "node_modules", "smc-util"),
      path.resolve(__dirname, "node_modules", "smc-util/node_modules"),
      path.resolve(__dirname, "node_modules", "smc-webapp"),
      path.resolve(__dirname, "node_modules", "smc-webapp/node_modules"),
    ],
    preferRelative: false /* do not use true: it may workaround some weird cases, but breaks tons of things (e.g., slate) */,
    fallback: {
      stream: require.resolve("stream-browserify"),
      util: require.resolve("util/"),
      path: require.resolve("path-browserify"),
      crypto: require.resolve(
        "crypto-browserify"
      ) /* needed for @phosphor/widgets */,
      assert: require.resolve("assert/"),
    },
  },

  plugins,
};
