import type { ComponentType } from 'react'
import type { PlanetPageKey } from '../lib/navigation'
import { VENUS_CONTENT, type PlanetPageAsset } from './venusContent'

export type { PlanetPageAsset }

export interface PlanetPageDefinition {
  key: PlanetPageKey
  path: `/${PlanetPageKey}`
  title: string
  beatIds: readonly ['veil', 'crush', 'heat-trap', 'missing-water', 'radar-world', 'scan']
  beatTitles: readonly string[]
  assets: readonly PlanetPageAsset[]
  load: () => Promise<{ default: ComponentType }>
}

export const VENUS_PAGE: PlanetPageDefinition = {
  ...VENUS_CONTENT,
  load: () => import('./VenusPage'),
}

export const PLANET_PAGES: readonly PlanetPageDefinition[] = [VENUS_PAGE]

export function planetPageFor(key: PlanetPageKey): PlanetPageDefinition | undefined {
  return PLANET_PAGES.find((page) => page.key === key)
}
