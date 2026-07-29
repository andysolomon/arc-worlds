/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { routeFromPath } from './navigation'

describe('routeFromPath', () => {
  it('parses world, system, and canonical planet routes', () => {
    expect(routeFromPath('/w/abc_123')).toEqual({ kind: 'world', slug: 'abc_123' })
    expect(routeFromPath('/s/system-42')).toEqual({ kind: 'system', slug: 'system-42' })
    expect(routeFromPath('/venus')).toEqual({ kind: 'planet', key: 'venus' })
  })

  it('keeps the sculptor for the root and unknown or malformed paths', () => {
    for (const path of ['/', '/mars', '/venus/', '/w/no', '/s/has spaces', '/anything/here']) {
      expect(routeFromPath(path), path).toEqual({ kind: 'sculptor' })
    }
  })
})

describe('production rewrites', () => {
  it('adds only the explicit Venus page alongside existing share routes', () => {
    const config = JSON.parse(
      readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
    ) as { rewrites: Array<{ source: string; destination: string }> }
    expect(config.rewrites).toEqual([
      { source: '/w/:slug', destination: '/index.html' },
      { source: '/s/:slug', destination: '/index.html' },
      { source: '/venus', destination: '/index.html' },
    ])
  })
})
