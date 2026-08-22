import { Fragment, useMemo, useState } from 'react'
import { MAX_BODIES, worldInSystem } from '../lib/systems'
import { buildCatalog, matchesQuery, type CatalogKind, type CatalogWorld } from '../lib/catalog'
import type { SavedSystem, SavedWorld } from '../lib/api'
import type { SystemDef } from '../engine/types'
import { Chip, Field } from './ui'

interface Props {
  worlds: SavedWorld[]
  loading: boolean
  error: string | null
  /** Open any world in the catalog — yours, measured, imagined, or a type. */
  onOpen: (w: CatalogWorld) => void
  onCopyLink: (w: SavedWorld) => void
  copiedSlug: string | null
  /** The system on the Systems tab — the default destination for Add. */
  system: SystemDef
  /** Saved systems, offered as alternative destinations. */
  systems: SavedSystem[]
  onAdd: (w: SavedWorld, target?: SavedSystem | null) => void
  addedSlug: string | null
}

/**
 * Worlds home: every world the app has, in categories.
 *
 * This is where the Worlds pill lands. It used to be a shelf of the worlds
 * saved in this browser and nothing else, which left the measured planets, the
 * reconstructions, the exoplanets and the homages reachable only by touring
 * the Systems tab one system at a time. The catalog itself lives in
 * `lib/catalog` and is assembled from the same tables the canvas builds from.
 */
export function WorldsPanel(props: Props) {
  const {
    worlds, loading, error, onOpen, onCopyLink, copiedSlug, system, systems, onAdd, addedSlug,
  } = props

  const [targetSlug, setTargetSlug] = useState('')
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null)
  const [category, setCategory] = useState<CatalogKind | 'all'>('all')
  const [query, setQuery] = useState('')

  const catalog = useMemo(() => buildCatalog(worlds), [worlds])

  // Filtering happens here rather than in the catalog so the chips can always
  // name every category, including the ones the current search has emptied.
  const shown = useMemo(
    () => catalog
      .filter((g) => category === 'all' || g.key === category)
      .map((g) => ({ ...g, worlds: g.worlds.filter((w) => matchesQuery(w, query)) }))
      .filter((g) => g.worlds.length > 0),
    [catalog, category, query],
  )

  const total = catalog.reduce((n, g) => n + g.worlds.length, 0)
  const found = shown.reduce((n, g) => n + g.worlds.length, 0)

  // Add aims at the chosen destination: the system currently on the Systems
  // tab by default, or any system saved from this browser.
  const target = systems.find((s) => s.slug === targetSlug) ?? null
  const targetDef = target ? target.def : system
  const targetName = target ? target.name : system.name
  const editable = targetDef.origin === 'custom'
  const full = editable && targetDef.bodies.length >= MAX_BODIES

  /**
   * The destination lives on another tab, so a world already orbiting there
   * is easy to add twice without noticing. Warn once, then let it through —
   * duplicates are allowed, just never silent.
   */
  const tryAdd = (w: SavedWorld) => {
    if (confirmSlug !== w.slug && worldInSystem(targetDef, w.params)) {
      setConfirmSlug(w.slug)
      return
    }
    setConfirmSlug(null)
    onAdd(w, target)
  }

  // The saved section carries its own status, so a gallery that is loading or
  // unreachable no longer hides the several dozen worlds that ship with the app.
  const savedStatus = loading
    ? 'Loading the worlds you have saved…'
    : error
      ? `Could not reach the gallery. ${error}`
      : worlds.length === 0
        ? 'Nothing saved yet. Build a world, save it, and it appears here with a link you can send to anyone.'
        : null

  return (
    <>
      <p className="empty" style={{ padding: '0 2px 4px', textAlign: 'left' }}>
        Every world in Little Worlds. Open one to look at it, scan it, or clone it into something
        of your own — the references stay read-only, and anything you build lands in <strong>Your
        worlds</strong>.
      </p>

      <Field label="Find a world">
        <input
          type="search"
          value={query}
          aria-label="Search worlds"
          placeholder="Name, system, or description"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>

      <Field label={`Categories · ${found} of ${total} worlds`}>
        <div className="chips">
          <Chip on={category === 'all'} onClick={() => setCategory('all')}>
            All
          </Chip>
          {catalog.map((g) => (
            <Chip key={g.key} on={category === g.key} onClick={() => setCategory(g.key)}>
              {g.label}
            </Chip>
          ))}
        </div>
      </Field>

      {/* The destination picker steers Add, which only appears on your own
          cards — so it stays out of the way until there is one to steer. */}
      {worlds.length > 0 && (category === 'all' || category === 'saved') && (
        <>
          <Field label="Add worlds to">
            <select
              aria-label="System to add worlds to"
              value={targetSlug}
              onChange={(e) => {
                setTargetSlug(e.target.value)
                setConfirmSlug(null)
              }}
            >
              <option value="">{system.name} — open in Systems now</option>
              {systems.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          {/* The destination lives on another tab, so it is named here —
              otherwise Add would silently change something you cannot see. */}
          <div className="note">
            <strong>Add</strong> puts one of your worlds into <strong>{targetName}</strong>, on an
            orbit outside everything already there.{' '}
            {!editable
              ? `${targetName} is read-only, so you will get an editable copy of it to keep.`
              : full
                ? `That system is full — ${MAX_BODIES} worlds is the limit.`
                : 'Open Systems when you want to move it between orbits.'}
          </div>

        </>
      )}

      {savedStatus && (category === 'all' || category === 'saved') && (
        <div>
          <div className="field-label">Your worlds</div>
          <p className="empty" style={{ padding: '12px 8px' }}>{savedStatus}</p>
        </div>
      )}

      {shown.map((group) => (
        <div key={group.key} className="catalog-group">
          <div className="field-label">
            {group.label} <span className="catalog-count">{group.worlds.length}</span>
          </div>
          <div className="note">{group.note}</div>

          {group.worlds.map((w) => (
            <Fragment key={w.id}>
              {w.saved ? (
                <div className="card" style={{ cursor: 'default' }}>
                  <button
                    type="button"
                    aria-label={`Open ${w.name}`}
                    onClick={() => onOpen(w)}
                    style={{ display: 'contents', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="globe" style={{ background: `radial-gradient(circle at 34% 30%, #fff6, ${w.dot})` }} />
                    <span className="body">
                      <span className="title">{w.name}</span>
                      <span className="sub">{w.sub}</span>
                    </span>
                  </button>
                  <button
                    className="go ghost"
                    type="button"
                    onClick={() => onCopyLink(w.saved!)}
                    style={{ cursor: 'pointer' }}
                  >
                    {copiedSlug === w.saved.slug ? 'Copied' : 'Link'}
                  </button>
                  <button
                    className="go"
                    type="button"
                    disabled={full}
                    aria-label={`Add ${w.name} to ${targetName}`}
                    onClick={() => tryAdd(w.saved!)}
                    style={{ cursor: full ? 'default' : 'pointer' }}
                  >
                    {addedSlug === w.saved.slug ? 'Added' : 'Add'}
                  </button>
                </div>
              ) : (
                /* Nothing else to do to a reference world, so the whole row is
                   the one action rather than a row with a button parked in it. */
                <button
                  className="card"
                  type="button"
                  aria-label={`${w.kind === 'type' ? 'Start' : 'Open'} ${w.name}`}
                  onClick={() => onOpen(w)}
                >
                  <span className="globe" style={{ background: `radial-gradient(circle at 34% 30%, #fff6, ${w.dot})` }} />
                  <span className="body">
                    <span className="title">{w.name}</span>
                    <span className="sub">{w.sub}</span>
                  </span>
                  <span className="go ghost" aria-hidden="true">
                    {w.kind === 'type' ? 'Start' : 'Open'}
                  </span>
                </button>
              )}

              {w.saved && confirmSlug === w.saved.slug && (
                <div className="note" role="alert">
                  <strong>{w.name}</strong> is already orbiting in {targetName}. Add it again anyway?
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn-ghost" type="button" onClick={() => tryAdd(w.saved!)}>
                      Add anyway
                    </button>
                    <button className="btn-ghost" type="button" onClick={() => setConfirmSlug(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      ))}

      {found === 0 && (
        <p className="empty">
          No world here matches “{query}”.
          <br />
          Try another name, or clear the search to see all {total}.
        </p>
      )}
    </>
  )
}
