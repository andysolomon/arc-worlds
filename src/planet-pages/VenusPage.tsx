import { useEffect, useMemo, useState } from 'react'
import { AppLink } from '../components/AppLink'
import { Viewport } from '../components/Viewport'
import { SOLAR } from '../data/presets'
import { MILKY_WAY } from '../data/systems'
import type { PlanetParams } from '../engine/types'
import { DEFAULT_PARAMS } from '../lib/params'
import { computeScan, type ScanResult } from '../lib/scan'
import { VENUS_CONTENT, type PlanetPageAsset } from './venusContent'
import './venus.css'

const venus = SOLAR.find((world) => world.key === 'venus')!
const CANONICAL_VENUS: PlanetParams = {
  ...DEFAULT_PARAMS,
  ...venus.params,
  preset: venus.key,
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

function ResponsiveImage({
  asset,
  loading = 'lazy',
  className,
}: {
  asset: PlanetPageAsset
  loading?: 'eager' | 'lazy'
  className?: string
}) {
  return (
    <picture>
      <source type="image/avif" srcSet={asset.sources.avif} />
      <source type="image/webp" srcSet={asset.sources.webp} />
      <img
        className={className}
        src={asset.sources.fallback}
        srcSet={asset.sources.srcSet}
        sizes="(max-width: 720px) 92vw, 640px"
        alt={asset.alt}
        loading={loading}
        decoding="async"
      />
    </picture>
  )
}

export default function VenusPage() {
  const reducedMotion = useReducedMotion()
  const [webglFailed, setWebglFailed] = useState(false)
  const [activeBeat, setActiveBeat] = useState<(typeof VENUS_CONTENT.beatIds)[number]>(
    VENUS_CONTENT.beatIds[0],
  )
  const [scan, setScan] = useState<ScanResult | null>(null)
  const clouds = VENUS_CONTENT.assets.find((asset) => asset.id === 'clouds')!
  const radar = VENUS_CONTENT.assets.find((asset) => asset.id === 'radar')!

  const viewportParams = useMemo<PlanetParams>(
    () => ({
      ...CANONICAL_VENUS,
      mode: 'single',
      tier: 'flat',
      showPaths: false,
      showLabels: false,
      showMoons: false,
      autoRotate: !reducedMotion,
      timeScale: reducedMotion ? 0 : 0.16,
      starDensity: 0.28,
      starBright: 0.45,
      exposure: 0.52,
    }),
    [reducedMotion],
  )

  useEffect(() => {
    let active = true
    computeScan(CANONICAL_VENUS).then((result) => {
      if (active) setScan(result)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const sections = VENUS_CONTENT.beatIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => !!section)
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries.find((entry) => entry.isIntersecting)
        if (current) {
          setActiveBeat(current.target.id as (typeof VENUS_CONTENT.beatIds)[number])
        }
      },
      { rootMargin: '-18% 0px -62% 0px', threshold: 0 },
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const temperature = scan?.atmoSummary.match(/\d+\s*°C/)?.[0]
  const carbonDioxide = scan?.gases.find((gas) => gas.f === 'CO₂')

  return (
    <div className="venus-page">
      <header className="venus-header">
        <AppLink className="venus-back" href="/">
          <span aria-hidden="true">←</span> Back to Little Worlds
        </AppLink>
        <span className="venus-kicker">A Little Worlds field trip</span>
      </header>

      <div className="venus-intro">
        <p className="venus-eyebrow">Planet 02 · our nearest neighbour</p>
        <h1>Venus, beneath the veil</h1>
        <p>
          Nearly Earth-sized. Utterly unlike Earth at the surface. Follow the evidence from the
          clouds down to the cause.
        </p>
      </div>

      <div className="venus-layout">
        <aside className="venus-visual-column" aria-label="Venus visual">
          <div className="venus-visual-sticky">
            <div className="venus-viewport-shell" data-webgl-failed={webglFailed}>
              <div className="venus-poster" data-testid="venus-poster">
                <ResponsiveImage asset={clouds} loading="eager" />
              </div>
              {!webglFailed && (
                <Viewport
                  params={viewportParams}
                  system={MILKY_WAY}
                  ariaLabel="Slowly rotating model of canonical Venus"
                  onError={() => setWebglFailed(true)}
                />
              )}
              <div className="venus-viewport-label">
                <span>Venus</span>
                <small>{webglFailed ? 'Static mission image' : reducedMotion ? 'Rotation paused' : 'Live model · slow rotation'}</small>
              </div>
            </div>
            {webglFailed && (
              <p className="venus-webgl-note" role="status">
                The live model is unavailable. The complete field trip and mission imagery remain
                below.
              </p>
            )}
            <nav className="venus-beat-nav" aria-label="Field trip sections">
              <ol>
                {VENUS_CONTENT.beatIds.map((id, index) => (
                  <li key={id}>
                    <a href={`#${id}`} aria-current={activeBeat === id ? 'location' : undefined}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      {VENUS_CONTENT.beatTitles[index]}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </aside>

        <main className="venus-story">
          <section id="veil" aria-labelledby="veil-title">
            <p className="venus-section-number">01</p>
            <h2 id="veil-title">The Veil</h2>
            <p className="venus-lede">
              Visible light stops at a global deck of sulphuric-acid clouds. It cannot show us
              Venus’s ground.
            </p>
            <p>
              The cloud patterns emerge most clearly when orange and ultraviolet observations are
              combined and contrast-enhanced. To see the solid planet, spacecraft send radio waves
              through the clouds and measure what returns.
            </p>
            <div className="venus-image-compare">
              <figure>
                <ResponsiveImage asset={clouds} />
                <figcaption>
                  <strong>Clouds, not ground.</strong> {clouds.caption}{' '}
                  <a href={clouds.source} target="_blank" rel="noreferrer">Source</a>
                </figcaption>
              </figure>
              <figure>
                <ResponsiveImage asset={radar} />
                <figcaption>
                  <strong>Radar-derived surface view.</strong> {radar.caption}{' '}
                  <a href={radar.source} target="_blank" rel="noreferrer">Source</a>
                </figcaption>
              </figure>
            </div>
          </section>

          <section id="crush" aria-labelledby="crush-title">
            <p className="venus-section-number">02</p>
            <h2 id="crush-title">The Crush</h2>
            <p className="venus-lede">
              At the surface, the atmosphere presses with roughly the weight of an ocean one
              kilometre deep.
            </p>
            <svg
              className="venus-comparison"
              viewBox="0 0 680 300"
              role="img"
              aria-labelledby="pressure-title pressure-desc"
            >
              <title id="pressure-title">Earth and Venus surface comparison</title>
              <desc id="pressure-desc">
                Earth is approximately one bar and 15 degrees Celsius. Venus is 92 bar and 464
                degrees Celsius.
              </desc>
              <rect className="comparison-earth" x="30" y="218" width="270" height="52" rx="18" />
              <rect className="comparison-venus" x="380" y="28" width="270" height="242" rx="18" />
              <text x="56" y="82" className="comparison-name">Earth</text>
              <text x="56" y="116" className="comparison-value">≈ 1 bar</text>
              <text x="56" y="148" className="comparison-temp">≈ 15 °C</text>
              <text x="406" y="82" className="comparison-name">Venus</text>
              <text x="406" y="126" className="comparison-value">{scan?.pressure ?? 'Measuring…'}</text>
              <text x="406" y="164" className="comparison-temp">{temperature ?? 'Measuring…'}</text>
              <text x="30" y="292" className="comparison-axis">surface pressure · block height is illustrative</text>
            </svg>
            <p>
              Pressure and heat are different hazards, but on Venus they share a source: an
              extraordinarily massive atmosphere.
            </p>
          </section>

          <section id="heat-trap" aria-labelledby="heat-title">
            <p className="venus-section-number">03</p>
            <h2 id="heat-title">The Heat Trap</h2>
            <p className="venus-lede">
              Sunlight enters. The warm surface emits infrared energy. Carbon dioxide repeatedly
              absorbs and re-emits that outgoing energy.
            </p>
            <div className="heat-chain" aria-label="Venus greenhouse sequence">
              <span>Sunlight reaches the clouds and surface</span>
              <span aria-hidden="true">→</span>
              <span>The surface radiates heat upward</span>
              <span aria-hidden="true">→</span>
              <span>A deep CO₂ atmosphere slows heat’s escape</span>
            </div>
            <p>
              The measured present state is clear: CO₂ dominates the atmosphere and the surface is
              extremely hot. Exactly when Venus entered this state, how fast it happened, and how
              much water it began with remain active research questions.
            </p>
          </section>

          <section id="missing-water" aria-labelledby="water-title">
            <p className="venus-section-number">04</p>
            <h2 id="water-title">The Missing Water</h2>
            <p className="venus-lede">
              Venus carries the chemical fingerprint of substantial water loss—not a settled
              photograph of a former ocean.
            </p>
            <ol className="water-steps">
              <li><span>1</span> Water vapour reached high atmosphere.</li>
              <li><span>2</span> Ultraviolet sunlight split H₂O molecules.</li>
              <li><span>3</span> Light hydrogen escaped more readily than heavy deuterium.</li>
              <li><span>4</span> The deuterium enrichment left behind records severe loss.</li>
            </ol>
            <p>
              Venus may once have had a surface ocean, but deuterium does not prove one by itself.
              It establishes that the planet lost a substantial water inventory; the starting
              amount and climate history are uncertain.
            </p>
            <p className="venus-source-note">
              Evidence: <a href="https://ntrs.nasa.gov/citations/19820047738" target="_blank" rel="noreferrer">NASA Technical Reports Server</a>
            </p>
          </section>

          <section id="radar-world" aria-labelledby="radar-title">
            <p className="venus-section-number">05</p>
            <h2 id="radar-title">The Radar World</h2>
            <p className="venus-lede">
              Magellan’s radar mapped a planet resurfaced on an extraordinary scale.
            </p>
            <figure className="venus-radar-wide">
              <ResponsiveImage asset={radar} />
              <figcaption>
                {radar.caption} Credit: {radar.credit}. {radar.licence.label}; derivative:
                {' '}{radar.transformation}
              </figcaption>
            </figure>
            <p>
              NASA reports that volcanic flows cover at least 85% of Venus. Radar-bright terrain
              can reflect surface roughness, material properties, slope, and viewing geometry; it
              is not automatically high ground. Separate Magellan altimetry provides topographic
              measurements.
            </p>
            <p>
              Changes seen between radar observations and signs of a vent expanding during the
              Magellan mission support geologically recent—and possibly ongoing—volcanism.
              Researchers are still testing the timing, frequency, and mechanisms.
            </p>
            <p className="venus-source-note">
              Product: <a href={radar.source} target="_blank" rel="noreferrer">USGS Magellan global mosaic</a>
              {' '}· Mission context: <a href="https://science.nasa.gov/mission/magellan/" target="_blank" rel="noreferrer">NASA Magellan</a>
            </p>
          </section>

          <section id="scan" aria-labelledby="scan-title">
            <p className="venus-section-number">06</p>
            <h2 id="scan-title">Scan: Why Venus Is Hell</h2>
            <p className="venus-lede">
              The same canonical spectrometer profile used in Little Worlds closes the chain.
            </p>
            <div className="venus-scan" aria-live="polite">
              {scan ? (
                <>
                  <div>
                    <small>Atmosphere</small>
                    <strong>{scan.atmoTitle}</strong>
                  </div>
                  <div>
                    <small>Surface pressure</small>
                    <strong>{scan.pressure}</strong>
                  </div>
                  <div>
                    <small>Surface temperature</small>
                    <strong>{temperature}</strong>
                  </div>
                  <div>
                    <small>Dominant gas</small>
                    <strong>{carbonDioxide?.f} · {carbonDioxide?.pct}</strong>
                  </div>
                </>
              ) : (
                <p>Reading the canonical Venus profile…</p>
              )}
            </div>
            <p className="venus-conclusion">
              <strong>Massive CO₂ atmosphere</strong>
              <span aria-hidden="true">→</span>
              <strong>extreme greenhouse heating and crushing pressure</strong>
              <span aria-hidden="true">→</span>
              <strong>severe water loss and no Earth-like surface climate</strong>
            </p>
            <aside className="venus-unknown">
              <strong>Still unknown:</strong> Venus’s core size and whether it is fully liquid or
              partly solid remain unresolved. Future missions will use gravity, topography, and
              surface observations to constrain its interior—without pretending we can see it
              directly.
            </aside>
            <AppLink className="venus-return" href="/">
              Return to the sculptor
            </AppLink>
          </section>
        </main>
      </div>
    </div>
  )
}
