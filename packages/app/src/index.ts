import { viteMockServe } from 'vite-plugin-mock';

import AppCore from './appCore';

import type { PluginConfig } from './types';
import type { MockMethod } from 'vite-plugin-mock';

export default function (config: PluginConfig) {
  return [
    config.mock
      ? viteMockServe({
          mockPath: 'mock',
          logger: !!config.debug
        })
      : null,
    AppCore(config)
  ];
}

export type { MockMethod };
