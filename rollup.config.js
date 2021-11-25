import path from "path";
import babel from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
import copy from "rollup-plugin-copy";

function isBareModuleId(id) {
  return !id.startsWith(".") && !path.isAbsolute(id);
}

let executableBanner = "#!/usr/bin/env node \n";

function createBanner(libraryName, version) {
  return `/**
 * ${libraryName} v${version}
 *
 * Copyright (c) Qwerboom Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */`;
}

function getVersion(sourceDir) {
  return require(`./${sourceDir}/package.json`).version;
}

/** @type {import("rollup").RollupOptions[]} */
function createQwerboom() {
  let SOURCE_DIR = "packages/create-qwerboom";
  let OUTPUT_DIR = "build/node_modules/create-qwerboom";
  let version = getVersion(SOURCE_DIR);

  return [
    {
      external() {
        return true;
      },
      input: `${SOURCE_DIR}/cli.ts`,
      output: {
        format: "cjs",
        dir: OUTPUT_DIR,
        banner: executableBanner + createBanner("create-qwerboom", version)
      },
      plugins: [
        babel({
          babelHelpers: "bundled",
          exclude: /node_modules/,
          extensions: [".ts"]
        }),
        nodeResolve({ extensions: [".ts"] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: OUTPUT_DIR },
            { src: `${SOURCE_DIR}/package.json`, dest: OUTPUT_DIR },
            { src: `${SOURCE_DIR}/README.md`, dest: OUTPUT_DIR },
            {
              src: `${SOURCE_DIR}/templates/*`,
              dest: `${OUTPUT_DIR}/templates`
            }
          ]
        })
      ]
    }
  ];
}

export default function rollup(options) {
  let builds = [
    ...createQwerboom(options),
  ];

  return builds;
}
