import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { knobHelp } from './knobHelp'

export function IconButton({
  title,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { title: string; children: ReactNode }) {
  return (
    <button type="button" className="icon-button" title={title} aria-label={title} {...props}>
      {children}
    </button>
  )
}
export function Range({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  context,
}: {
  /** disambiguates tooltips where a label means different things (e.g. "compressor", "drum", "clip") */
  context?: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: string
}) {
  const tipId = useId()
  const help = knobHelp(label, context)
  return (
    <label
      className={`range-control ${help ? 'has-tip' : ''}`}
      style={{ '--dial-angle': `${-135 + ((value - min) / (max - min)) * 270}deg` } as CSSProperties}
    >
      <span className="parameter-dial" aria-hidden="true">
        <i />
      </span>
      <span className="parameter-label">
        {label}
        <output>{format ?? value.toFixed(2)}</output>
      </span>
      <input
        aria-label={label}
        aria-describedby={help ? tipId : undefined}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
      {help && (
        <span className="knob-tip" role="tooltip" id={tipId}>
          <span className="knob-tip-tech">{help.tech}</span>
          <span className="knob-tip-plain">({help.plain})</span>
        </span>
      )}
    </label>
  )
}
