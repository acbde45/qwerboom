import JestService from '../service/JestService';

export = async function ({ args, rootDir, plugins, getBuiltInPlugins }) {
  const command = 'test';

  const service = new JestService({
    args,
    command,
    rootDir,
    plugins,
    getBuiltInPlugins
  });

  return await service.run({});
};
