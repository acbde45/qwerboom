import { readFileSync } from 'fs';
import { resolve } from 'path';
import Mustache from 'mustache';

import type { Service } from '@qwerboom/core';

export default function generateApp(service: Service) {
  const appTpl = readFileSync(resolve(__dirname, './app.tpl'), 'utf-8');

  service.writeTmpFile({
    path: 'App.vue',
    content: Mustache.render(appTpl, {})
  });
}
