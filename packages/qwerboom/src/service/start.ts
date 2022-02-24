import log = require('../utils/log');

export = async function(context, options) {
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
}
