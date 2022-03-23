import { createApp } from 'vue'
import { createRouter, {{{creator}}} } from 'vue-router'

{{ #importsAhead }}
{{{ importsAhead }}}
{{ /importsAhead }}

{{ #imports }}
{{{ imports }}}
{{ /imports }}

import App from "./App";
import getRoutes from './routes';

{{ #entryCodeAhead }}
{{{ entryCodeAhead }}}
{{ /entryCodeAhead }}

const router = createRouter({
  history: {{{creator}}}(),
  routes: getRoutes(),
});

const app = createApp(App);

app.config.errorHandler = (err) => {
  // 处理错误
  console.log(err);
};

app.use(router);

app.mount('#root')
