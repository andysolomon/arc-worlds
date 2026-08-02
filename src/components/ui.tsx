import type { CSSProperties, ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}

export function Slider({
  name, value, onChange, disabled, format, band,
}: {
  name: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  format?: (v: number) => string
  /** Optional highlighted interval on the slider's normalized 0–1 scale. */
  band?: { start: number; end: number; label: string }
}) {
  const bandStart = Math.max(0, Math.min(1, Math.min(band?.start ?? 0, band?.end ?? 0)))
  const bandEnd = Math.max(0, Math.min(1, Math.max(band?.start ?? 0, band?.end ?? 0)))
  const rangeStyle = band
    ? ({
        '--range-track': `linear-gradient(to right, #e6d9c6 0%, #e6d9c6 ${bandStart * 100}%, #74cfa5 ${bandStart * 100}%, #74cfa5 ${bandEnd * 100}%, #e6d9c6 ${bandEnd * 100}%, #e6d9c6 100%)`,
      } as CSSProperties)
    : undefined
  return (
    <div>
      <div className="slider-head">
        <span className="name">{name}</span>
        <span className="val">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        aria-label={name}
        style={rangeStyle}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {band && (
        <div className="range-legend">
          <span className="range-legend-dot" />
          {band.label}
        </div>
      )}
    </div>
  )
}

export function Chip({
  on, dot, children, onClick,
}: {
  on: boolean
  dot?: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button className="chip" aria-pressed={on} onClick={onClick} type="button">
      {dot && <span className="dot" style={{ background: dot }} />}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: Array<[T, string]>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Bar({ width, color }: { width: string; color?: string }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width, ...(color ? { background: color } : null) }} />
    </div>
  )
}
