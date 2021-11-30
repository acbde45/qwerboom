import * as path from 'path';
import { execSync } from 'child_process';
import chalkAnimation from 'chalk-animation';
import fse from 'fs-extra';
import inquirer from 'inquirer';
import meow from 'meow';
import { isNil } from 'lodash';

const help = `
  Usage:
    $ npx create-qwerboom [flags...] [<dir>]

  If <dir> is not provided up front you will be prompted for it.

  Flags:
    --help, -h          Show this help message
    --version, -v       Show the version of this script
`;

async function run() {
  let { input, flags, showHelp, showVersion } = meow(help, {
    flags: {
      help: { type: 'boolean', default: false, alias: 'h' },
      version: { type: 'boolean', default: false, alias: 'v' }
    }
  });

  if (flags.help) showHelp();
  if (flags.version) showVersion();

  let anim = chalkAnimation.rainbow(`\nQ W E R B O O M\n`);
  await new Promise(res => setTimeout(res, 1500));
  anim.stop();

  console.log(
    "💿 Welcome to Qwerboom! Let's get you set up with a new project."
  );
  console.log();

  // Figure out the app directory
  let projectDir = path.resolve(
    process.cwd(),
    input.length > 0
      ? input[0]
      : (
          await inquirer.prompt<{ dir: string }>([
            {
              type: 'input',
              name: 'dir',
              message: 'Where would you like to create your app?',
              default: './my-qwerboom-app'
            }
          ])
        ).dir
  );

  let answers = await inquirer.prompt<{
    lang: 'ts' | 'js';
    install: boolean;
  }>([
    {
      name: 'lang',
      type: 'list',
      message: 'TypeScript or JavaScript?',
      choices: [
        { name: 'JavaScript', value: 'js' },
        { name: 'TypeScript', value: 'ts' },
      ],
      default: 'js',
    },
    {
      name: 'install',
      type: 'confirm',
      message: 'Do you want me to run `npm install`?',
      default: false
    }
  ]);

  // Create the app directory
  let relativeProjectDir = path.relative(process.cwd(), projectDir);
  let projectDirIsCurrentDir = relativeProjectDir === '';
  if (!projectDirIsCurrentDir) {
    if (fse.existsSync(projectDir)) {
      console.log(
        `️🚨 Oops, "${relativeProjectDir}" already exists. Please try again with a different directory.`
      );
      process.exit(1);
    } else {
      await fse.mkdir(projectDir);
    }
  }

  // copy the shared template
  let sharedTemplate = path.resolve(
    __dirname,
    'templates',
    `_shared_${answers.lang}`
  );
  await fse.copy(sharedTemplate, projectDir);

  // rename dotfiles
  const dotfiles = [
    '_editorconfig',
    '_eslintignore',
    '_eslintrc.js',
    '_gitignore',
    '_prettierrc.js',
    '_prettierignore',
    '_stylelintignore',
    '_stylelintrc.js',
    '_tsconfig.json',
    '_jsconfig.json'
  ];
  await Promise.all(
    dotfiles
      .map(async (dotfile, index) => {
        const filePath = path.join(projectDir, dotfile);
        if (fse.existsSync(filePath)) {
          const renamedFile =
            index < dotfiles.length - 2
              ? dotfile.replace('_', '.')
              : dotfile.replace('_', '');
          return fse.move(
            path.join(projectDir, dotfile),
            path.join(projectDir, renamedFile)
          );
        }
      })
      .filter(v => !isNil(v))
  );

  if (answers.install) {
    execSync('npm install', { stdio: 'inherit', cwd: projectDir });
  }

  if (projectDirIsCurrentDir) {
    console.log(
      `💿 That's it! Check the README for development and deploy instructions!`
    );
  } else {
    console.log(
      `💿 That's it! \`cd\` into "${path.relative(
        process.cwd(),
        projectDir
      )}" and check the README for development and deploy instructions!`
    );
  }
}

export default async function create() {
  run().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}