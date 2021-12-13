import * as glob from 'glob';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as nsfw from 'nsfw';

import { run } from './fn/shell';

(async () => {
  await run('npm run clean');

  const fileParten = '*/src/**/!(*.ts|*.tsx|*.rs)';
  console.log(`[COPY]: ${fileParten}`);

  const cwd = path.join(__dirname, '../packages');
  const files = glob.sync(fileParten, { cwd, nodir: true });
  const fileSet = new Set();
  for (const file of files) {
    await copyOneFile(file, cwd);
    fileSet.add(path.join(cwd, file));
  }

  const watcher = await nsfw(cwd, (events: nsfw.FileChangeEvent[]) => {
    events.forEach((event: nsfw.FileChangeEvent) => {
      if (
        event.action === nsfw.actions.CREATED ||
        event.action === nsfw.actions.MODIFIED ||
        event.action === nsfw.actions.RENAMED
      ) {
        const filePath = (event as nsfw.RenamedFileEvent).newFile
          ? path.join(event.directory, (event as nsfw.RenamedFileEvent).newFile!)
          : path.join(event.directory, (event as nsfw.GenericFileEvent<nsfw.ActionType>).file!);
        if (fileSet.has(filePath)) {
          console.log('non-ts change detected:', filePath);
          copyOneFile(path.relative(cwd, filePath), cwd);
        }
      }
    });
  });

  watcher.start();

  await run('npx tsc --build ./tsconfig.json -w');
})().catch(e => {
  console.trace(e);
  process.exit(128);
});

async function copyOneFile(file: string, cwd: string): Promise<void> {
  const from = path.join(cwd, file);
  const to = path.join(cwd, file.replace(/\/src\//, '/lib/'));
  await fs.copy(from, to);
}
