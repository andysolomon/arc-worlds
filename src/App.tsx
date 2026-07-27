import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MilkyWayPanel } from './components/MilkyWayPanel'
import { ScanPanel } from './components/ScanPanel'
import { SculptPanel } from './components/SculptPanel'
import { Viewport } from './components/Viewport'
import { WorldsPanel } from './components/WorldsPanel'
import { PRESETS, SOLAR, typeOf } from './data/presets'
import { DEFAULT_PARAMS, sanitize, surprise } from './lib/params'
import { computeScan, type ScanResult } from './lib/scan'
import { getWorld, listWorlds, saveWorld, type SavedWorld } from './lib/api'
import type { PlanetParams, PresetKey } from './engine/types'
import './styles.css'

type Tab = 'sculpt' | 'scan' | 'solar' | 'worlds'

const TABS: Array<[Tab, string]> = [
  ['sculpt', 'Sculpt'],
  ['scan', 'Scan'],
  ['solar', 'Milky Way'],
  ['worlds', 'Worlds'],
]

const SPEEDS: Array<[number, string]> = [
  [0, 'Pause'],
  [0.5, '½×'],
  [1, '1×'],
  [4, '4×'],
  [20, '20×'],
]

/** Read a world slug out of /w/:slug, if we were opened via a share link. */
function slugFromLocation(): string | null {
  const m = /^\/w\/([A-Za-z0-9_-]{3,64})$/.exec(window.location.pathname)
  return m ? m[1] : null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('sculpt')
  const [name, setName] = useState('Peachmoss')
  const [params, setParams] = useState<PlanetParams>(DEFAULT_PARAMS)
  const [view, setView] = useState<'single' | 'system'>('single')
  const [sizeMode, setSizeMode] = useState<'same' | 'scale'>('same')
  const [timeScale, setTimeScale] = useState(1)

  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanNonce, setScanNonce] = useState(0)
  const [resetNonce, setResetNonce] = useState(0)

  const [worlds, setWorlds] = useState<SavedWorld[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const scanTimer = useRef<number | null>(null)

  // Params handed to the engine. `view` and `timeScale` are render concerns,
  // not part of the world's identity, so they are merged in only here.
  const enginePar = useMemo<PlanetParams>(
    () => ({
      ...params,
      mode: view === 'system' ? 'system' : 'single',
      sizeMode,
      timeScale,
      autoRotate: timeScale > 0,
    }),
    [params, view, sizeMode, timeScale],
  )

  /* --- share links ------------------------------------------------------ */

  useEffect(() => {
    const slug = slugFromLocation()
    if (!slug) return
    getWorld(slug)
      .then((w) => {
        setParams(sanitize(w.params))
        setName(w.name)
        setSavedSlug(w.slug)
      })
      .catch(() => {
        // A dead link should still leave a usable app.
        window.history.replaceState(null, '', '/')
      })
  }, [])

  /* --- gallery ---------------------------------------------------------- */

  const refreshGallery = useCallback(() => {
    setGalleryLoading(true)
    setGalleryError(null)
    listWorlds()
      .then(setWorlds)
      .catch((e: Error) => setGalleryError(e.message))
      .finally(() => setGalleryLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'worlds') refreshGallery()
  }, [tab, refreshGallery])

  /* --- editing ---------------------------------------------------------- */

  const setParam = useCallback(<K extends keyof PlanetParams>(k: K, v: PlanetParams[K]) => {
    // Changing the seed means this is no longer the real planet, so drop its
    // photographic map and fall back to procedural terrain.
    setParams((s) => ({ ...s, [k]: v, ...(k === 'seed' ? { texture: null, cloudTexture: null } : null) }))
    setScan(null)
    setSavedSlug(null)
  }, [])

  const applyPreset = useCallback((key: PresetKey) => {
    const p = PRESETS.find((x) => x.key === key)
    setParams((s) => ({ ...s, ...(p?.def ?? {}), preset: key, texture: null, cloudTexture: null }))
    setScan(null)
    setSavedSlug(null)
  }, [])

  const reshape = useCallback(() => {
    setParams((s) => ({ ...s, texture: null, cloudTexture: null }))
    setScan(null)
  }, [])

  const onSurprise = useCallback(() => {
    const { params: next, name: nextName } = surprise()
    setParams(next)
    setName(nextName)
    setScan(null)
    setSavedSlug(null)
    setView('single')
    setTab('sculpt')
  }, [])

  const visitSolar = useCallback((i: number) => {
    const s = SOLAR[i]
    if (!s) return
    setParams((prev) => sanitize({ ...prev, ...s.params, preset: s.key }))
    setName(s.name)
    setScan(null)
    setSavedSlug(null)
    setView('single')
    setTab('sculpt')
  }, [])

  /* --- scan ------------------------------------------------------------- */

  const runScan = useCallback(() => {
    if (scanning) return
    setScanning(true)
    setScan(null)
    setScanNonce((n) => n + 1)
    if (scanTimer.current) window.clearTimeout(scanTimer.current)
    scanTimer.current = window.setTimeout(() => {
      setScan(computeScan(params))
      setScanning(false)
    }, 2100)
  }, [scanning, params])

  useEffect(
    () => () => {
      if (scanTimer.current) window.clearTimeout(scanTimer.current)
    },
    [],
  )

  /* --- saving ----------------------------------------------------------- */

  const onSave = useCallback(async () => {
    setSaving(true)
    try {
      const w = await saveWorld(name.trim() || 'Untitled world', params)
      setSavedSlug(w.slug)
      window.history.replaceState(null, '', `/w/${w.slug}`)
      try {
        await navigator.clipboard?.writeText(`${window.location.origin}/w/${w.slug}`)
      } catch {
        // Clipboard permission is not essential — the URL bar already updated.
      }
      setWorlds((prev) => [w, ...prev.filter((x) => x.slug !== w.slug)])
    } catch (e) {
      setGalleryError((e as Error).message)
      setTab('worlds')
    } finally {
      setSaving(false)
    }
  }, [name, params])

  const openWorld = useCallback((w: SavedWorld) => {
    setParams(sanitize(w.params))
    setName(w.name)
    setSavedSlug(w.slug)
    setView('single')
    setTab('sculpt')
    window.history.replaceState(null, '', `/w/${w.slug}`)
  }, [])

  const copyLink = useCallback((w: SavedWorld) => {
    navigator.clipboard
      ?.writeText(`${window.location.origin}/w/${w.slug}`)
      .then(() => {
        setCopiedSlug(w.slug)
        window.setTimeout(() => setCopiedSlug(null), 1600)
      })
      .catch(() => {})
  }, [])

  /* --- render ----------------------------------------------------------- */

  const preset = typeOf(params.preset)
  const subtitle =
    view === 'system'
      ? 'click a planet to visit it'
      : `seed ${params.seed} · ${preset.label.toLowerCase()} world`

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <div className="brand-name">Little Worlds</div>
            <div className="brand-sub">sculpt a planet, then see who lives there</div>
          </div>
        </div>
        <button className="btn-surprise" type="button" onClick={onSurprise}>
          Surprise me
        </button>
      </header>

      <div className="main">
        <div className="view">
          <div className="time-bar">
            <span className="lbl">TIME</span>
            {SPEEDS.map(([v, label]) => (
              <button
                key={label}
                className="time-btn"
                data-on={timeScale === v}
                type="button"
                onClick={() => setTimeScale(v)}
              >
                {label}
              </button>
            ))}
          </div>

          <Viewport
            params={enginePar}
            scanNonce={scanNonce}
            resetNonce={resetNonce}
            onPick={visitSolar}
          />

          <div className="view-title">
            <h2>{view === 'system' ? 'The Solar System' : name}</h2>
            <p>{subtitle}</p>
          </div>

          <div className="view-foot">
            <button className="btn-ghost" type="button" onClick={() => setResetNonce((n) => n + 1)}>
              Reset view
            </button>
            <span className="hint">drag to travel · scroll to zoom</span>
          </div>
        </div>

        <aside className="panel">
          <div className="tabs" role="tablist">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                className="tab"
                role="tab"
                aria-selected={tab === k}
                type="button"
                onClick={() => {
                  setTab(k)
                  if (k !== 'solar') setView('single')
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="panel-scroll">
            {tab === 'sculpt' && (
              <SculptPanel
                params={params}
                name={name}
                onName={setName}
                onParam={setParam}
                onPreset={applyPreset}
                onReshape={reshape}
                onSave={onSave}
                saving={saving}
                saved={!!savedSlug}
              />
            )}

            {tab === 'scan' && (
              <ScanPanel worldName={name} scan={scan} scanning={scanning} onScan={runScan} />
            )}

            {tab === 'solar' && (
              <MilkyWayPanel
                view={view}
                sizeMode={sizeMode}
                onView={setView}
                onSizeMode={setSizeMode}
                onVisit={visitSolar}
              />
            )}

            {tab === 'worlds' && (
              <WorldsPanel
                worlds={worlds}
                loading={galleryLoading}
                error={galleryError}
                onOpen={openWorld}
                onCopyLink={copyLink}
                copiedSlug={copiedSlug}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
