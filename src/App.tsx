import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScanPanel } from './components/ScanPanel'
import { SculptPanel } from './components/SculptPanel'
import { SystemsPanel } from './components/SystemsPanel'
import { Viewport } from './components/Viewport'
import { WorldsPanel } from './components/WorldsPanel'
import { MOONS, PRESETS, SOLAR, typeOf, type AncientWorld } from './data/presets'
import { MILKY_WAY } from './data/systems'
import { parentOf } from './engine/planets'
import {
  loadDisplay, nebulaCss, saveDisplay, type DisplayOptions, type TierChoice,
} from './lib/display'
import { DEFAULT_PARAMS, sanitize, surprise } from './lib/params'
import {
  addMoon, addRolledWorld, addWorld, duplicateBody, sanitizeSystem,
} from './lib/systems'
import { computeScan, type ScanResult } from './lib/scan'
import {
  getSystem, getWorld, listSystems, listWorlds, saveSystem, saveWorld,
  type SavedSystem, type SavedWorld,
} from './lib/api'
import type { PlanetParams, PresetKey, SystemDef } from './engine/types'
import './styles.css'

type Tab = 'sculpt' | 'scan' | 'solar' | 'worlds'

const TABS: Array<[Tab, string]> = [
  ['sculpt', 'Sculpt'],
  ['scan', 'Scan'],
  ['solar', 'Systems'],
  ['worlds', 'Worlds'],
]

const SPEEDS: Array<[number, string]> = [
  [0, 'Pause'],
  [0.5, '½×'],
  [1, '1×'],
  [4, '4×'],
  [20, '20×'],
]

/** Read a share link out of the address bar: /w/:slug for a world, /s/:slug for a system. */
function routeFromLocation(): { kind: 'w' | 's'; slug: string } | null {
  const m = /^\/([ws])\/([A-Za-z0-9_-]{3,64})$/.exec(window.location.pathname)
  return m ? { kind: m[1] as 'w' | 's', slug: m[2] } : null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('sculpt')
  const [name, setName] = useState('Peachmoss')
  const [params, setParams] = useState<PlanetParams>(DEFAULT_PARAMS)
  const [system, setSystem] = useState<SystemDef>(MILKY_WAY)
  const [view, setView] = useState<'single' | 'system'>('single')
  const [sizeMode, setSizeMode] = useState<'same' | 'scale'>('same')
  const [timeScale, setTimeScale] = useState(1)
  const [display, setDisplay] = useState<DisplayOptions>(loadDisplay)

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
  const [addedSlug, setAddedSlug] = useState<string | null>(null)

  const [systems, setSystems] = useState<SavedSystem[]>([])
  const [systemsLoading, setSystemsLoading] = useState(false)
  const [systemsError, setSystemsError] = useState<string | null>(null)
  const [systemSaving, setSystemSaving] = useState(false)
  const [savedSystemSlug, setSavedSystemSlug] = useState<string | null>(null)

  const scanTimer = useRef<number | null>(null)

  // Params handed to the engine. `view`, `timeScale` and the display toggles
  // are render concerns, not part of the world's identity, so they are merged
  // in only here.
  const enginePar = useMemo<PlanetParams>(
    () => ({
      ...params,
      mode: view === 'system' ? 'system' : 'single',
      sizeMode,
      timeScale,
      autoRotate: timeScale > 0,
      showPaths: display.paths,
      showLabels: display.labels,
      showMoons: display.moons,
      tier: display.tier === 'auto' ? undefined : display.tier,
      starDensity: display.starDensity,
      starBright: display.starBright,
      exposure: display.exposure,
    }),
    [params, view, sizeMode, timeScale, display],
  )

  const toggleDisplay = useCallback((k: 'paths' | 'labels' | 'moons') => {
    setDisplay((d) => ({ ...d, [k]: !d[k] }))
  }, [])

  const setTier = useCallback((tier: TierChoice) => {
    setDisplay((d) => ({ ...d, tier }))
  }, [])

  const setDisplayField = useCallback(
    <K extends keyof DisplayOptions>(k: K, v: DisplayOptions[K]) => {
      setDisplay((d) => ({ ...d, [k]: v }))
    },
    [],
  )

  // Persisted outside the updater, which must stay pure under StrictMode.
  useEffect(() => saveDisplay(display), [display])

  /* --- share links ------------------------------------------------------ */

  useEffect(() => {
    const route = routeFromLocation()
    if (!route) return
    // A dead link should still leave a usable app, so every failure falls back
    // to the plain sculptor rather than an error page.
    const clear = () => window.history.replaceState(null, '', '/')

    if (route.kind === 'w') {
      getWorld(route.slug)
        .then((w) => {
          setParams(sanitize(w.params))
          setName(w.name)
          setSavedSlug(w.slug)
        })
        .catch(clear)
    } else {
      getSystem(route.slug)
        .then((s) => {
          setSystem(sanitizeSystem(s.def))
          setSavedSystemSlug(s.slug)
          setTab('solar')
          setView('system')
        })
        .catch(clear)
    }
  }, [])

  /* --- galleries -------------------------------------------------------- */

  const refreshGallery = useCallback(() => {
    setGalleryLoading(true)
    setGalleryError(null)
    listWorlds()
      .then(setWorlds)
      .catch((e: Error) => setGalleryError(e.message))
      .finally(() => setGalleryLoading(false))
  }, [])

  const refreshSystems = useCallback(() => {
    setSystemsLoading(true)
    setSystemsError(null)
    listSystems()
      .then(setSystems)
      .catch((e: Error) => setSystemsError(e.message))
      .finally(() => setSystemsLoading(false))
  }, [])

  useEffect(() => {
    // Both galleries feed both tabs now: the systems tab can add a saved
    // world, and the worlds tab can aim a world at any saved system.
    if (tab === 'worlds' || tab === 'solar') {
      refreshGallery()
      refreshSystems()
    }
  }, [tab, refreshGallery, refreshSystems])

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

  /** Load an ancient world whole — canonical seed, sliders, name and all. */
  const applyAncient = useCallback((a: AncientWorld) => {
    setParams({ ...DEFAULT_PARAMS, ...a.params, preset: a.key, texture: null, cloudTexture: null })
    setName(a.name)
    setScan(null)
    setSavedSlug(null)
  }, [])

  /** Clicking a moon that is a world visits it, the way a planet card does. */
  const visitMoon = useCallback((w: { preset: PresetKey; seed: number }) => {
    const m = MOONS.find((x) => x.key === w.preset && x.params.seed === w.seed)
    if (!m) return
    setParams({ ...DEFAULT_PARAMS, ...m.params, preset: m.key, texture: null, cloudTexture: null })
    setName(m.name)
    setScan(null)
    setSavedSlug(null)
    setView('single')
    setTab('sculpt')
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

  /* --- systems ---------------------------------------------------------- */

  /** Select or replace the system on screen. */
  const chooseSystem = useCallback((def: SystemDef) => {
    setSystem(def)
    setSavedSystemSlug(null)
    // Choosing a system means wanting to look at it, not at whichever single
    // world happened to be on screen beforehand.
    setView('system')
    if (window.location.pathname.startsWith('/s/')) window.history.replaceState(null, '', '/')
  }, [])

  /**
   * Where going back leads from whatever is on screen.
   *
   * Derived rather than remembered, so it cannot disagree with what is being
   * shown: a moon returns to the planet it orbits, a planet to the system it
   * belongs to, and a world of your own — which is not in any system yet —
   * offers to join one instead.
   */
  const back = useMemo(() => {
    if (view === 'system') return null
    const measured = parentOf(params)
    if (measured) {
      const host = SOLAR.find((x) => x.key === measured.key)
      if (host) return { kind: 'planet' as const, label: host.name, host }
    }
    const mine = system.bodies.find(
      (b) => b.orbits && b.params.preset === params.preset && b.params.seed === params.seed,
    )
    const invented = mine && system.bodies.find((b) => b.name === mine.orbits)
    if (invented) return { kind: 'body' as const, label: invented.name, body: invented }
    const inSystem = system.bodies.some(
      (b) => b.params.preset === params.preset && b.params.seed === params.seed,
    )
    if (inSystem) return { kind: 'system' as const, label: system.name }
    return { kind: 'orphan' as const, label: system.name }
  }, [view, params, system])

  const goBack = useCallback(() => {
    if (!back) return
    if (back.kind === 'planet') {
      setParams({ ...DEFAULT_PARAMS, ...back.host.params, preset: back.host.key })
      setName(back.host.name)
      setScan(null)
      setSavedSlug(null)
      return
    }
    if (back.kind === 'body') {
      setParams(sanitize(back.body.params))
      setName(back.body.name)
      setScan(null)
      setSavedSlug(null)
      return
    }
    setView('system')
  }, [back])

  /** Visit one of the bodies in the current system. */
  const visitBody = useCallback(
    (i: number) => {
      const b = system.bodies[i]
      if (!b) return
      setParams(sanitize(b.params))
      setName(b.name)
      setScan(null)
      setSavedSlug(null)
      setView('single')
      setTab('sculpt')
    },
    [system],
  )

  /*
   * Four ways in, one destination. Adding no longer forces the view to change:
   * both views already show the new world — a card in the body list, a planet
   * in orbit — and being thrown into the orbit view on every click made adding
   * several in a row unpleasant. Any of them invalidates the share link, since
   * the saved system no longer matches the one on screen.
   */

  /** Drop the world currently in the sculptor into the system. */
  const addCurrentWorld = useCallback(() => {
    setSystem((s) => addWorld(s, name, params))
    setSavedSystemSlug(null)
  }, [name, params])

  /** Roll a new world of a given type — or of any type — straight into orbit. */
  const addRolled = useCallback((preset?: PresetKey) => {
    // Seeded out here rather than inside the updater: under StrictMode React
    // runs an updater twice, and a random seed drawn in there would roll two
    // different worlds and keep whichever ran last.
    const seed = (Math.random() * 99999) | 0
    setSystem((s) => addRolledWorld(s, preset, seed))
    setSavedSystemSlug(null)
  }, [])

  /**
   * Add a world from the gallery, from either the systems or the worlds tab.
   * A target makes that saved system the active one first, so the world lands
   * where it was aimed and the Systems tab is already showing the result.
   */
  const addSavedWorld = useCallback((w: SavedWorld, target?: SavedSystem | null) => {
    if (target) {
      setSystem(addWorld(sanitizeSystem(target.def), w.name, sanitize(w.params)))
      if (window.location.pathname.startsWith('/s/')) window.history.replaceState(null, '', '/')
    } else {
      setSystem((s) => addWorld(s, w.name, sanitize(w.params)))
    }
    setSavedSystemSlug(null)
    setAddedSlug(w.slug)
    window.setTimeout(() => setAddedSlug(null), 1600)
  }, [])

  /** Another world like the one already in orbit, further out. */
  /** Roll a moon into orbit around one of the system's own worlds. */
  const addMoonTo = useCallback((index: number) => {
    setSystem((s) => addMoon(s, index))
    setSavedSystemSlug(null)
  }, [])

  const duplicateWorld = useCallback((i: number) => {
    setSystem((s) => duplicateBody(s, i))
    setSavedSystemSlug(null)
  }, [])

  const onSaveSystem = useCallback(async () => {
    setSystemSaving(true)
    setSystemsError(null)
    try {
      const s = await saveSystem(system)
      setSavedSystemSlug(s.slug)
      window.history.replaceState(null, '', `/s/${s.slug}`)
      try {
        await navigator.clipboard?.writeText(`${window.location.origin}/s/${s.slug}`)
      } catch {
        // Clipboard permission is not essential — the URL bar already updated.
      }
      setSystems((prev) => [s, ...prev.filter((x) => x.slug !== s.slug)])
    } catch (e) {
      setSystemsError((e as Error).message)
    } finally {
      setSystemSaving(false)
    }
  }, [system])

  const openSavedSystem = useCallback((s: SavedSystem) => {
    setSystem(sanitizeSystem(s.def))
    setSavedSystemSlug(s.slug)
    setView('system')
    window.history.replaceState(null, '', `/s/${s.slug}`)
  }, [])

  /* --- scan ------------------------------------------------------------- */

  const runScan = useCallback(() => {
    if (scanning) return
    setScanning(true)
    setScan(null)
    setScanNonce((n) => n + 1)
    if (scanTimer.current) window.clearTimeout(scanTimer.current)
    scanTimer.current = window.setTimeout(() => {
      // The sweep animation has been masking the wait, so the profile chunk
      // has had 2.1 s of runway; a failed fetch just yields no reading.
      computeScan(params)
        .then(setScan)
        .catch(() => setScan(null))
        .finally(() => setScanning(false))
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
      ? `${system.sub} · click a planet to visit it`
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
            system={system}
            scanNonce={scanNonce}
            resetNonce={resetNonce}
            onPick={visitBody}
            onPickMoon={visitMoon}
            background={nebulaCss(display.nebula)}
          />

          <div className="view-title">
            {back && (
              <button className="btn-back" type="button" onClick={goBack}>
                ‹ {back.kind === 'orphan' ? `Add to ${back.label}` : back.label}
              </button>
            )}
            <h2>{view === 'system' ? system.name : name}</h2>
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
                tier={display.tier}
                onTier={setTier}
                onVisitMoon={visitMoon}
                onName={setName}
                onParam={setParam}
                onPreset={applyPreset}
                onAncient={applyAncient}
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
              <SystemsPanel
                system={system}
                view={view}
                sizeMode={sizeMode}
                display={display}
                onDisplay={toggleDisplay}
                onDisplaySet={setDisplayField}
                onView={setView}
                onSizeMode={setSizeMode}
                onVisit={visitBody}
                onSystem={chooseSystem}
                onAddCurrent={addCurrentWorld}
                onAddRolled={addRolled}
                onAddSaved={addSavedWorld}
                onAddMoon={addMoonTo}
                onDuplicate={duplicateWorld}
                currentWorld={name}
                worlds={worlds}
                worldsError={galleryError}
                onSave={onSaveSystem}
                saving={systemSaving}
                savedSlug={savedSystemSlug}
                systems={systems}
                systemsLoading={systemsLoading}
                systemsError={systemsError}
                onOpenSaved={openSavedSystem}
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
                system={system}
                systems={systems}
                onAdd={addSavedWorld}
                addedSlug={addedSlug}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
