import { readFileSync } from 'fs';
import { resolve } from 'path';

import Mustache from 'mustache';

import type { Service } from '@qwerboom/core';

export interface GenerateRoutesOptions {
  service: Service;
}

export default function generateRoutes(service: Service) {
  const routesTpl = readFileSync(resolve(__dirname, './routes.tpl'), 'utf-8');

  const moduleMap: Record<string, string> = service.route.resolveRoutes();
  const modules = Object.keys(moduleMap).map((modulePath) => {
    return {
      name: moduleMap[modulePath],
      path: modulePath
    };
  });

  service.writeTmpFile({
    path: 'routes.ts',
    content: Mustache.render(routesTpl, {
      routes: service.route.dumpRoutes({
        postDump: (content) =>
          content.replace(/\"icon\": (\"(.+?)\")/g, (global, m1, m2) => {
            return `"icon": ${m2.replace(/\^/g, '"')}`;
          })
      }),
      dynamic: service.route.dynamicImport,
      modules: !service.route.dynamicImport && modules
    })
  });
}
