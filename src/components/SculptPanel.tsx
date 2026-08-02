import { ANCIENT, MOONS, PRESETS, type AncientWorld } from '../data/presets'
import { realFor } from '../engine/planets'
import { Chip, Field, Slider } from './ui'
import type { PlanetParams, PresetKey } from '../engine/types'

const ATMOS = ['#8fc7ff', '#ffcf8f', '#9fe8c9', '#ff8fc7', '#b9a8ff']

interface Props {
  params: PlanetParams
  name: string
  /** Visit one of this world's moons, for the moons that are worlds. */
  onVisitMoon: (w: { preset: PresetKey; seed: number }) => void
  onName: (v: string) => void
  onParam: <K extends keyof PlanetParams>(k: K, v: PlanetParams[K]) => void
  onPreset: (key: PresetKey) => void
  onAncient: (a: AncientWorld) => void
  onReshape: () => void
  onSave: () => void
  saving: boolean
  saved: boolean
  /** Little Worlds originals are references; clone before changing them. */
  locked: boolean
  onClone: () => void
}

export function SculptPanel({
  params: P, name, onVisitMoon, onName, onParam, onPreset, onAncient, onReshape,
  onSave, saving, saved, locked, onClone,
}: Props) {
  // Moons that are worlds in their own right, on the body being shown. They
  // are visibly in orbit and clickable on the canvas, but a few pixels of
  // moving sprite is no way to offer something — so they are offered here too.
  const moonWorlds = (realFor(P)?.moons ?? []).flatMap((m) => {
    const w = m.world && MOONS.find((x) => x.key === m.world!.preset)
    return w ? [{ moon: m.n, world: m.world!, dot: w.dot, sub: w.sub }] : []
  })
  const isReal = !!P.texture
  const preset = PRESETS.find((p) => p.key === P.preset)
  const isGas = !!preset?.gas
  // A real planet shows its photographic map, so the terrain sliders do nothing
  // until you reshape it into a sculpted world.
  const landLocked = isReal

  return (
    <>
      {locked && (
        <div className="note world-lock" role="status">
          <strong>{name} is a Little Worlds original.</strong> You can explore and analyze it, but
          the reference world cannot be changed. Clone its world type into a new procedural seed
          to start building your own version.
          <button className="btn-primary" type="button" onClick={onClone}>
            Clone {name} to build
          </button>
        </div>
      )}

      {moonWorlds.length > 0 && (
        <Field label="Moons you can visit">
          <div className="chips">
            {moonWorlds.map((m) => (
              <Chip key={m.moon} on={false} dot={m.dot} onClick={() => onVisitMoon(m.world)}>
                {m.moon}
              </Chip>
            ))}
          </div>
          <div className="note" style={{ marginTop: 10 }}>
            Worlds in their own right, measured like the planets and scanning as themselves. You
            can also click one where it orbits.
          </div>
        </Field>
      )}

      <fieldset className="world-builder-fields" disabled={locked}>
      <div className="row">
        <div style={{ flex: 1 }}>
          <Field label="Name">
            <input type="text" value={name} onChange={(e) => onName(e.target.value)} aria-label="World name" />
          </Field>
        </div>
        <div style={{ width: 96 }}>
          <Field label="Seed">
            <input
              type="number"
              value={P.seed}
              aria-label="Seed"
              onChange={(e) => onParam('seed', Math.abs(Math.floor(Number(e.target.value))) || 0)}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            className="icon-btn"
            style={{ height: 44 }}
            title="Random seed"
            aria-label="Random seed"
            type="button"
            onClick={() => onParam('seed', (Math.random() * 99999) | 0)}
          >
            ⟳
          </button>
        </div>
      </div>

      <Field label="World type">
        <div className="chips">
          {PRESETS.map((p) => (
            <Chip key={p.key} on={P.preset === p.key} dot={p.dot} onClick={() => onPreset(p.key)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Ancient worlds">
        <div className="chips">
          {ANCIENT.map((a) => (
            <Chip
              key={a.key}
              on={P.preset === a.key && P.seed === a.params.seed}
              dot={a.dot}
              onClick={() => onAncient(a)}
            >
              {a.name}
            </Chip>
          ))}
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          Worlds we know existed, rebuilt from evidence — the spectrometer reads them as
          reconstructions and says so. Still yours to shape; change the seed and one becomes an
          ordinary world of its kind.
        </div>
      </Field>

      {landLocked && (
        <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>Showing the real surface, so the land sliders are resting.</span>
          <button className="icon-btn" style={{ width: 'auto', padding: '8px 14px' }} type="button" onClick={onReshape}>
            Reshape
          </button>
        </div>
      )}

      <Slider name="Mountains" value={P.mountains} disabled={landLocked || isGas} onChange={(v) => onParam('mountains', v)} />
      <Slider name="Sea level" value={P.water} disabled={landLocked || isGas} onChange={(v) => onParam('water', v)} />
      <Slider name="Roughness" value={P.roughness} disabled={landLocked} onChange={(v) => onParam('roughness', v)} />
      <Slider name="Clouds" value={P.clouds} disabled={isGas} onChange={(v) => onParam('clouds', v)} />
      <Slider name="Ice inventory" value={P.ice} disabled={landLocked || isGas} onChange={(v) => onParam('ice', v)} />
      <Slider name="Sky glow" value={P.glow} onChange={(v) => onParam('glow', v)} />

      <Field label="Atmosphere tint">
        <div className="chips">
          <Chip on={P.atmoColor == null} onClick={() => onParam('atmoColor', null)}>
            Natural
          </Chip>
          {ATMOS.map((hex) => (
            <Chip
              key={hex}
              dot={hex}
              on={P.atmoColor === Number(`0x${hex.slice(1)}`)}
              onClick={() => onParam('atmoColor', Number(`0x${hex.slice(1)}`))}
            >
              {''}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Sunlight">
        <Slider name="Direction" value={P.lightAz} onChange={(v) => onParam('lightAz', v)} format={(v) => `${Math.round(v * 360)}°`} />
        <Slider name="Height" value={P.lightEl} onChange={(v) => onParam('lightEl', v)} format={(v) => `${Math.round((v - 0.5) * 180)}°`} />
      </Field>

      {!isReal && (
        <>
          <Field label="Spin">
            <Slider name="Speed" value={P.spinSpeed} onChange={(v) => onParam('spinSpeed', v)} />
            <div className="seg" style={{ marginTop: 8 }}>
              <button type="button" aria-pressed={P.spinDir === 1} onClick={() => onParam('spinDir', 1)}>
                Prograde
              </button>
              <button type="button" aria-pressed={P.spinDir === -1} onClick={() => onParam('spinDir', -1)}>
                Retrograde
              </button>
            </div>
          </Field>

          <Field label="Moons">
            <div className="chips">
              {[0, 1, 2, 3].map((n) => (
                <Chip key={n} on={P.moons === n} onClick={() => onParam('moons', n)}>
                  {n === 0 ? 'None' : n}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Rings">
            <div className="seg">
              <button type="button" aria-pressed={!P.rings} onClick={() => onParam('rings', false)}>
                Off
              </button>
              <button type="button" aria-pressed={P.rings} onClick={() => onParam('rings', true)}>
                On
              </button>
            </div>
          </Field>

          {P.rings && (
            <>
              <Field label="Ring bands">
                <div className="chips">
                  {[1, 2, 3, 4].map((n) => (
                    <Chip key={n} on={P.ringN === n} onClick={() => onParam('ringN', n)}>
                      {n}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Slider name="Inner radius" value={P.ringInner} onChange={(v) => onParam('ringInner', v)} />
              <Slider name="Width" value={P.ringWidth} onChange={(v) => onParam('ringWidth', v)} />
              <Slider name="Gap" value={P.ringGap} onChange={(v) => onParam('ringGap', v)} />
              <Slider name="Tilt" value={P.ringTilt} onChange={(v) => onParam('ringTilt', v)} />
              <Slider name="Opacity" value={P.ringOpacity} onChange={(v) => onParam('ringOpacity', v)} />
            </>
          )}
        </>
      )}

      <button className="btn-save" type="button" onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved — link copied' : 'Save & get a link'}
      </button>
      </fieldset>
    </>
  )
}
