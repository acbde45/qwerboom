import { readFileSync } from 'fs';
import { resolve } from 'path';
import glob from 'globby';
import get from 'lodash/get';
import upperFirst from 'lodash/upperFirst';
import Mustache from 'mustache';
import type { ResolvedConfig } from 'vite';

import type { Service } from '@qwerboom/core';

import { getImportAheadModules, getImportModules } from './import';
import type { PluginConfig } from '../types';


function getMockData(service: Service) {
  const mockList = glob.sync(`${service.paths.cwd}/mock/**/*.ts`);
  const imports = mockList.map((item, index) => {
    return `import mock${index} from '${item}'`;
  });
  return [
    `${imports.join('\n')}`,
    `export default [${mockList
      .map((_, index) => `...mock${index}`)
      .join(', ')}];`
  ].join('\n\n');
}

export interface GenerateMainOptions
  extends Pick<ResolvedConfig, 'command'>,
    Pick<PluginConfig, 'mock' | 'globalImport' | 'history'> {
  service: Service;
}

export default function generateMain(options: GenerateMainOptions) {
  const { service, command, mock, globalImport, history } = options;
  const { type = 'web', options: historyOptions = {} } = history || {};
  const customImportAheadModules = get(globalImport, 'aheadModules', []);
  const customImportModules = get(globalImport, 'modules', []);
  const mainTpl = readFileSync(resolve(__dirname, './main.tpl'), 'utf-8');

  const productionEnabled =
    command === 'build' && get(mock, 'productionEnabled') === true;

  if (productionEnabled) {
    const mockFetchTs = readFileSync(
      resolve(__dirname, './mockFetch.tpl'),
      'utf-8'
    );
    const mockTs = readFileSync(resolve(__dirname, './mock.tpl'), 'utf-8');
    service.writeTmpFile({
      path: 'mockModules.ts',
      content: getMockData(service)
    });
    service.writeTmpFile({
      path: 'mockFetch.ts',
      content: mockFetchTs
    });
    service.writeTmpFile({
      path: 'mock.ts',
      content: mockTs
    });
  }

  service.writeTmpFile({
    path: 'main.ts',
    content: Mustache.render(mainTpl, {
      importsAhead: service.dumpGlobalImports(
        getImportAheadModules(customImportAheadModules)
      ),
      imports: service.dumpGlobalImports(getImportModules(customImportModules)),
      entryCodeAhead: productionEnabled
        ? [
            "import mockModules from './mockModules.ts';",
            "import mockFetch from './mockFetch';",
            "import mock from './mock';",
            '\nmockFetch();',
            'mock(mockModules);'
          ].join('\n')
        : null,
      creator: `create${upperFirst(type)}History`,
    })
  });
}
