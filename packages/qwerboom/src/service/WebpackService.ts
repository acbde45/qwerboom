import Context from '../core/Context';
import start = require('./start');
import build = require('./build');
import type { IContextOptions } from '../core/Context';

class WebpackService extends Context {
  constructor(props: IContextOptions) {
    super(props);
    super.registerCommandModules('start', start);
    super.registerCommandModules('build', build);
  }
}

export default WebpackService;
