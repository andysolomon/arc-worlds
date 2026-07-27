import { useEffect, useRef } from 'react'
import { PlanetViewport } from '../engine/viewport'
import type { PlanetParams } from '../engine/types'

interface Props {
  params: PlanetParams
  /** Bumping this number triggers a spectrometer sweep. */
  scanNonce?: number
  /** Bumping this number re-frames the camera. */
  resetNonce?: number
  onPick?: (index: number) => void
}

/**
 * React wrapper around the Three.js viewport.
 *
 * The engine owns its own animation loop and GPU resources, so it is created
 * once on mount and fed params imperatively — re-rendering React must never
 * rebuild the scene.
 */
export function Viewport({ params, scanNonce = 0, resetNonce = 0, onPick }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<PlanetViewport | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  useEffect(() => {
    if (!host.current) return
    const v = new PlanetViewport(host.current)
    v.onPick = (i) => pickRef.current?.(i)
    engine.current = v
    return () => {
      v.dispose()
      engine.current = null
    }
  }, [])

  useEffect(() => {
    engine.current?.setParams(params)
  }, [params])

  useEffect(() => {
    if (scanNonce > 0) engine.current?.scan(2000)
  }, [scanNonce])

  useEffect(() => {
    if (resetNonce > 0) engine.current?.resetView()
  }, [resetNonce])

  return <div ref={host} style={{ width: '100%', height: '100%' }} />
}
