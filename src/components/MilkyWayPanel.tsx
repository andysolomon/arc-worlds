import { SOLAR } from '../data/presets'
import { Segmented } from './ui'

interface Props {
  view: 'single' | 'system'
  sizeMode: 'same' | 'scale'
  onView: (v: 'single' | 'system') => void
  onSizeMode: (v: 'same' | 'scale') => void
  onVisit: (index: number) => void
}

export function MilkyWayPanel({ view, sizeMode, onView, onSizeMode, onVisit }: Props) {
  return (
    <>
      <Segmented<'single' | 'system'>
        options={[['single', 'Planet list'], ['system', 'Orbit view']]}
        value={view}
        onChange={onView}
      />

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
            Every planet moves at its real orbital pace — one Earth year ≈ 14 seconds — on its real
            elliptical, tilted path. <strong>Same size</strong> draws every planet alike for easy
            spotting; <strong>To scale</strong> ranks them by true size, so Jupiter and Saturn tower
            over Earth. Distances are eased inward and the Sun is still far smaller than life. Drag
            to tilt, scroll to zoom, click a planet to visit it.
          </div>
        </>
      ) : (
        <>
          <p className="empty" style={{ padding: '0 2px 4px', textAlign: 'left' }}>
            Our own neighbourhood, re-imagined in miniature. Visit one, then sculpt it into
            something new.
          </p>
          {SOLAR.map((s, i) => (
            <button className="card" key={s.key} type="button" onClick={() => onVisit(i)}>
              <span className="globe" style={{ background: `radial-gradient(circle at 34% 30%, #fff6, ${s.dot})` }} />
              <span className="body">
                <span className="title">{s.name}</span>
                <span className="sub">{s.sub}</span>
              </span>
              <span className="go">Visit</span>
            </button>
          ))}
        </>
      )}
    </>
  )
}
