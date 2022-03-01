import deepmerge = require('deepmerge');
import chalk from 'chalk';
import type { WebpackOptionsNormalized } from 'webpack';
import type WebpackDevServer from 'webpack-dev-server';

import log = require('../utils/log');
import prepareURLs = require('../utils/prepareURLs');
import webpackStats from '../utils/webpackStats';
import type { ITaskConfig } from '../core/Context';
import type Context from '../core/Context';
import type { IRunOptions } from '../types';

type DevServerConfig = Record<string, any>;

export = async function (context: Context, options?: IRunOptions): Promise<void | ITaskConfig[] | WebpackDevServer> {
  const { eject } = options || {};
  const configArr = context.getWebpackConfig();
  const { command, commandArgs, webpack, applyHook } = context;
  await applyHook(`before.${command}.load`, { args: commandArgs, webpackConfig: configArr });
  // eject config
  if (eject) {
    return configArr;
  }

  if (!configArr.length) {
    const errorMsg = 'No webpack config found.';
    log.warn('CONFIG', errorMsg);
    await applyHook(`error`, { err: new Error(errorMsg) });
    return;
  }

  let serverUrl = '';
  let devServerConfig: DevServerConfig = {
    port: commandArgs.port || 3333,
    host: commandArgs.host || '0.0.0.0',
    https: commandArgs.https || false
  };

  for (const item of configArr) {
    const { chainConfig } = item;
    const config = chainConfig.toConfig() as WebpackOptionsNormalized;
    if (config.devServer) {
      devServerConfig = deepmerge(devServerConfig, config.devServer);
    }
    // if --port or process.env.PORT has been set, overwrite option port
    if (process.env.USE_CLI_PORT) {
      devServerConfig.port = commandArgs.port;
    }
  }

  const webpackConfig = configArr.map(v => v.chainConfig.toConfig());
  await applyHook(`before.${command}.run`, {
    args: commandArgs,
    config: webpackConfig
  });

  let compiler;
  try {
    compiler = webpack(webpackConfig);
  } catch (err) {
    log.error('CONFIG', chalk.red('Failed to load webpack config.'));
    await applyHook(`error`, { err });
    throw err;
  }
  const protocol = devServerConfig.https ? 'https' : 'http';
  const urls = prepareURLs(protocol, devServerConfig.host, devServerConfig.port);
  serverUrl = urls.localUrlForBrowser;

  let isFirstCompile = true;
  // typeof(stats) is webpack.compilation.MultiStats
  compiler.hooks.done.tap('compileHook', async stats => {
    const isSuccessful = webpackStats({
      urls,
      stats,
      isFirstCompile
    });
    if (isSuccessful) {
      isFirstCompile = false;
    }
    await applyHook(`after.${command}.compile`, {
      url: serverUrl,
      urls,
      isFirstCompile,
      stats
    });
  });

  let devServer: WebpackDevServer;
  // require webpack-dev-server after context setup
  // context may hijack webpack resolve
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DevServer = require('webpack-dev-server');

  // static method getFreePort in v4
  if (DevServer.getFreePort) {
    devServer = new DevServer(devServerConfig, compiler);
  } else {
    devServer = new DevServer(compiler, devServerConfig);
  }

  await applyHook(`before.${command}.devServer`, {
    url: serverUrl,
    urls,
    devServer
  });
  if (devServer.startCallback) {
    devServer.startCallback(() => {
      applyHook(`after.${command}.devServer`, {
        url: serverUrl,
        urls,
        devServer
      });
    });
  } else {
    devServer.listen(devServerConfig.port, devServerConfig.host, async (err: Error) => {
      if (err) {
        log.info('WEBPACK', chalk.red('[ERR]: Failed to start webpack dev server'));
        log.error('WEBPACK', err.stack || err.toString());
      }
      await applyHook(`after.${command}.devServer`, {
        url: serverUrl,
        urls,
        devServer,
        err
      });
    });
  }

  return devServer;
};
