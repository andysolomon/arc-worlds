import { PRESETS } from '../data/presets'
import { Chip, Field, Slider } from './ui'
import type { PlanetParams, PresetKey } from '../engine/types'

const ATMOS = ['#8fc7ff', '#ffcf8f', '#9fe8c9', '#ff8fc7', '#b9a8ff']

interface Props {
  params: PlanetParams
  name: string
  onName: (v: string) => void
  onParam: <K extends keyof PlanetParams>(k: K, v: PlanetParams[K]) => void
  onPreset: (key: PresetKey) => void
  onReshape: () => void
  onSave: () => void
  saving: boolean
  saved: boolean
}

export function SculptPanel({
  params: P, name, onName, onParam, onPreset, onReshape, onSave, saving, saved,
}: Props) {
  const isReal = !!P.texture
  const preset = PRESETS.find((p) => p.key === P.preset)
  const isGas = !!preset?.gas
  // A real planet shows its photographic map, so the terrain sliders do nothing
  // until you reshape it into a sculpted world.
  const landLocked = isReal

  return (
    <>
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
      <Slider name="Ice caps" value={P.ice} disabled={landLocked || isGas} onChange={(v) => onParam('ice', v)} />
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
    </>
  )
}
