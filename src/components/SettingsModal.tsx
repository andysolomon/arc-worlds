import { useEffect, useRef } from 'react'
import { NEBULAE, type DisplayOptions } from '../lib/display'
import { Chip, Field, Slider } from './ui'

interface Props {
  display: DisplayOptions
  /** The plain switches. */
  onToggle: (k: 'paths' | 'labels' | 'moons' | 'sky') => void
  /** Everything with a value rather than a state. */
  onSet: <K extends keyof DisplayOptions>(k: K, v: DisplayOptions[K]) => void
  onClose: () => void
}

/**
 * Viewer preferences, in one place reachable from anywhere.
 *
 * These used to live partway down the Systems panel, which put them behind a
 * tab switch and made the ones that matter in both views — exposure, the
 * starfield, the nebula wash — look like properties of a solar system. Nothing
 * here belongs to a world or a system; see lib/display.ts.
 */
export function SettingsModal({ display, onToggle, onSet, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)

  // Escape closes, and the dialog takes focus so a keyboard reaches the
  // controls without tabbing back through the whole page behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-scrim" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        ref={panel}
        // The scrim closes on click, and the dialog sits inside it.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="btn-ghost" type="button" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="modal-body">
          <div>
            <div className="field-label">Display</div>
            <div className="chips">
              <Chip on={display.paths} onClick={() => onToggle('paths')}>
                Orbit paths
              </Chip>
              <Chip on={display.labels} onClick={() => onToggle('labels')}>
                Labels
              </Chip>
              <Chip on={display.moons} onClick={() => onToggle('moons')}>
                Moons
              </Chip>
              <Chip on={display.sky} onClick={() => onToggle('sky')}>
                Sky
              </Chip>
            </div>
            {(!display.paths || !display.moons || display.sky) && (
              <div className="note" style={{ marginTop: 10 }}>
                {!display.paths &&
                  'Paths are hidden — hover a planet in the orbit view to glimpse its own. '}
                {!display.moons &&
                  'Moons are off, so visiting a planet skips building them — the quickest performance win. '}
                {display.sky &&
                  'Visit a planet or a moon and its own sky is drawn: the star it orbits, at the size ' +
                    'it really looks from there, and the other planets as the points of light they are. ' +
                    'Everything sits where it truly lies, so the star is wherever the light is coming ' +
                    'from — usually over your shoulder. Drag to turn round and find it. Labels name them.'}
              </div>
            )}
          </div>

          <Field label="Universe">
            <Slider
              name="Star density"
              value={display.starDensity}
              onChange={(v) => onSet('starDensity', v)}
            />
            <Slider
              name="Star brightness"
              value={display.starBright}
              onChange={(v) => onSet('starBright', v)}
            />
            <Slider name="Exposure" value={display.exposure} onChange={(v) => onSet('exposure', v)} />
            <div className="chips" style={{ marginTop: 8 }}>
              {NEBULAE.map((n) => (
                <Chip
                  key={n.key}
                  on={display.nebula === n.key}
                  dot={n.dot}
                  onClick={() => onSet('nebula', n.key)}
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

          {/*
            Hold on hover is deliberately not repeated here. It is a time
            control and it lives in the time bar; a second button answering to
            the same accessible name would also make every name-based lookup in
            the e2e suite and the performance benchmark ambiguous.
          */}
        </div>
      </div>
    </div>
  )
}
