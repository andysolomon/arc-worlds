import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScanPanel } from './components/ScanPanel'
import { SystemsPanel } from './components/SystemsPanel'
import { Viewport } from './components/Viewport'
import { WorldsPanel } from './components/WorldsPanel'
import { Segmented } from './components/ui'
import {
  MOONS, PRESETS, SOLAR, isLittleWorldsOriginal, typeOf, type AncientWorld,
} from './data/presets'
import { MILKY_WAY } from './data/systems'
import { climateForBody, standaloneClimate, withSystemClimates } from './engine/climate'
import { parentOf } from './engine/planets'
import { loadDisplay, nebulaCss, saveDisplay, type DisplayOptions } from './lib/display'
import { CURRENT_PARAMS, sanitize } from './lib/params'
import {
  addMoon, addRolledWorld, addWorld, duplicateBody, editableCopy, hasRoom, sanitizeSystem,
} from './lib/systems'
import { computeScan, type ScanResult } from './lib/scan'
import {
  getSystem, getWorld, listSystems, listWorlds, saveSystem, saveWorld,
  type SavedSystem, type SavedWorld,
} from './lib/api'
import { CURRENT_GENERATOR_VERSION, type PlanetParams, type PresetKey, type SystemDef } from './engine/types'
import './styles.css'

// The builder is the densest panel and is only needed in Worlds → Build. Keep
// it out of the first-load entry so the initial scene and Systems view retain
// headroom under the checked-in gzip budget. Vite emits this as a lazy chunk;
// React starts loading it immediately when Build is the active destination.
const SculptPanel = lazy(async () => {
  const module = await import('./components/SculptPanel')
  return { default: module.SculptPanel }
})

type Tab = 'solar' | 'worlds'
type WorldsView = 'build' | 'analyze' | 'saved'

const TABS: Array<[Tab, string]> = [
  ['worlds', 'Worlds'],
  ['solar', 'Systems'],
]

const WORLD_VIEWS: Array<[WorldsView, string]> = [
  ['build', 'Build'],
  ['analyze', 'Analyze'],
  ['saved', 'Saved'],
]

const SPEEDS: Array<[number, string]> = [
  [0, 'Pause'],
  [0.5, '½×'],
  [1, '1×'],
  [4, '4×'],
  [20, '20×'],
]

const FINE_TERRAIN_KEYS = new Set<keyof PlanetParams>([
  'terrainType', 'terrainAmplitude', 'terrainSharpness', 'terrainOffset',
  'terrainPeriod', 'terrainPersistence', 'terrainLacunarity', 'terrainOctaves',
  'terrainLayers', 'bumpStrength', 'bumpOffset',
])

/** Read a share link out of the address bar: /w/:slug for a world, /s/:slug for a system. */
function routeFromLocation(): { kind: 'w' | 's'; slug: string } | null {
  const m = /^\/([ws])\/([A-Za-z0-9_-]{3,64})$/.exec(window.location.pathname)
  return m ? { kind: m[1] as 'w' | 's', slug: m[2] } : null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('worlds')
  const [worldsView, setWorldsView] = useState<WorldsView>('build')
  const [name, setName] = useState('Peachmoss')
  const [params, setParams] = useState<PlanetParams>(CURRENT_PARAMS)
  const [worldLocked, setWorldLocked] = useState(false)
  const [system, setSystem] = useState<SystemDef>(MILKY_WAY)
  const [selectedBodyIndex, setSelectedBodyIndex] = useState<number | null>(null)
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
  const panelScroll = useRef<HTMLDivElement | null>(null)

  // Params handed to the engine. `view`, `timeScale` and the display toggles
  // are render concerns, not part of the world's identity, so they are merged
  // in only here.
  const climateSystem = useMemo(() => withSystemClimates(system), [system])
  const activeClimate = useMemo(() => {
    const selected = selectedBodyIndex == null ? null : system.bodies[selectedBodyIndex]
    const body = selected &&
      selected.params.preset === params.preset &&
      selected.params.seed === params.seed &&
      selected.params.generatorVersion === params.generatorVersion
      ? selected
      : system.bodies.find((candidate) =>
      candidate.params.preset === params.preset &&
      candidate.params.seed === params.seed &&
      candidate.params.generatorVersion === params.generatorVersion)
    return body ? climateForBody(system, body) : standaloneClimate(params)
  }, [params, selectedBodyIndex, system])

  const enginePar = useMemo<PlanetParams>(
    () => ({
      ...params,
      climate: activeClimate,
      mode: view === 'system' ? 'system' : 'single',
      sizeMode,
      timeScale,
      autoRotate: timeScale > 0,
      showPaths: display.paths,
      showLabels: display.labels,
      showMoons: display.moons,
      sky: display.sky,
      pauseOnHover: display.pauseOnHover,
      starDensity: display.starDensity,
      starBright: display.starBright,
      exposure: display.exposure,
    }),
    [params, activeClimate, view, sizeMode, timeScale, display],
  )

  const toggleDisplay = useCallback((k: 'paths' | 'labels' | 'moons' | 'sky') => {
    setDisplay((d) => ({ ...d, [k]: !d[k] }))
  }, [])

  const setDisplayField = useCallback(
    <K extends keyof DisplayOptions>(k: K, v: DisplayOptions[K]) => {
      setDisplay((d) => ({ ...d, [k]: v }))
    },
    [],
  )

  // Persisted outside the updater, which must stay pure under StrictMode.
  useEffect(() => saveDisplay(display), [display])

  // Each destination starts at its first decision. Keeping the scroll offset
  // from a long Systems editor used to open a newly visited reference world
  // halfway down its disabled sliders, hiding the explanation and Clone action.
  useEffect(() => {
    if (panelScroll.current) panelScroll.current.scrollTop = 0
  }, [tab, worldsView, selectedBodyIndex, worldLocked])

  /* --- share links ------------------------------------------------------ */

  useEffect(() => {
    const route = routeFromLocation()
    if (!route) return
    // A dead link should still leave a usable app, so every failure falls back
    // to the world builder rather than an error page.
    const clear = () => window.history.replaceState(null, '', '/')

    if (route.kind === 'w') {
      getWorld(route.slug)
        .then((w) => {
          setParams(sanitize(w.params))
          setName(w.name)
          setSavedSlug(w.slug)
          setWorldLocked(false)
          setTab('worlds')
          setWorldsView('build')
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
    if (worldLocked) return
    // Changing the seed means this is no longer the real planet, so drop its
    // photographic map and fall back to procedural terrain. It also starts a
    // fresh world, so it is an explicit opt-in to the current generator; an
    // untouched v1 payload remains v1 when merely opened or edited.
    setParams((s) => ({
      ...s,
      [k]: v,
      ...(k === 'seed' || FINE_TERRAIN_KEYS.has(k)
        ? { generatorVersion: CURRENT_GENERATOR_VERSION, texture: null, cloudTexture: null }
        : null),
    }))
    setScan(null)
    setSavedSlug(null)
    setSelectedBodyIndex(null)
  }, [worldLocked])

  const applyPreset = useCallback((key: PresetKey) => {
    const p = PRESETS.find((x) => x.key === key)
    setParams((s) => ({
      ...s,
      ...(p?.def ?? {}),
      generatorVersion: CURRENT_GENERATOR_VERSION,
      preset: key,
      texture: null,
      cloudTexture: null,
    }))
    setScan(null)
    setSavedSlug(null)
    setSelectedBodyIndex(null)
    setWorldLocked(false)
  }, [])

  /** Load an ancient world whole — canonical seed, sliders, name and all. */
  const applyAncient = useCallback((a: AncientWorld) => {
    setParams({ ...CURRENT_PARAMS, ...a.params, generatorVersion: CURRENT_GENERATOR_VERSION, preset: a.key, texture: null, cloudTexture: null })
    setName(a.name)
    setScan(null)
    setSavedSlug(null)
    setSelectedBodyIndex(null)
    setWorldLocked(true)
  }, [])

  /** Clicking a moon that is a world visits it, the way a planet card does. */
  const visitMoon = useCallback((w: { preset: PresetKey; seed: number }) => {
    const m = MOONS.find((x) => x.key === w.preset && x.params.seed === w.seed)
    if (!m) return
    setParams({ ...CURRENT_PARAMS, ...m.params, generatorVersion: CURRENT_GENERATOR_VERSION, preset: m.key, texture: null, cloudTexture: null })
    setName(m.name)
    setScan(null)
    setSavedSlug(null)
    setWorldLocked(true)
    setSelectedBodyIndex(system.bodies.findIndex((body) =>
      body.params.preset === w.preset && body.params.seed === w.seed))
    setView('single')
    setTab('worlds')
    setWorldsView('build')
  }, [system])

  const reshape = useCallback(() => {
    if (worldLocked) return
    setParams((s) => ({
      ...s,
      generatorVersion: CURRENT_GENERATOR_VERSION,
      texture: null,
      cloudTexture: null,
    }))
    setScan(null)
    setSelectedBodyIndex(null)
  }, [worldLocked])

  /* --- systems ---------------------------------------------------------- */

  /** Select or replace the system on screen. */
  const chooseSystem = useCallback((def: SystemDef) => {
    setSystem(def)
    setSelectedBodyIndex(null)
    setSavedSystemSlug(null)
    // Choosing a system means wanting to look at it, not at whichever single
    // world happened to be on screen beforehand.
    setView('system')
    if (window.location.pathname.startsWith('/s/')) window.history.replaceState(null, '', '/')
  }, [])

  /**
   * Whether the system on screen would take another world.
   *
   * Adding to a read-only system means adding to a copy of it, so the question
   * is really about the copy — which is what `addWorld` builds, and the same
   * test it applies before it will take anything.
   */
  const systemTakesAnother = useMemo(() => hasRoom(editableCopy(system)), [system])

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
      (b) => b.orbits &&
        b.params.preset === params.preset &&
        b.params.seed === params.seed &&
        b.params.generatorVersion === params.generatorVersion,
    )
    const invented = mine && system.bodies.find((b) => b.name === mine.orbits)
    if (invented) return { kind: 'body' as const, label: invented.name, body: invented }
    const inSystem = system.bodies.some(
      (b) => b.params.preset === params.preset &&
        b.params.seed === params.seed &&
        b.params.generatorVersion === params.generatorVersion,
    )
    if (inSystem) return { kind: 'system' as const, label: system.name }
    // Only offer to join a system that will actually take the world. A full
    // one can still be looked at, and says so instead of promising a place it
    // has no room for.
    if (!systemTakesAnother) return { kind: 'system' as const, label: system.name }
    return { kind: 'orphan' as const, label: system.name }
  }, [view, params, system, systemTakesAnother])

  const goBack = useCallback(() => {
    if (!back) return
    if (back.kind === 'planet') {
      setParams({ ...CURRENT_PARAMS, ...back.host.params, generatorVersion: CURRENT_GENERATOR_VERSION, preset: back.host.key })
      setName(back.host.name)
      setScan(null)
      setSavedSlug(null)
      setWorldLocked(true)
      return
    }
    if (back.kind === 'body') {
      setParams(sanitize(back.body.params))
      setSelectedBodyIndex(system.bodies.indexOf(back.body))
      setName(back.body.name)
      setScan(null)
      setSavedSlug(null)
      setWorldLocked(isLittleWorldsOriginal(back.body.params) || !!back.body.params.texture)
      return
    }
    if (back.kind === 'orphan') {
      // The button offers to put this world into the system, so the click has
      // to do it rather than merely show where it would have gone. Adding
      // first means the orbit that opens is the one it has just taken, and the
      // panel comes along so the new world is in the list as well as the sky.
      setSystem((s) => addWorld(s, name, params))
      setSavedSystemSlug(null)
      setTab('solar')
    }
    setView('system')
  }, [back, name, params, system])

  /**
   * Clicking the planet in a moon's sky travels to it.
   *
   * The same journey the back button makes, because it is the same journey:
   * the planet up there and the planet named on the button are one body, and
   * two ways of reaching it that disagreed would be a bug waiting to happen.
   */
  const visitParent = useCallback(() => {
    if (back?.kind === 'planet' || back?.kind === 'body') goBack()
  }, [back, goBack])

  /** Visit one of the bodies in the current system. */
  const visitBody = useCallback(
    (i: number) => {
      const b = climateSystem.bodies[i]
      if (!b) return
      setParams(sanitize(b.params))
      setSelectedBodyIndex(i)
      setName(b.name)
      setScan(null)
      setSavedSlug(null)
      setWorldLocked(isLittleWorldsOriginal(b.params) || !!b.params.texture)
      setView('single')
      setTab('worlds')
      setWorldsView('build')
    },
    [climateSystem],
  )

  /** Turn any reference world into a new editable member of the same family. */
  const cloneIntoWorlds = useCallback((sourceName: string, source: PlanetParams) => {
    const nextSeed = (Math.random() * 99_999) | 0
    setParams({
      ...sanitize(source),
      seed: nextSeed,
      generatorVersion: CURRENT_GENERATOR_VERSION,
      texture: null,
      cloudTexture: null,
    })
    setName(`${sourceName} Clone`)
    setScan(null)
    setSavedSlug(null)
    setSelectedBodyIndex(null)
    setWorldLocked(false)
    setView('single')
    setTab('worlds')
    setWorldsView('build')
    if (window.location.pathname.startsWith('/w/')) window.history.replaceState(null, '', '/')
  }, [])

  const cloneCurrentWorld = useCallback(() => {
    cloneIntoWorlds(name, params)
  }, [cloneIntoWorlds, name, params])

  /*
   * Four ways in, one destination. Adding no longer forces the view to change:
   * both views already show the new world — a card in the body list, a planet
   * in orbit — and being thrown into the orbit view on every click made adding
   * several in a row unpleasant. Any of them invalidates the share link, since
   * the saved system no longer matches the one on screen.
   */

  /** Drop the world currently in the builder into the system. */
  const addCurrentWorld = useCallback(() => {
    if (worldLocked) return
    setSystem((s) => addWorld(s, name, params))
    setSavedSystemSlug(null)
  }, [name, params, worldLocked])

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
      computeScan(enginePar)
        .then(setScan)
        .catch(() => setScan(null))
        .finally(() => setScanning(false))
    }, 2100)
  }, [scanning, enginePar])

  useEffect(
    () => () => {
      if (scanTimer.current) window.clearTimeout(scanTimer.current)
    },
    [],
  )

  /* --- saving ----------------------------------------------------------- */

  const onSave = useCallback(async () => {
    if (worldLocked) return
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
      setWorldsView('saved')
    } finally {
      setSaving(false)
    }
  }, [name, params, worldLocked])

  const openWorld = useCallback((w: SavedWorld) => {
    setParams(sanitize(w.params))
    setSelectedBodyIndex(null)
    setName(w.name)
    setSavedSlug(w.slug)
    setWorldLocked(false)
    setView('single')
    setTab('worlds')
    setWorldsView('build')
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

  /**
   * Return to the Worlds collection after opening a planet from a saved-world
   * card or a system body. Keep the current world in memory so leaving and
   * returning is non-destructive, but put the collection controls back in
   * view instead of trapping the user inside the editor.
   */
  const goWorldsHome = useCallback(() => {
    setTab('worlds')
    setWorldsView('saved')
    setSelectedBodyIndex(null)
    setSavedSlug(null)
    if (window.location.pathname.startsWith('/w/')) window.history.replaceState(null, '', '/')
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
            <div className="brand-sub">build a planet, then discover what lives there</div>
          </div>
        </div>
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
            <span className="time-sep" aria-hidden="true" />
            {/*
              Called "Hold on hover" rather than "Pause on hover" because the
              speed beside it is already called Pause, and one button's name
              must never be contained in another's — tests and the performance
              benchmark find these by their accessible name alone.
            */}
            <button
              className="time-btn"
              data-on={display.pauseOnHover}
              aria-pressed={display.pauseOnHover}
              title="Stop time while the pointer rests on a planet or a moon"
              type="button"
              onClick={() => setDisplayField('pauseOnHover', !display.pauseOnHover)}
            >
              Hold on hover
            </button>
          </div>

          <Viewport
            params={enginePar}
            system={climateSystem}
            scanNonce={scanNonce}
            resetNonce={resetNonce}
            onPick={visitBody}
            onPickMoon={visitMoon}
            onPickParent={visitParent}
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

          <div className="panel-scroll" ref={panelScroll}>
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
                canAddCurrent={!worldLocked}
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
              <>
                <button className="workspace-home" type="button" onClick={goWorldsHome}>
                  ‹ Worlds home
                </button>
                <div>
                  <div className="field-label">World workspace</div>
                  <Segmented options={WORLD_VIEWS} value={worldsView} onChange={setWorldsView} />
                </div>

                {worldsView === 'build' && (
                  <Suspense fallback={<div className="note">Loading builder…</div>}>
                    <SculptPanel
                      params={params}
                      name={name}
                      onVisitMoon={visitMoon}
                      onName={setName}
                      onParam={setParam}
                      onPreset={applyPreset}
                      onAncient={applyAncient}
                      onReshape={reshape}
                      onSave={onSave}
                      saving={saving}
                      saved={!!savedSlug}
                      locked={worldLocked}
                      onClone={cloneCurrentWorld}
                    />
                  </Suspense>
                )}

                {worldsView === 'analyze' && (
                  <ScanPanel worldName={name} scan={scan} scanning={scanning} onScan={runScan} />
                )}

                {worldsView === 'saved' && (
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
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
