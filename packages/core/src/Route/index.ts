import { resolve } from 'path';
import cloneDeep from 'lodash/cloneDeep';
import uniq from 'lodash/uniq';
import { winPath } from '@qwerboom/utils';

import type Service from '../Service';

export interface IRoute {
  component?: string;
  exact?: boolean;
  path?: string;
  children?: IRoute[];
  wrappers?: string[];
  title?: string;
  [key: string]: any;
}

export interface RouteOptions {
  service: Service;
  routes: IRoute[];
  dynamicImport?: {
    loading?: string,
  };
}

export default class Route {
  service: RouteOptions['service'];
  routes: RouteOptions['routes'] = [];
  dynamicImport: RouteOptions['dynamicImport'];

  constructor(options: RouteOptions) {
    this.service = options.service;
    this.routes = options.routes;
    this.dynamicImport = options.dynamicImport;
  }

  /**
   * 解析路由组件配置，得到组件绝对路径和组件别名的映射
   */
  resolveRoutes() {
    const result: Record<string, string> = {};

    let componentCursor = 0;
    let wrapperCursor = 0;
    const resolveRoute = (route: IRoute) => {
      if (route.component && !result[route.component]) {
        route.component = winPath(
          resolve(this.service.paths.absSrcPath!, `${route.component}`)
        );
        result[route.component] = `Component${componentCursor}`;
        componentCursor += 1;
      }
      if (route.wrappers) {
        route.wrappers.forEach((item) => {
          const wrapper = winPath(
            resolve(this.service.paths.absSrcPath!, `${item}`)
          );
          if (!result[wrapper]) {
            result[wrapper] = `Wrapper${wrapperCursor}`;
            wrapperCursor += 1;
          }
        });
      }

      if (route.children) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        loopRoutes(route.children);
      }
    };

    const loopRoutes = (routes: IRoute[]) => {
      routes.forEach(resolveRoute);
    };

    loopRoutes(this.routes);

    return result;
  }

  /**
   * 输出路由配置，可做额外修改
   *
   * @param options
   * @returns
   */
  dumpRoutes(options?: {
    extraReplace?: (route: IRoute) => void;
    postDump?: (content: string) => string;
  }) {
    const { extraReplace, postDump } = options || {};
    const clonedRoutes = cloneDeep(this.routes!);

    let modules: Record<string, string> = {};
    if (!this.dynamicImport) {
      modules = this.resolveRoutes();
    }

    const replaceComponent = (route: IRoute) => {
      if (route.component) {
        route.component = winPath(
          resolve(this.service.paths.absSrcPath!, `${route.component}`)
        );
        if (this.dynamicImport) {
          route.component = `() => import('${route.component}')`;
        } else {
          route.component = modules[route.component];
        }
      }
    };

    const replaceWrappers = (route: IRoute) => {
      if (route.wrappers) {
        route.wrappers = route.wrappers.map((item) => {
          const wrapper = winPath(
            resolve(this.service.paths.absSrcPath!, `${item}`)
          );
          if (this.dynamicImport) {
            return `() => import('${wrapper}')`;
          } else {
            return modules[wrapper];
          }
        });
      }
    };

    function loopRoute(route: IRoute) {
      replaceComponent(route);
      replaceWrappers(route);
      extraReplace?.(route);

      if (route.children) {
        loopRoutes(route.children);
      } else {
        // ref: https://stackoverflow.com/questions/49162311/react-difference-between-route-exact-path-and-route-path
        // 没有子路由时赋值 exact
        route.exact = true;
      }
    }

    function loopRoutes(routes: IRoute[]) {
      routes.forEach(loopRoute);
    }

    loopRoutes(clonedRoutes);

    const result = JSON.stringify(clonedRoutes, null, 2)
      .replace(/\"component\": (\"(.+?)\")/g, (global, m1, m2) => {
        return `"component": ${m2.replace(/\^/g, '"')}`;
      })
      .replace(/\"wrappers\": (\"(.+?)\")/g, (global, m1, m2) => {
        return `"wrappers": ${m2.replace(/\^/g, '"')}`;
      })
      .replace(/\\r\\n/g, '\r\n')
      .replace(/\\n/g, '\r\n');

    return postDump?.(result) || result;
  }

  patchRoutes(setRoutes: IRoute[] | ((routes: IRoute[]) => IRoute[])) {
    if (typeof setRoutes === 'function') {
      this.routes = setRoutes(this.routes);
    } else {
      this.routes = setRoutes;
    }
  }

  getPaths({ routes }: { routes: IRoute[] }): string[] {
    return uniq(
      routes.reduce((memo: string[], route) => {
        let result = [...memo];
        if (route.path) {
          result.push(route.path);
        }
        if (route.children) {
          result = result.concat(this.getPaths({ routes: route.children }));
        }
        return result;
      }, [])
    );
  }
}
