import { useSyncExternalStore } from 'react';

/**
 * Minimal hash router: "#/" = list, "#/doc/<id>" = one document. Two routes didn't justify
 * a router dependency, and hash URLs survive refresh with no server config.
 */
export type Route = { name: 'list' } | { name: 'doc'; id: string };

function parse(hash: string): Route {
  const m = hash.match(/^#\/doc\/([^/]+)$/);
  return m ? { name: 'doc', id: decodeURIComponent(m[1]) } : { name: 'list' };
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => window.location.hash,
  );
  return parse(hash);
}

export function navigate(route: Route) {
  window.location.hash = route.name === 'doc' ? `#/doc/${encodeURIComponent(route.id)}` : '#/';
}
