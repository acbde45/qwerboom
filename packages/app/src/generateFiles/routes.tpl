{{ #dynamic }}
{{ /dynamic }}
{{ #modules }}
import {{ name }} from '{{{ path }}}';
{{ /modules }}

export default function getRoutes() {
  const routes = {{{ routes }}};
  return routes;
}
