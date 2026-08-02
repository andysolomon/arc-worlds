import { Fragment, useState } from 'react'
import { MAX_BODIES, worldInSystem } from '../lib/systems'
import type { SavedSystem, SavedWorld } from '../lib/api'
import type { SystemDef } from '../engine/types'
import { Field } from './ui'

interface Props {
  worlds: SavedWorld[]
  loading: boolean
  error: string | null
  onOpen: (w: SavedWorld) => void
  onCopyLink: (w: SavedWorld) => void
  copiedSlug: string | null
  /** The system on the Systems tab — the default destination for Add. */
  system: SystemDef
  /** Saved systems, offered as alternative destinations. */
  systems: SavedSystem[]
  onAdd: (w: SavedWorld, target?: SavedSystem | null) => void
  addedSlug: string | null
}

export function WorldsPanel(props: Props) {
  const {
    worlds, loading, error, onOpen, onCopyLink, copiedSlug, system, systems, onAdd, addedSlug,
  } = props

  const [targetSlug, setTargetSlug] = useState('')
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null)

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
        Build a world here, save it, and it will appear in this collection with a link you can
        send to anyone.
      </p>
    )
  }

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

  return (
    <>
      <p className="empty" style={{ padding: '0 2px 4px', textAlign: 'left' }}>
        Worlds you have saved in this browser. Each one regenerates from its seed and sliders, so
        opening a world rebuilds it in full 3D rather than showing a picture of it. Anyone you send a
        link to can open it, but only you see this list.
      </p>

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
        <strong>Add</strong> puts a world into <strong>{targetName}</strong>, on an orbit outside
        everything already there.{' '}
        {!editable
          ? `${targetName} is read-only, so you will get an editable copy of it to keep.`
          : full
            ? `That system is full — ${MAX_BODIES} worlds is the limit.`
            : 'Open Systems when you want to move it between orbits.'}
      </div>

      {worlds.map((w) => (
        <Fragment key={w.slug}>
          <div className="card" style={{ cursor: 'default' }}>
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
              aria-label={`Add ${w.name} to ${targetName}`}
              onClick={() => tryAdd(w)}
              style={{ cursor: full ? 'default' : 'pointer' }}
            >
              {addedSlug === w.slug ? 'Added' : 'Add'}
            </button>
          </div>
          {confirmSlug === w.slug && (
            <div className="note" role="alert">
              <strong>{w.name}</strong> is already orbiting in {targetName}. Add it again anyway?
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn-ghost" type="button" onClick={() => tryAdd(w)}>
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
    </>
  )
}
