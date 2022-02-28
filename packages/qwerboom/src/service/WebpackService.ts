import Context from '../core/Context';
import start = require('./start');
import build = require('./build');

class WebpackService extends Context {
  constructor(props) {
    super(props);
    super.registerCommandModules('start', start);
    super.registerCommandModules('build', build);
  }
}

export default WebpackService;
