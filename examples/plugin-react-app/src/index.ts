import path from 'path';
import Config from 'webpack-chain';

const plugin = ({ context, registerTask, onGetWebpackConfig, registerUserConfig }) => {
  const { rootDir } = context;

  registerTask('default', new Config());

  registerUserConfig({
    name: 'entry',
    validation: 'string',
    configWebpack: (config, value, context) => {
      config.entry('index').add(value as string);
    }
  });

  registerUserConfig({
    name: 'outputDir',
    validation: 'string',
    configWebpack: (config, value, context) => {
      config.output.path(path.join(rootDir, value as string));
    }
  });
};

export default plugin;