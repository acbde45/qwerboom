import { resolve } from 'path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { Plugin, ResolvedConfig } from 'vite';

import { Service } from '@qwerboom/core';
import { winPath } from '@qwerboom/utils';

import {
  generateRoutes,
  generateMain,
  generateExports,
  getImportAheadModules,
  getImportModules,
  generateApp
} from './generateFiles';
import { exportStatic } from './preset';

import type { PluginConfig } from './types';

export default function pluginFactory(config: PluginConfig): Plugin {
  const { routes } = config;

  const watchers: FSWatcher[] = [];
  let base = '/';
  let service: Service;
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'qwerboom-app',
    config: () => ({
      resolve: {
        alias: [
          {
            find: /@@\/exports$/,
            replacement: winPath(resolve(process.cwd(), './src/.tmp/exports'))
          },
          {
            find: /@qwerboom-app$/,
            replacement: winPath(resolve(process.cwd(), './src/.tmp/main'))
          }
        ]
      }
    }),
    closeBundle: () => {
      // 不关闭会导致编译完成时命令不会自动退出
      watchers.forEach((item) => item.close());

      exportStatic({
        service,
        config
      });
    },
    configResolved: (theResolvedConfig) => {
      resolvedConfig = theResolvedConfig;
      base = resolvedConfig.base;
      service = new Service({
        debug: config.debug,
        cwd: process.cwd(),
        outDir: resolvedConfig.build.outDir,
        routes: routes || [],
        dynamicImport: config.dynamicImport
      });
      generateRoutes(service);
      generateMain({
        ...config,
        service,
        command: resolvedConfig.command
      });
      generateExports(service);
      generateApp(service);

      // ref:
      // https://github.com/paulmillr/chokidar/issues/639
      [
        ...getImportAheadModules(config.globalImport?.aheadModules),
        ...getImportModules(config.globalImport?.modules)
      ]
        .map((item) => winPath(resolve(service.paths.absSrcPath!, item)))
        .forEach((item) => {
          const watcher = chokidar.watch(item);
          watcher
            .on('add', () => {
              generateMain({
                ...config,
                service,
                command: resolvedConfig.command
              });
            })
            .on('unlink', () => {
              generateMain({
                ...config,
                service,
                command: resolvedConfig.command
              });
            });
          watchers.push(watcher);
        });
    }
  };
}
