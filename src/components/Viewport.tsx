import { useEffect, useRef } from 'react'
import { PlanetViewport } from '../engine/viewport'
import type { PlanetParams, PresetKey, SystemDef } from '../engine/types'

interface Props {
  params: PlanetParams
  /** The system drawn in orbit view. Diffed by the engine, so passing the
   *  same object on every render is free. */
  system: SystemDef
  /** Bumping this number triggers a spectrometer sweep. */
  scanNonce?: number
  /** Bumping this number re-frames the camera. */
  resetNonce?: number
  onPick?: (index: number) => void
  /** A moon that is a world was clicked in the single-world view. */
  onPickMoon?: (world: { preset: PresetKey; seed: number }) => void
  /** Nebula tint: plain CSS behind the transparent canvas, free to the GPU. */
  background?: string
}

/**
 * React wrapper around the Three.js viewport.
 *
 * The engine owns its own animation loop and GPU resources, so it is created
 * once on mount and fed params imperatively — re-rendering React must never
 * rebuild the scene.
 */
export function Viewport({
  params, system, scanNonce = 0, resetNonce = 0, onPick, onPickMoon, background,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<PlanetViewport | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const moonRef = useRef(onPickMoon)
  moonRef.current = onPickMoon

  useEffect(() => {
    if (!host.current) return
    const v = new PlanetViewport(host.current)
    v.onPick = (i) => pickRef.current?.(i)
    v.onPickMoon = (w) => moonRef.current?.(w)
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
    engine.current?.setSystem(system)
  }, [system])

  useEffect(() => {
    if (scanNonce > 0) engine.current?.scan(2000)
  }, [scanNonce])

  useEffect(() => {
    if (resetNonce > 0) engine.current?.resetView()
  }, [resetNonce])

  return (
    <div
      ref={host}
      data-nebula={background ? 'on' : 'off'}
      style={{ width: '100%', height: '100%', background: background || undefined }}
    />
  )
}
