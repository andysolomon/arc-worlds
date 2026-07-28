import { BUILT_IN_SYSTEMS } from '../data/systems'
import { PRESETS, SOLAR } from '../data/presets'
import { periodFor, starRadius, starSize } from '../engine/scale'
import {
  A_MAX, A_MIN, MASS_MAX, MASS_MIN, MAX_BODIES, STAR_KINDS,
  duplicateSystem, emptySystem, retime, rollSystem,
} from '../lib/systems'
import type { SavedSystem } from '../lib/api'
import type { SystemBody, SystemDef } from '../engine/types'
import { Field, Segmented, Slider } from './ui'

interface Props {
  system: SystemDef
  view: 'single' | 'system'
  sizeMode: 'same' | 'scale'
  onView: (v: 'single' | 'system') => void
  onSizeMode: (v: 'same' | 'scale') => void
  onVisit: (index: number) => void
  /** Select or replace the active system. */
  onSystem: (def: SystemDef) => void
  /** Drop the world currently in the sculptor into this system. */
  onAddCurrent: () => void
  currentWorld: string
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
const R_MIN = 0.15
const R_MAX = 16
const SIZE = logScale(R_MIN, R_MAX)

const fmtAU = (a: number) => (a < 10 ? `${a.toFixed(2)} AU` : `${a.toFixed(1)} AU`)

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
  if (years < 1) return `${(years * 365.25).toFixed(0)} day year`
  return `${years < 10 ? years.toFixed(1) : years.toFixed(0)} year orbit`
}

function bodyDot(b: SystemBody): string {
  const p = PRESETS.find((x) => x.key === b.params.preset)
  const s = SOLAR.find((x) => x.key === b.params.preset)
  return (b.texture ? s?.dot : p?.dot) ?? p?.dot ?? s?.dot ?? '#7fae62'
}

export function SystemsPanel(props: Props) {
  const {
    system, view, sizeMode, onView, onSizeMode, onVisit, onSystem, onAddCurrent,
    currentWorld, onSave, saving, savedSlug, systems, systemsLoading, systemsError, onOpenSaved,
  } = props

  const editable = system.origin === 'custom'
  const full = system.bodies.length >= MAX_BODIES

  const setBody = (i: number, patch: Partial<SystemBody>) => {
    const bodies = system.bodies.map((b, k) => {
      if (k !== i) return b
      const next = { ...b, ...patch }
      // A year is a consequence of the distance, so moving a planet re-times it.
      if (patch.a !== undefined) next.period = periodFor(next.a, system.star.mass)
      return next
    })
    // Deliberately not re-sorted here: dragging one planet past another would
    // reorder the list mid-drag and pull the slider out from under the pointer.
    // Order is settled when a body is added, and again when the system is saved.
    onSystem({ ...system, bodies })
  }

  const removeBody = (i: number) =>
    onSystem({ ...system, bodies: system.bodies.filter((_, k) => k !== i) })

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
        {system.origin === 'imagined' && 'Every number in it was invented, including the star.'}
        {system.origin === 'custom' &&
          'Yours to change — move the worlds about, add the one you are sculpting, then save it for a link.'}
      </div>

      <Segmented<'single' | 'system'>
        options={[['single', 'Body list'], ['system', 'Orbit view']]}
        value={view}
        onChange={onView}
      />

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
            blue-white star really is about seven times the width of a red dwarf. Drag to tilt,
            scroll to zoom, click a planet to visit it.
          </div>
        </>
      ) : system.bodies.length === 0 ? (
        <p className="empty">
          Nothing orbits {system.star.name} yet. Sculpt a world, then add it here.
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
                    onSystem(retime({ ...system, star: { ...system.star, color: k.color, mass: k.mass } }))
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
                  star: { ...system.star, mass: MASS_MIN + t * (MASS_MAX - MASS_MIN) },
                }),
              )
            }
          />
          <div className="note">
            Mass sets how fast everything orbits — a year is a consequence of where a planet is, not
            a number you pick. Move the star's mass and every orbit re-times itself, and the star
            grows or shrinks with it: a heavier star is a bigger one.
          </div>

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
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
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
                <Slider
                  name="Distance"
                  value={DIST.to(b.a)}
                  format={() => `${fmtAU(b.a)} · ${fmtPeriod(b.period)}`}
                  onChange={(t) => setBody(i, { a: DIST.from(t) })}
                />
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

          <button className="btn-primary" type="button" disabled={full} onClick={onAddCurrent}>
            {full ? `Full — ${MAX_BODIES} worlds is the limit` : `+ Add “${currentWorld}” to this system`}
          </button>

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

      {/* --- other people's systems ----------------------------------------- */}
      <div className="field-label" style={{ marginTop: 4 }}>
        Recently saved systems
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
