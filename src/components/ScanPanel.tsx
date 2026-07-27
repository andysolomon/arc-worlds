import { useState } from 'react'
import { Bar, Segmented } from './ui'
import type { ScanResult } from '../lib/scan'

type Section = 'atmo' | 'surf' | 'light'

interface Props {
  worldName: string
  scan: ScanResult | null
  scanning: boolean
  onScan: () => void
}

export function ScanPanel({ worldName, scan, scanning, onScan }: Props) {
  const [section, setSection] = useState<Section>('atmo')

  return (
    <>
      <button className="btn-primary" type="button" onClick={onScan} disabled={scanning}>
        {scanning ? 'Reading spectrum…' : `Run spectrometer on ${worldName}`}
      </button>

      {!scan && !scanning && (
        <p className="empty">
          Split this world&rsquo;s reflected sunlight into a spectrum. Every element and compound
          absorbs its own set of wavelengths — that fingerprint tells you what the air is made of,
          whether there is water, and why the planet is the colour it is.
        </p>
      )}

      {scan && (
        <>
          <Segmented<Section>
            options={[['atmo', 'Atmosphere'], ['surf', 'Surface & water'], ['light', 'Light']]}
            value={section}
            onChange={setSection}
          />

          {section === 'atmo' && (
            <>
              <div className="scan-card">
                <div className="scan-head">
                  <h3>{scan.atmoTitle}</h3>
                  <span className="pressure">{scan.pressure}</span>
                </div>
                <p>{scan.atmoSummary}</p>
              </div>

              <div className="scan-card">
                <div className="field-label">Composition by volume</div>
                {scan.gases.map((g) => (
                  <div className="bar-row" key={g.f + g.n}>
                    <div className="bar-top">
                      <span>
                        <span className="f">{g.f}</span>
                        <span className="n">{g.n}</span>
                      </span>
                      <span className="p">{g.pct}</span>
                    </div>
                    <Bar width={g.w} />
                    <div className="bar-note">{g.eff}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {section === 'surf' && (
            <>
              <div className="scan-card">
                <div className="field-label">{scan.surfLabel}</div>
                {scan.compounds.map((c) => (
                  <div className="bar-row" key={c.n + c.f}>
                    <div className="bar-top">
                      <span>
                        <span className="f">{c.n}</span>
                        <span className="n">{c.f}</span>
                      </span>
                      <span className="p">{c.pct}</span>
                    </div>
                    <Bar width={c.w} color={c.bar} />
                    <div className="bar-note">{c.note}</div>
                  </div>
                ))}
              </div>

              <div className="scan-card">
                <div className="dot-title">
                  <span className="dot" style={{ background: scan.water.dot }} />
                  <h3 style={{ margin: 0 }}>Water — {scan.water.state}</h3>
                </div>
                <p style={{ marginTop: 8 }}>{scan.water.detail}</p>
                <p style={{ marginTop: 8, color: '#8c7d92', fontSize: 12.5 }}>{scan.water.sig}</p>
              </div>

              <div className="scan-card">
                <div className="dot-title">
                  <span className="dot" style={{ background: scan.bio.dot }} />
                  <h3 style={{ margin: 0 }}>{scan.bio.title}</h3>
                </div>
                <p style={{ marginTop: 8 }}>{scan.bio.desc}</p>
              </div>
            </>
          )}

          {section === 'light' && (
            <>
              <div className="scan-card">
                <div className="field-label">Reflected spectrum</div>
                <div className="spectrum">
                  {scan.lines.map((l) => (
                    <span key={`${l.nm}-${l.label}`} className="mark" style={{ left: l.x, background: l.mark }} />
                  ))}
                </div>
                {scan.lines.map((l) => (
                  <div className="line-row" key={`${l.nm}-${l.label}-row`}>
                    <span className="nm" style={{ color: l.bg }}>
                      {l.nmLabel}
                    </span>
                    <span className="lbl">{l.label}</span>
                    <span className="desc">{l.desc}</span>
                  </div>
                ))}
              </div>

              {scan.colorWhy && (
                <div className="scan-card">
                  <h3>Why it looks like this</h3>
                  <p>{scan.colorWhy}</p>
                </div>
              )}
            </>
          )}

          {scan.note && (
            <div className="note">
              <strong>Oddity.</strong> {scan.note}
            </div>
          )}
        </>
      )}
    </>
  )
}
