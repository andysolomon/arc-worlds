import { MAX_BODIES } from '../lib/systems'
import type { SavedWorld } from '../lib/api'
import type { SystemDef } from '../engine/types'

interface Props {
  worlds: SavedWorld[]
  loading: boolean
  error: string | null
  onOpen: (w: SavedWorld) => void
  onCopyLink: (w: SavedWorld) => void
  copiedSlug: string | null
  /** The system a world would be added to — named here, since it is not on screen. */
  system: SystemDef
  onAdd: (w: SavedWorld) => void
  addedSlug: string | null
}

export function WorldsPanel(props: Props) {
  const { worlds, loading, error, onOpen, onCopyLink, copiedSlug, system, onAdd, addedSlug } = props

  if (loading) return <p className="empty">Loading the gallery…</p>

  if (error) {
    return (
      <p className="empty">
        Could not reach the gallery.
        <br />
        {error}
      </p>
    )
  }

  if (!worlds.length) {
    return (
      <p className="empty">
        Nothing here yet.
        <br />
        Sculpt a world and save it — you&rsquo;ll get a link you can send to anyone, and it will
        show up here.
      </p>
    )
  }

  const editable = system.origin === 'custom'
  const full = editable && system.bodies.length >= MAX_BODIES

  return (
    <>
      <p className="empty" style={{ padding: '0 2px 4px', textAlign: 'left' }}>
        Recently saved worlds. Each one regenerates from its seed and sliders, so opening a world
        rebuilds it in full 3D rather than showing a picture of it.
      </p>

      {/* The system being added to lives on another tab, so it is named here —
          otherwise Add would silently change something you cannot see. */}
      <div className="note">
        <strong>Add</strong> puts a world into <strong>{system.name}</strong>, on an orbit outside
        everything already there.{' '}
        {!editable
          ? `${system.name} is read-only, so you will get an editable copy of it to keep.`
          : full
            ? `That system is full — ${MAX_BODIES} worlds is the limit.`
            : 'The Systems tab is where you then move it about.'}
      </div>

      {worlds.map((w) => (
        <div className="card" key={w.slug} style={{ cursor: 'default' }}>
          <button
            type="button"
            onClick={() => onOpen(w)}
            style={{ display: 'contents', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="globe" style={{ background: `radial-gradient(circle at 34% 30%, #fff6, ${w.dot})` }} />
            <span className="body">
              <span className="title">{w.name}</span>
              <span className="sub">{w.sub}</span>
            </span>
          </button>
          <button className="go ghost" type="button" onClick={() => onCopyLink(w)} style={{ cursor: 'pointer' }}>
            {copiedSlug === w.slug ? 'Copied' : 'Link'}
          </button>
          <button
            className="go"
            type="button"
            disabled={full}
            aria-label={`Add ${w.name} to ${system.name}`}
            onClick={() => onAdd(w)}
            style={{ cursor: full ? 'default' : 'pointer' }}
          >
            {addedSlug === w.slug ? 'Added' : 'Add'}
          </button>
        </div>
      ))}
    </>
  )
}
