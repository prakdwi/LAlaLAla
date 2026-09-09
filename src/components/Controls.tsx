import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

export function IconButton({ title, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string; children: ReactNode }) {
  return <button type="button" className="icon-button" title={title} aria-label={title} {...props}>{children}</button>
}
export function Range({ label, value, min, max, step = 0.01, onChange, format }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; format?: string
}) {
  return <label className="range-control" style={{ '--dial-angle': `${-135 + (value - min) / (max - min) * 270}deg` } as CSSProperties}>
    <span className="parameter-dial" aria-hidden="true"><i /></span>
    <span className="parameter-label">{label}<output>{format ?? value.toFixed(2)}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>
}