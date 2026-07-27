import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      {children}
    </div>
  )
}

export function Slider({
  name, value, onChange, disabled, format,
}: {
  name: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  format?: (v: number) => string
}) {
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
        onChange={(e) => onChange(Number(e.target.value))}
      />
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
