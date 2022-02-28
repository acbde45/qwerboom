import WebpackService from '../service/WebpackService';

export = async function ({ args, rootDir, eject, plugins, getBuiltInPlugins }) {
  const command = 'build';

  const service = new WebpackService({
    args,
    command,
    rootDir,
    plugins,
    getBuiltInPlugins
  });
  return await service.run({ eject });
};
