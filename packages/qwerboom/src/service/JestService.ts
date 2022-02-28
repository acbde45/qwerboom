import Context from '../core/Context';
import test = require('./test');

class JestService extends Context {
  constructor(props) {
    super(props);
    super.registerCommandModules('test', test);
  }
}

export default JestService;
