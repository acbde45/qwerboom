import Context from '../core/Context';
import start = require('./start');

class WebpackService extends Context {
  constructor(props) {
    super(props);
    super.registerCommandModules('start', start);
  }
}

export default WebpackService;
