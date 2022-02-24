import chalk from 'chalk';
import path from 'path';
import fg from 'fast-glob';
import fs from 'fs-extra';
import * as _ from 'lodash';
import camelCase = require('camelcase');
import deepmerge = require('deepmerge');
import assert = require('assert');

import hijackWebpackResolve from '../utils/hijackWebpack';
import log from '../utils/log';
import loadConfig from '../utils/loadConfig';

const PKG_FILE = 'package.json';
const USER_CONFIG_FILE = ['build.json', 'build.config.(js|ts)'];
const PLUGIN_CONTEXT_KEY = ['command', 'commandArgs', 'rootDir', 'userConfig', 'originalUserConfig', 'pkg', 'webpack'];

const VALIDATION_MAP = {
  string: 'isString' as 'isString',
  number: 'isNumber' as 'isNumber',
  array: 'isArray' as 'isArray',
  object: 'isObject' as 'isObject',
  boolean: 'isBoolean' as 'isBoolean'
};

const BUILTIN_CLI_OPTIONS = [
  { name: 'port', commands: ['start'] },
  { name: 'host', commands: ['start'] },
  { name: 'disableAsk', commands: ['start'] },
  { name: 'config', commands: ['start', 'build', 'test'] }
];

const mergeConfig = <T>(currentValue: T, newValue: T): T => {
  // only merge when currentValue and newValue is object and array
  const isBothArray = Array.isArray(currentValue) && Array.isArray(newValue);
  const isBothObject = _.isPlainObject(currentValue) && _.isPlainObject(newValue);
  if (isBothArray || isBothObject) {
    return deepmerge(currentValue, newValue);
  } else {
    return newValue;
  }
};

class Context {
  public command;

  public commandArgs;

  public commandModules = {};

  public rootDir;

  public userConfig;

  public webpack;

  public plugins;

  public originalUserConfig;

  public pkg;

  private eventHooks = {}; // lifecycle functions

  private options;

  private methodRegistration;

  // 通过registerTask注册，存放初始的webpack-chain配置
  private configArr;

  private cancelTaskNames;

  private modifyConfigFns;

  private modifyJestConfig;

  private modifyConfigRegistrationCallbacks;

  private modifyCliRegistrationCallbacks;

  private internalValue;

  private userConfigRegistration;

  private cliOptionRegistration;

  constructor(options) {
    const { command, rootDir = process.cwd(), args = {} } = options || {};

    this.options = options;
    this.command = command;
    this.commandArgs = args;
    this.rootDir = rootDir;
    /**
     * config array
     * {
     *   name,
     *   chainConfig,
     *   webpackFunctions,
     * }
     */
    this.configArr = [];
    this.modifyConfigFns = [];
    this.modifyJestConfig = [];
    this.modifyConfigRegistrationCallbacks = [];
    this.modifyCliRegistrationCallbacks = [];
    this.eventHooks = {}; // lifecycle functions
    this.internalValue = {}; // internal value shared between plugins
    this.userConfigRegistration = {};
    this.cliOptionRegistration = {};
    this.methodRegistration = {};
    this.cancelTaskNames = [];

    this.pkg = this.getProjectFile(PKG_FILE);
    // register builtin options
    this.registerCliOption(BUILTIN_CLI_OPTIONS);
  }

  private getProjectFile = (fileName: string) => {
    const configPath = path.resolve(this.rootDir, fileName);

    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = fs.readJsonSync(configPath);
      } catch (err) {
        log.info('CONFIG', `Fail to load config file ${configPath}, use empty object`);
      }
    }

    return config;
  };

  public onHook = (key, fn) => {
    if (!Array.isArray(this.eventHooks[key])) {
      this.eventHooks[key] = [];
    }
    this.eventHooks[key].push(fn);
  };

  public applyHook = async (key, opts) => {
    const hooks = this.eventHooks[key] || [];

    for (const fn of hooks) {
      // eslint-disable-next-line no-await-in-loop
      await fn(opts);
    }
  };

  public getCommandModule = options => {
    const { command } = options;
    if (this.commandModules[command]) {
      return this.commandModules[command];
    } else {
      throw new Error(`command ${command} is not support`);
    }
  };

  public registerCommandModules(moduleKey: string, module): void {
    if (this.commandModules[moduleKey]) {
      log.warn('CONFIG', `command module ${moduleKey} already been registered`);
    }
    this.commandModules[moduleKey] = module;
  };

  public getUserConfig = async () => {
    const { config } = this.commandArgs;
    let configPath = '';
    if (config) {
      configPath = path.isAbsolute(config) ? config : path.resolve(this.rootDir, config);
    } else {
      const [defaultUserConfig] = await fg(USER_CONFIG_FILE, {
        cwd: this.rootDir,
        absolute: true
      });
      configPath = defaultUserConfig;
    }
    let userConfig = { plugins: [] };

    if (configPath && fs.existsSync(configPath)) {
      try {
        userConfig = await loadConfig(configPath, log);
      } catch (err) {
        log.info('CONFIG', `Fail to load config file ${configPath}`);
        log.error('CONFIG', err.stack || err.toString());
        process.exit(1);
      }
    } else {
      log.error('CONFIG', `config file${`(${configPath})` || ''} is not exist`);
      process.exit(1);
    }

    return this.mergeModeConfig(userConfig);
  };

  private mergeModeConfig = userConfig => {
    const { mode } = this.commandArgs;
    // modify userConfig by userConfig.modeConfig

    if (userConfig.modeConfig && mode && userConfig.modeConfig[mode]) {
      const { plugins, ...basicConfig } = userConfig.modeConfig[mode];
      const userPlugins = [...userConfig.plugins];
      if (Array.isArray(plugins)) {
        const pluginKeys = userPlugins.map(pluginInfo => {
          return Array.isArray(pluginInfo) ? pluginInfo[0] : pluginInfo;
        });

        plugins.forEach(pluginInfo => {
          const [pluginName] = Array.isArray(pluginInfo) ? pluginInfo : [pluginInfo];
          const pluginIndex = pluginKeys.indexOf(pluginName);
          if (pluginIndex > -1) {
            // overwrite plugin info by modeConfig
            userPlugins[pluginIndex] = pluginInfo;
          } else {
            // push new plugin added by modeConfig
            userPlugins.push(pluginInfo);
          }
        });
      }
      return { ...userConfig, ...basicConfig, plugins: userPlugins };
    }

    return userConfig;
  };

  public resolveConfig = async () => {
    this.userConfig = await this.getUserConfig();
    // shallow copy of userConfig while userConfig may be modified
    this.originalUserConfig = { ...this.userConfig };
    const { plugins = [], getBuiltInPlugins = () => [] } = this.options;
    // run getBuiltInPlugins before resolve webpack while getBuiltInPlugins may add require hook for webpack
    const builtInPlugins = [...plugins, ...getBuiltInPlugins(this.userConfig)];
    // custom webpack
    const webpackInstancePath = this.userConfig.customWebpack
      ? require.resolve('webpack', { paths: [this.rootDir] })
      : 'webpack';
    this.webpack = require(webpackInstancePath);

    if (this.userConfig.customWebpack) {
      hijackWebpackResolve(this.webpack, this.rootDir);
    }
    this.checkPluginValue(builtInPlugins); // check plugins property
    this.plugins = this.resolvePlugins(builtInPlugins);
  };

  private checkPluginValue = (plugins): void => {
    let flag;
    if (!_.isArray(plugins)) {
      flag = false;
    } else {
      flag = plugins.every(v => {
        let correct = _.isArray(v) || _.isString(v) || _.isFunction(v);
        if (correct && _.isArray(v)) {
          correct = _.isString(v[0]);
        }

        return correct;
      });
    }

    if (!flag) {
      throw new Error('plugins did not pass validation');
    }
  };

  private resolvePlugins = builtInPlugins => {
    const userPlugins = [...builtInPlugins, ...(this.userConfig.plugins || [])].map(pluginInfo => {
      let fn;
      if (_.isFunction(pluginInfo)) {
        return {
          fn: pluginInfo,
          options: {}
        };
      }
      const plugins = Array.isArray(pluginInfo) ? pluginInfo : [pluginInfo, undefined];
      const pluginResolveDir = process.env.EXTRA_PLUGIN_DIR
        ? [process.env.EXTRA_PLUGIN_DIR, this.rootDir]
        : [this.rootDir];
      const pluginPath = path.isAbsolute(plugins[0])
        ? plugins[0]
        : require.resolve(plugins[0], { paths: pluginResolveDir });
      const options = plugins[1];

      try {
        fn = require(pluginPath); // eslint-disable-line
      } catch (err) {
        log.error('CONFIG', `Fail to load plugin ${pluginPath}`);
        log.error('CONFIG', err.stack || err.toString());
        process.exit(1);
      }

      return {
        name: plugins[0],
        pluginPath,
        fn: fn.default || fn || ((): void => {}),
        options
      };
    });

    return userPlugins;
  };

  public registerTask = (name, chainConfig) => {
    const exist = this.configArr.find((v): boolean => v.name === name);
    if (!exist) {
      this.configArr.push({
        name,
        chainConfig,
        modifyFunctions: []
      });
    } else {
      throw new Error(`[Error] config '${name}' already exists!`);
    }
  };

  public cancelTask = name => {
    if (this.cancelTaskNames.includes(name)) {
      log.info('TASK', `task ${name} has already been canceled`);
    } else {
      this.cancelTaskNames.push(name);
    }
  };

  public getAllTask = (): string[] => {
    return this.configArr.map(v => v.name);
  };

  public getAllPlugin = (dataKeys = ['pluginPath', 'options', 'name']) => {
    return this.plugins.map(pluginInfo => {
      // filter fn to avoid loop
      return _.pick(pluginInfo, dataKeys);
    });
  };

  public registerMethod = (name, fn, options) => {
    if (this.methodRegistration[name]) {
      throw new Error(`[Error] method '${name}' already registered`);
    } else {
      const registration = [fn, options];
      this.methodRegistration[name] = registration;
    }
  };

  public hasMethod = name => {
    return !!this.methodRegistration[name];
  };

  public applyMethod = (config, ...args) => {
    const [methodName, pluginName] = Array.isArray(config) ? config : [config];
    console.log(methodName, pluginName);
    if (this.methodRegistration[methodName]) {
      const [registerMethod, methodOptions] = this.methodRegistration[methodName];
      if (methodOptions?.pluginName) {
        return registerMethod(pluginName)(...args);
      } else {
        return registerMethod(...args);
      }
    } else {
      throw new Error(`apply unknown method ${methodName}`);
    }
  };

  public onGetWebpackConfig = (...args) => {
    this.modifyConfigFns.push(args);
  };

  public onGetJestConfig = fn => {
    this.modifyJestConfig.push(fn);
  };

  public setValue = (key: string | number, value: any): void => {
    this.internalValue[key] = value;
  };

  public getValue = (key: string | number): any => {
    return this.internalValue[key];
  };

  public registerUserConfig = (args): void => {
    this.registerConfig('userConfig', args);
  };

  public hasRegistration = (name: string, type: 'cliOption' | 'userConfig' = 'userConfig'): boolean => {
    const mappedType = type === 'cliOption' ? 'cliOptionRegistration' : 'userConfigRegistration';
    return Object.keys(this[mappedType] || {}).includes(name);
  };

  public registerCliOption = (args): void => {
    this.registerConfig('cliOption', args, name => {
      return camelCase(name, { pascalCase: false });
    });
  };

  private registerConfig = (type: string, args, parseName?: (name: string) => string): void => {
    const registerKey = `${type}Registration` as 'userConfigRegistration' | 'cliOptionRegistration';
    if (!this[registerKey]) {
      throw new Error(`unknown register type: ${type}, use available types (userConfig or cliOption) instead`);
    }
    const configArr = _.isArray(args) ? args : [args];
    configArr.forEach((conf): void => {
      const confName = parseName ? parseName(conf.name) : conf.name;
      if (this[registerKey][confName]) {
        throw new Error(`${conf.name} already registered in ${type}`);
      }

      this[registerKey][confName] = conf;

      // set default userConfig
      if (
        type === 'userConfig' &&
        _.isUndefined(this.userConfig[confName]) &&
        Object.prototype.hasOwnProperty.call(conf, 'defaultValue')
      ) {
        this.userConfig[confName] = conf.defaultValue;
      }
    });
  };

  public modifyUserConfig = (configKey, value, options) => {
    const errorMsg = 'config plugins is not support to be modified';
    const { deepmerge: mergeInDeep } = options || {};
    if (typeof configKey === 'string') {
      if (configKey === 'plugins') {
        throw new Error(errorMsg);
      }
      const configPath = configKey.split('.');
      const originalValue = _.get(this.userConfig, configPath);
      const newValue = typeof value !== 'function' ? value : value(originalValue);
      _.set(this.userConfig, configPath, mergeInDeep ? mergeConfig(originalValue, newValue) : newValue);
    } else if (typeof configKey === 'function') {
      const modifiedValue = configKey(this.userConfig);
      if (_.isPlainObject(modifiedValue)) {
        if (Object.prototype.hasOwnProperty.call(modifiedValue, 'plugins')) {
          // remove plugins while it is not support to be modified
          log.verbose('[modifyUserConfig]', 'delete plugins of user config while it is not support to be modified');
          delete modifiedValue.plugins;
        }
        Object.keys(modifiedValue).forEach(modifiedConfigKey => {
          const originalValue = this.userConfig[modifiedConfigKey];
          this.userConfig[modifiedConfigKey] = mergeInDeep
            ? mergeConfig(originalValue, modifiedValue[modifiedConfigKey])
            : modifiedValue[modifiedConfigKey];
        });
      } else {
        throw new Error(`modifyUserConfig must return a plain object`);
      }
    }
  };

  public modifyConfigRegistration = (...args) => {
    this.modifyConfigRegistrationCallbacks.push(args);
  };

  public modifyCliRegistration = (...args) => {
    this.modifyCliRegistrationCallbacks.push(args);
  };

  private runPlugins = async () => {
    for (const pluginInfo of this.plugins) {
      const { fn, options, name: pluginName } = pluginInfo;

      const pluginContext = _.pick(this, PLUGIN_CONTEXT_KEY);
      const applyMethod = (methodName, ...args) => {
        return this.applyMethod([methodName, pluginName], ...args);
      };

      const pluginAPI = {
        log,
        context: pluginContext,
        registerTask: this.registerTask,
        getAllTask: this.getAllTask,
        getAllPlugin: this.getAllPlugin,
        cancelTask: this.cancelTask,
        onGetWebpackConfig: this.onGetWebpackConfig,
        onGetJestConfig: this.onGetJestConfig,
        onHook: this.onHook,
        setValue: this.setValue,
        getValue: this.getValue,
        registerUserConfig: this.registerUserConfig,
        hasRegistration: this.hasRegistration,
        registerCliOption: this.registerCliOption,
        registerMethod: this.registerMethod,
        applyMethod,
        hasMethod: this.hasMethod,
        modifyUserConfig: this.modifyUserConfig,
        modifyConfigRegistration: this.modifyConfigRegistration,
        modifyCliRegistration: this.modifyCliRegistration
      };
      // eslint-disable-next-line no-await-in-loop
      await fn(pluginAPI, options);
    }
  };

  private runConfigModification = async (): Promise<void> => {
    const callbackRegistrations = ['modifyConfigRegistrationCallbacks', 'modifyCliRegistrationCallbacks'];
    callbackRegistrations.forEach(registrationKey => {
      const registrations = this[registrationKey];
      registrations.forEach(([name, callback]) => {
        const modifyAll = _.isFunction(name);
        const configRegistrations =
          this[
            registrationKey === 'modifyConfigRegistrationCallbacks' ? 'userConfigRegistration' : 'cliOptionRegistration'
          ];
        if (modifyAll) {
          const modifyFunction = name;
          const modifiedResult = modifyFunction(configRegistrations);
          Object.keys(modifiedResult).forEach(configKey => {
            configRegistrations[configKey] = {
              ...(configRegistrations[configKey] || {}),
              ...modifiedResult[configKey]
            };
          });
        } else if (typeof name === 'string') {
          if (!configRegistrations[name]) {
            throw new Error(`Config key '${name}' is not registered`);
          }
          const configRegistration = configRegistrations[name];
          configRegistrations[name] = {
            ...configRegistration,
            ...callback(configRegistration)
          };
        }
      });
    });
  };

  private runUserConfig = async (): Promise<void> => {
    for (const configInfoKey in this.userConfig) {
      if (!['plugins', 'customWebpack'].includes(configInfoKey)) {
        const configInfo = this.userConfigRegistration[configInfoKey];

        if (!configInfo) {
          throw new Error(`[Config File] Config key '${configInfoKey}' is not supported`);
        }

        const { name, validation, ignoreTasks } = configInfo;
        const configValue = this.userConfig[name];

        if (validation) {
          let validationInfo;
          if (_.isString(validation)) {
            // split validation string
            const supportTypes = validation.split('|');
            const validateResult = supportTypes.some(supportType => {
              const fnName = VALIDATION_MAP[supportType];
              if (!fnName) {
                throw new Error(`validation does not support ${supportType}`);
              }
              return _[fnName](configValue);
            });
            assert(validateResult, `Config ${name} should be ${validation}, but got ${configValue}`);
          } else {
            // eslint-disable-next-line no-await-in-loop
            validationInfo = await validation(configValue);
            assert(validationInfo, `${name} did not pass validation, result: ${validationInfo}`);
          }
        }

        if (configInfo.configWebpack) {
          // eslint-disable-next-line no-await-in-loop
          await this.runConfigWebpack(configInfo.configWebpack, configValue, ignoreTasks);
        }
      }
    }
  };

  private runConfigWebpack = async (fn, configValue, ignoreTasks: string[] | null): Promise<void> => {
    for (const webpackConfigInfo of this.configArr) {
      const taskName = webpackConfigInfo.name;
      let ignoreConfig = false;
      if (Array.isArray(ignoreTasks)) {
        ignoreConfig = ignoreTasks.some(ignoreTask => new RegExp(ignoreTask).exec(taskName));
      }
      if (!ignoreConfig) {
        const userConfigContext = {
          ..._.pick(this, PLUGIN_CONTEXT_KEY),
          taskName
        };
        // eslint-disable-next-line no-await-in-loop
        await fn(webpackConfigInfo.chainConfig, configValue, userConfigContext);
      }
    }
  };

  private runWebpackFunctions = async (): Promise<void> => {
    this.modifyConfigFns.forEach(([name, func]) => {
      const isAll = _.isFunction(name);
      if (isAll) {
        // modify all
        this.configArr.forEach(config => {
          config.modifyFunctions.push(name);
        });
      } else {
        // modify named config
        this.configArr.forEach(config => {
          if (config.name === name) {
            config.modifyFunctions.push(func);
          }
        });
      }
    });

    for (const configInfo of this.configArr) {
      for (const func of configInfo.modifyFunctions) {
        // eslint-disable-next-line no-await-in-loop
        await func(configInfo.chainConfig);
      }
    }
  };

  private runCliOption = async (): Promise<void> => {
    for (const cliOpt in this.commandArgs) {
      // allow all jest option when run command test
      if (this.command !== 'test' || cliOpt !== 'jestArgv') {
        const { commands, name, configWebpack, ignoreTasks } = this.cliOptionRegistration[cliOpt] || {};
        if (!name || !(commands || []).includes(this.command)) {
          throw new Error(`cli option '${cliOpt}' is not supported when run command '${this.command}'`);
        }
        if (configWebpack) {
          // eslint-disable-next-line no-await-in-loop
          await this.runConfigWebpack(configWebpack, this.commandArgs[cliOpt], ignoreTasks);
        }
      }
    }
  };

  public setUp = async () => {
    await this.resolveConfig();
    await this.runPlugins();
    await this.runConfigModification();
    await this.runUserConfig();
    await this.runWebpackFunctions();
    await this.runCliOption();
    // filter webpack config by cancelTaskNames
    this.configArr = this.configArr.filter(config => !this.cancelTaskNames.includes(config.name));
    return this.configArr;
  }

  public getWebpackConfig = () => {
    return this.configArr;
  };

  public run = async (options) => {
    const { command, commandArgs } = this;
    log.verbose('OPTIONS', `${command} cliOptions: ${JSON.stringify(commandArgs, null, 2)}`);
    try {
      await this.setUp();
    } catch (err) {
      log.error('CONFIG', chalk.red('Failed to get config.'));
      await this.applyHook(`error`, { err });
      throw err;
    }
    const commandModule = this.getCommandModule({
      command,
      commandArgs,
      userConfig: this.userConfig
    });
    return commandModule(this, options);
  }
}

export default Context;
