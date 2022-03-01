import Context from '../core/Context';
import type { IContextOptions } from '../core/Context';
import test = require('./test');

class JestService extends Context {
  constructor(props: IContextOptions) {
    super(props);
    super.registerCommandModules('test', test);
  }
}

export default JestService;
