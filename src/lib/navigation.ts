import { useMemo, useSyncExternalStore } from 'react'

export type PlanetPageKey = 'venus'

export type AppRoute =
  | { kind: 'sculptor' }
  | { kind: 'world'; slug: string }
  | { kind: 'system'; slug: string }
  | { kind: 'planet'; key: PlanetPageKey }

const SHARE_PATH = /^\/([ws])\/([A-Za-z0-9_-]{3,64})$/
const SCULPTOR_ROUTE: AppRoute = { kind: 'sculptor' }

/** Parse the URL without touching browser state, so routing remains easy to verify. */
export function routeFromPath(pathname: string): AppRoute {
  if (pathname === '/venus') return { kind: 'planet', key: 'venus' }
  const share = SHARE_PATH.exec(pathname)
  if (share?.[1] === 'w') return { kind: 'world', slug: share[2] }
  if (share?.[1] === 's') return { kind: 'system', slug: share[2] }
  return SCULPTOR_ROUTE
}

const listeners = new Set<() => void>()
let listening = false

function emitRouteChange() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!listening) {
    window.addEventListener('popstate', emitRouteChange)
    listening = true
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && listening) {
      window.removeEventListener('popstate', emitRouteChange)
      listening = false
    }
  }
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

/** Change an internal URL and notify React immediately; popstate handles history travel. */
export function navigate(to: string, options: { replace?: boolean } = {}) {
  const url = new URL(to, window.location.href)
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href)
    return
  }
  const next = `${url.pathname}${url.search}${url.hash}`
  if (next === currentPath()) return
  const method = options.replace ? 'replaceState' : 'pushState'
  window.history[method](null, '', next)
  emitRouteChange()
}

export function useAppRoute(): AppRoute {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  )
  return useMemo(() => routeFromPath(pathname), [pathname])
}
