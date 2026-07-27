import type { SavedWorld } from '../lib/api'

interface Props {
  worlds: SavedWorld[]
  loading: boolean
  error: string | null
  onOpen: (w: SavedWorld) => void
  onCopyLink: (w: SavedWorld) => void
  copiedSlug: string | null
}

export function WorldsPanel({ worlds, loading, error, onOpen, onCopyLink, copiedSlug }: Props) {
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

  return (
    <>
      <p className="empty" style={{ padding: '0 2px 4px', textAlign: 'left' }}>
        Recently saved worlds. Each one regenerates from its seed and sliders, so opening a world
        rebuilds it in full 3D rather than showing a picture of it.
      </p>
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
          <button className="go" type="button" onClick={() => onCopyLink(w)} style={{ cursor: 'pointer' }}>
            {copiedSlug === w.slug ? 'Copied' : 'Link'}
          </button>
        </div>
      ))}
    </>
  )
}
