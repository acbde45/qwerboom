import babel from '@rollup/plugin-babel';
import nodeResolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

/** @type {import("rollup").RollupOptions[]} */
function createQwerboom() {
  let SOURCE_DIR = 'packages/create-qwerboom';
  let OUTPUT_DIR = 'build/node_modules/create-qwerboom';

  return [
    {
      external() {
        return true;
      },
      input: `${SOURCE_DIR}/src/create.ts`,
      output: {
        format: 'cjs',
        dir: `${OUTPUT_DIR}/lib`,
        exports: 'default',
      },
      plugins: [
        babel({
          babelHelpers: 'bundled',
          exclude: /node_modules/,
          extensions: ['.ts']
        }),
        nodeResolve({ extensions: ['.ts'] }),
        copy({
          targets: [
            { src: `LICENSE.md`, dest: OUTPUT_DIR },
            { src: `${SOURCE_DIR}/package.json`, dest: OUTPUT_DIR },
            { src: `${SOURCE_DIR}/README.md`, dest: OUTPUT_DIR },
            {
              src: `${SOURCE_DIR}/bin/*`,
              dest: `${OUTPUT_DIR}/bin`
            },
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
  let builds = [...createQwerboom(options)];

  return builds;
}
