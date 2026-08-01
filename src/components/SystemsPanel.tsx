import { BUILT_IN_SYSTEMS } from '../data/systems'
import { ANCIENT, PRESETS, SOLAR } from '../data/presets'
import { climateForBody, formatClimate, stellarLuminosity } from '../engine/climate'
import { periodFor, satRadii, starRadius, starSize } from '../engine/scale'
import {
  A_MAX, A_MIN, A_SAT_MAX, A_SAT_MIN, MASS_MAX, MASS_MIN, MAX_BODIES, STAR_KINDS,
  duplicateSystem, emptySystem, isGasBody, removeBodyAt, retime, rollSystem,
  satPeriodFor, setParent,
} from '../lib/systems'
import type { SavedSystem, SavedWorld } from '../lib/api'
import { NEBULAE, type DisplayOptions } from '../lib/display'
import type { PresetKey, SystemBody, SystemDef } from '../engine/types'
import { Chip, Field, Segmented, Slider } from './ui'

interface Props {
  system: SystemDef
  view: 'single' | 'system'
  sizeMode: 'same' | 'scale'
  display: DisplayOptions
  onDisplay: (k: 'paths' | 'labels' | 'moons') => void
  /** Set any display field — the Universe controls are not toggles. */
  onDisplaySet: <K extends keyof DisplayOptions>(k: K, v: DisplayOptions[K]) => void
  onView: (v: 'single' | 'system') => void
  onSizeMode: (v: 'same' | 'scale') => void
  onVisit: (index: number) => void
  /** Select or replace the active system. */
  onSystem: (def: SystemDef) => void
  /** Drop the world currently in the sculptor into this system. */
  onAddCurrent: () => void
  /** Roll a new world of a given type — or of any type — straight into orbit. */
  onAddRolled: (preset?: PresetKey) => void
  /** Add one of the saved worlds from the gallery. */
  onAddSaved: (w: SavedWorld) => void
  /** Roll a moon into orbit around the body at this index. */
  onAddMoon: (index: number) => void
  /** Another world like the one at this index, further out. */
  onDuplicate: (index: number) => void
  currentWorld: string
  worlds: SavedWorld[]
  worldsError: string | null
  onSave: () => void
  saving: boolean
  savedSlug: string | null
  systems: SavedSystem[]
  systemsLoading: boolean
  systemsError: string | null
  onOpenSaved: (s: SavedSystem) => void
}

/**
 * Both distance and size span orders of magnitude — Mercury to Neptune is
 * 80×, Mercury to Jupiter 30× — so linear sliders would bunch almost every
 * real value into the first few pixels. Both are logarithmic.
 */
function logScale(lo: number, hi: number) {
  const span = Math.log(hi / lo)
  return {
    to: (v: number) => Math.log(Math.max(lo, v) / lo) / span,
    from: (t: number) => lo * Math.exp(t * span),
  }
}

const DIST = logScale(A_MIN, A_MAX)
// A moon's distance is measured from its planet, over a far shorter range.
const SAT_DIST = logScale(A_SAT_MIN, A_SAT_MAX)
const R_MIN = 0.15
const R_MAX = 16
const SIZE = logScale(R_MIN, R_MAX)

const fmtAU = (a: number) => (a < 10 ? `${a.toFixed(2)} AU` : `${a.toFixed(1)} AU`)

/** Moons are quoted in the radii of the planet they orbit, as astronomers do. */
const fmtMoonDist = (a: number, parentRadius: number) =>
  `${(satRadii(a, parentRadius)).toFixed(1)} radii`

/**
 * A star chip's dot is drawn at the size the renderer will draw that star, so
 * the swatch previews what you are picking rather than only its colour. The
 * choice is really a choice of mass — it re-times every orbit in the system —
 * and identical dots were the one thing in that row saying otherwise.
 */
function dotStyle(color: number, mass: number) {
  const d = Math.round(10 * starSize(mass))
  return {
    background: `#${color.toString(16).padStart(6, '0')}`,
    width: d,
    height: d,
  }
}

/** A year here, in Earth years or days — whichever reads better. */
function fmtPeriod(years: number): string {
  if (years < 1) {
    const days = years * 365.25
    // TRAPPIST-1 b's year is 1.5 days; rounding it to "2" would misquote it.
    return `${days < 10 ? days.toFixed(1) : days.toFixed(0)} day year`
  }
  return `${years < 10 ? years.toFixed(1) : years.toFixed(0)} year orbit`
}

function bodyDot(b: SystemBody): string {
  const p = PRESETS.find((x) => x.key === b.params.preset)
  const s = SOLAR.find((x) => x.key === b.params.preset)
  const a = ANCIENT.find((x) => x.key === b.params.preset)
  return (b.texture ? s?.dot : p?.dot ?? a?.dot) ?? p?.dot ?? s?.dot ?? a?.dot ?? '#7fae62'
}

export function SystemsPanel(props: Props) {
  const {
    system, view, sizeMode, display, onDisplay, onDisplaySet, onView, onSizeMode, onVisit,
    onSystem, onAddCurrent, onAddRolled, onAddSaved, onAddMoon, onDuplicate, currentWorld,
    worlds, worldsError, onSave, saving, savedSlug, systems, systemsLoading,
    systemsError, onOpenSaved,
  } = props

  const editable = system.origin === 'custom'
  const full = system.bodies.length >= MAX_BODIES

  const setBody = (i: number, patch: Partial<SystemBody>) => {
    const bodies = system.bodies.map((b, k) => {
      if (k !== i) return b
      const next = { ...b, ...patch }
      // A year is a consequence of the distance, so moving a world re-times
      // it — around its planet if it has one, otherwise around the star.
      if (patch.a !== undefined) {
        const parent = next.orbits ? system.bodies.find((x) => x.name === next.orbits) : null
        next.period = parent
          ? satPeriodFor(next.a, parent.radius, isGasBody(parent))
          : periodFor(next.a, system.star.mass)
      }
      return next
    })
    // Deliberately not re-sorted here: dragging one planet past another would
    // reorder the list mid-drag and pull the slider out from under the pointer.
    // Order is settled when a body is added, and again when the system is saved.
    onSystem({ ...system, bodies })
  }

  const removeBody = (i: number) => onSystem(removeBodyAt(system, i))

  /** A body that already carries moons cannot become one itself. */
  const hasMoons = (name: string) => system.bodies.some((x) => x.orbits === name)
  const parentOf = (b: SystemBody) =>
    b.orbits ? system.bodies.find((x) => x.name === b.orbits) : undefined

  return (
    <>
      {/* --- which system --------------------------------------------------- */}
      <div>
        <div className="field-label">System</div>
        <div className="chips">
          {BUILT_IN_SYSTEMS.map((s) => (
            <button
              key={s.id}
              className="chip"
              type="button"
              aria-pressed={system.id === s.id}
              onClick={() => onSystem(s)}
            >
              <span className="dot" style={dotStyle(s.star.color, s.star.mass)} />
              {s.name}
            </button>
          ))}
          {editable && (
            <button className="chip" type="button" aria-pressed>
              <span className="dot" style={dotStyle(system.star.color, system.star.mass)} />
              {system.name}
            </button>
          )}
        </div>
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn-ghost" type="button" onClick={() => onSystem(duplicateSystem(system))}>
          Duplicate & edit
        </button>
        <button className="btn-ghost" type="button" onClick={() => onSystem(rollSystem())}>
          🎲 Surprise system
        </button>
        <button className="btn-ghost" type="button" onClick={() => onSystem(emptySystem())}>
          New, empty
        </button>
      </div>

      <div className="note">
        <strong>{system.name}</strong> — {system.sub}.{' '}
        {system.origin === 'measured' &&
          'Duplicate it to move the planets around; the original stays as it is.'}
        {system.origin === 'observed' &&
          'The orbits and years are measured; the worlds wearing them are imagined — nobody has seen these surfaces.'}
        {system.origin === 'imagined' && 'Every number in it was invented, including the star.'}
        {system.origin === 'custom' &&
          'Yours to change — add worlds, move them about, then save it for a link.'}
      </div>

      <Segmented<'single' | 'system'>
        options={[['single', 'Body list'], ['system', 'Orbit view']]}
        value={view}
        onChange={onView}
      />

      {/* --- display -------------------------------------------------------- */}
      <div>
        <div className="field-label">Display</div>
        <div className="chips">
          <Chip on={display.paths} onClick={() => onDisplay('paths')}>
            Orbit paths
          </Chip>
          <Chip on={display.labels} onClick={() => onDisplay('labels')}>
            Labels
          </Chip>
          <Chip on={display.moons} onClick={() => onDisplay('moons')}>
            Moons
          </Chip>
        </div>
        {(!display.paths || !display.moons) && (
          <div className="note" style={{ marginTop: 10 }}>
            {!display.paths &&
              'Paths are hidden — hover a planet in the orbit view to glimpse its own. '}
            {!display.moons &&
              'Moons are off, so visiting a planet skips building them — the quickest performance win.'}
          </div>
        )}
      </div>

      {/* --- universe ------------------------------------------------------- */}
      <Field label="Universe">
        <Slider
          name="Star density"
          value={display.starDensity}
          onChange={(v) => onDisplaySet('starDensity', v)}
        />
        <Slider
          name="Star brightness"
          value={display.starBright}
          onChange={(v) => onDisplaySet('starBright', v)}
        />
        <Slider
          name="Exposure"
          value={display.exposure}
          onChange={(v) => onDisplaySet('exposure', v)}
        />
        <div className="chips" style={{ marginTop: 8 }}>
          {NEBULAE.map((n) => (
            <Chip
              key={n.key}
              on={display.nebula === n.key}
              dot={n.dot}
              onClick={() => onDisplaySet('nebula', n.key)}
            >
              {n.label}
            </Chip>
          ))}
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          How this browser likes its sky: star count and glow, overall exposure, and a nebula
          wash behind everything. Yours alone — never part of a world or a shared system.
        </div>
      </Field>

      {/* --- the view ------------------------------------------------------- */}
      {view === 'system' ? (
        <>
          <div>
            <div className="field-label">Planet size</div>
            <Segmented<'same' | 'scale'>
              options={[['same', 'Same size'], ['scale', 'To scale']]}
              value={sizeMode}
              onChange={onSizeMode}
            />
          </div>
          <div className="note">
            Every body moves at the pace its own orbit implies — one Earth year ≈ 14 seconds — on a
            real elliptical, tilted path. <strong>Same size</strong> draws every planet alike for easy
            spotting; <strong>To scale</strong> ranks them by true size. Distances are eased inward and
            the star is far smaller than life, though stars are sized against one another — a
            blue-white star really is about seven times the width of a red dwarf. A compact system
            like TRAPPIST-1 is stretched to fill the frame and slowed just enough to watch, with
            every internal ratio kept exact. Drag to tilt, scroll to zoom, click a planet to visit
            it.
          </div>
        </>
      ) : system.bodies.length === 0 ? (
        <p className="empty">
          Nothing orbits {system.star.name} yet.
          {editable ? ' Pick a world type below and one will appear.' : ''}
        </p>
      ) : (
        system.bodies.map((b, i) => (
          <button className="card" key={`${b.name}-${i}`} type="button" onClick={() => onVisit(i)}>
            <span
              className="globe"
              style={{ background: `radial-gradient(circle at 34% 30%, #fff6, ${bodyDot(b)})` }}
            />
            <span className="body">
              <span className="title">{b.name}</span>
              <span className="sub">
                {fmtAU(b.a)} · {fmtPeriod(b.period)}
                <br />
                {formatClimate(climateForBody(system, b))}
              </span>
            </span>
            <span className="go">Visit</span>
          </button>
        ))
      )}

      {/* --- editing -------------------------------------------------------- */}
      {editable && (
        <>
          <div className="field-label" style={{ marginTop: 4 }}>
            {system.star.name} · {system.bodies.length}/{MAX_BODIES} worlds
          </div>

          <div className="row">
            <div style={{ flex: 1 }}>
              <Field label="System name">
                <input
                  type="text"
                  value={system.name}
                  aria-label="System name"
                  onChange={(e) => onSystem({ ...system, name: e.target.value })}
                />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Star name">
                <input
                  type="text"
                  value={system.star.name}
                  aria-label="Star name"
                  onChange={(e) => onSystem({ ...system, star: { ...system.star, name: e.target.value } })}
                />
              </Field>
            </div>
          </div>

          <div>
            <div className="field-label">Star</div>
            <div className="chips">
              {STAR_KINDS.map((k) => (
                <button
                  key={k.label}
                  className="chip"
                  type="button"
                  title={`${k.label} — ${k.mass.toFixed(2)} solar masses, ${starRadius(k.mass).toFixed(2)} solar radii`}
                  aria-pressed={system.star.color === k.color}
                  onClick={() =>
                    onSystem(retime({
                      ...system,
                      star: {
                        ...system.star,
                        color: k.color,
                        mass: k.mass,
                        luminosity: stellarLuminosity({ mass: k.mass }),
                      },
                    }))
                  }
                >
                  <span className="dot" style={dotStyle(k.color, k.mass)} />
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <Slider
            name="Star mass"
            value={(system.star.mass - MASS_MIN) / (MASS_MAX - MASS_MIN)}
            format={() => `${system.star.mass.toFixed(2)} ☉`}
            onChange={(t) =>
              onSystem(
                retime({
                  ...system,
                  star: {
                    ...system.star,
                    mass: MASS_MIN + t * (MASS_MAX - MASS_MIN),
                    luminosity: stellarLuminosity({ mass: MASS_MIN + t * (MASS_MAX - MASS_MIN) }),
                  },
                }),
              )
            }
          />
          <div className="note">
            Mass sets orbital years and the estimated main-sequence luminosity. Luminosity and
            distance set each world's received energy, so changing this star can freeze or heat
            every surface in the system. Climate labels are modeled estimates, not observations.
          </div>

          {/* --- adding worlds ------------------------------------------------
              Above the per-world editors deliberately: with a full system there
              are a dozen of those, and burying the way in under them is the
              problem this is meant to solve. */}
          <div>
            <div className="field-label">Add a world</div>
            {full ? (
              <p className="empty" style={{ padding: '4px 2px', textAlign: 'left' }}>
                Full — {MAX_BODIES} worlds is the limit. Remove one to make room.
              </p>
            ) : (
              <>
                <div className="chips">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      className="chip"
                      type="button"
                      title={`Roll a new ${p.label.toLowerCase()} into orbit`}
                      onClick={() => onAddRolled(p.key)}
                    >
                      <span className="dot" style={{ background: p.dot }} />
                      {p.label}
                    </button>
                  ))}
                  <button
                    className="chip"
                    type="button"
                    title="Roll a new world of any type into orbit"
                    onClick={() => onAddRolled()}
                  >
                    🎲 Any
                  </button>
                </div>
                <div className="note" style={{ marginTop: 10 }}>
                  Each of these rolls a whole new world and puts it in orbit outside everything
                  already here — no trip through the sculptor. Every world is still yours to
                  reshape afterwards: click it in the body list to open it up.
                </div>
              </>
            )}
          </div>

          {!full && (
            <button className="btn-primary" type="button" onClick={onAddCurrent}>
              + Add “{currentWorld}” from the sculptor
            </button>
          )}

          {!full && (
            <details className="picker">
              <summary>Or one of your saved worlds</summary>
              {worldsError ? (
                <p className="empty">Could not reach the gallery. {worldsError}</p>
              ) : worlds.length === 0 ? (
                <p className="empty">
                  Nothing saved yet. Save a world from the sculptor and it will show up here.
                </p>
              ) : (
                worlds.map((w) => (
                  <div className="card" key={w.slug} style={{ cursor: 'default' }}>
                    <span
                      className="globe"
                      style={{ background: `radial-gradient(circle at 34% 30%, #fff6, ${w.dot})` }}
                    />
                    <span className="body">
                      <span className="title">{w.name}</span>
                      <span className="sub">{w.sub}</span>
                    </span>
                    <button
                      className="go"
                      type="button"
                      aria-label={`Add ${w.name} to this system`}
                      onClick={() => onAddSaved(w)}
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </details>
          )}

          {system.bodies.map((b, i) => (
            <div className="scan-card" key={`edit-${b.name}-${i}`}>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <Field label={`World ${i + 1}`}>
                    <input
                      type="text"
                      value={b.name}
                      aria-label={`Name of world ${i + 1}`}
                      onChange={(e) => setBody(i, { name: e.target.value })}
                    />
                  </Field>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <button
                    className="icon-btn"
                    style={{ height: 44 }}
                    type="button"
                    disabled={full}
                    title={
                      full
                        ? `Full — ${MAX_BODIES} worlds is the limit`
                        : `Another world like ${b.name}, further out`
                    }
                    aria-label={`Duplicate ${b.name}`}
                    onClick={() => onDuplicate(i)}
                  >
                    ⧉
                  </button>
                  {!b.orbits && (
                    <button
                      className="icon-btn"
                      style={{ height: 44, width: 'auto', padding: '0 12px' }}
                      type="button"
                      disabled={full}
                      title={
                        full
                          ? `Full — ${MAX_BODIES} worlds is the limit`
                          : `Roll a moon into orbit around ${b.name}`
                      }
                      aria-label={`Add a moon to ${b.name}`}
                      onClick={() => onAddMoon(i)}
                    >
                      ☾
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    style={{ height: 44 }}
                    type="button"
                    title={`Remove ${b.name}`}
                    aria-label={`Remove ${b.name}`}
                    onClick={() => removeBody(i)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="Orbits">
                  <select
                    value={b.orbits ?? ''}
                    aria-label={`What ${b.name} orbits`}
                    disabled={hasMoons(b.name)}
                    title={hasMoons(b.name) ? `${b.name} has moons of its own` : undefined}
                    onChange={(e) => onSystem(setParent(system, i, e.target.value))}
                  >
                    <option value="">{system.star.name} — the star</option>
                    {system.bodies
                      .filter((x, k) => k !== i && !x.orbits)
                      .map((x) => (
                        <option key={x.name} value={x.name}>
                          {x.name} — as a moon
                        </option>
                      ))}
                    {b.orbits && !system.bodies.some((x) => x.name === b.orbits) && (
                      <option value={b.orbits}>{b.orbits}</option>
                    )}
                  </select>
                </Field>
                <Slider
                  name={b.orbits ? `Distance from ${b.orbits}` : 'Distance'}
                  value={b.orbits ? SAT_DIST.to(b.a) : DIST.to(b.a)}
                  format={() =>
                    b.orbits
                      ? `${fmtMoonDist(b.a, parentOf(b)?.radius ?? 1)} · ${fmtPeriod(b.period)}`
                      : `${fmtAU(b.a)} · ${fmtPeriod(b.period)}`
                  }
                  onChange={(t) => setBody(i, { a: b.orbits ? SAT_DIST.from(t) : DIST.from(t) })}
                />
                <div className="note" style={{ marginBottom: 10 }}>
                  {formatClimate(climateForBody(system, b))} ·{' '}
                  {climateForBody(system, b).inHabitableZone ? 'inside' : 'outside'} habitable zone{' '}
                  {climateForBody(system, b).habitableZoneInnerAU.toFixed(2)}–
                  {climateForBody(system, b).habitableZoneOuterAU.toFixed(2)} AU
                </div>
                <Slider
                  name="Size"
                  value={SIZE.to(b.radius)}
                  format={() => `${b.radius < 1 ? b.radius.toFixed(2) : b.radius.toFixed(1)}× Earth`}
                  onChange={(t) => setBody(i, { radius: SIZE.from(t) })}
                />
                <Slider
                  name="Orbit stretch"
                  value={b.e / 0.7}
                  format={() => (b.e < 0.01 ? 'circular' : `e ${b.e.toFixed(2)}`)}
                  onChange={(t) => setBody(i, { e: t * 0.7 })}
                />
              </div>
            </div>
          ))}

          <button
            className="btn-save"
            type="button"
            disabled={saving || system.bodies.length === 0}
            onClick={onSave}
          >
            {saving ? 'Saving…' : savedSlug ? 'Saved — link copied' : 'Save & share this system'}
          </button>
        </>
      )}

      {/* --- systems saved from this browser -------------------------------- */}
      <div className="field-label" style={{ marginTop: 4 }}>
        Your saved systems
      </div>
      {systemsError ? (
        <p className="empty">{systemsError}</p>
      ) : systemsLoading ? (
        <p className="empty">Looking…</p>
      ) : systems.length === 0 ? (
        <p className="empty">No systems saved yet. Build one and it will show up here.</p>
      ) : (
        systems.map((s) => (
          <button className="card" key={s.slug} type="button" onClick={() => onOpenSaved(s)}>
            <span
              className="globe"
              style={{ background: `radial-gradient(circle at 34% 30%, #fff8, ${s.dot})` }}
            />
            <span className="body">
              <span className="title">{s.name}</span>
              <span className="sub">{s.sub}</span>
            </span>
            <span className="go">Open</span>
          </button>
        ))
      )}
    </>
  )
}
