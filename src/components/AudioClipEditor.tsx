import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'
import { useStudio } from '../state/store'
import type { AudioClip } from '../state/types'
import { Range } from './Controls'

/** Waveform view and trim controls for an audio clip. */
export function AudioClipEditor({ clip }: { clip: AudioClip }) {
  const { project, edit, positionBeats } = useStudio()
  const canvas = useRef<HTMLCanvasElement>(null)
  const buffer = engine.buffers.get(clip.bufferId)
  const track = project.tracks.find(item => item.id === clip.trackId)
  const seconds = (clip.length * 60) / project.bpm
  const update = (label: string, change: (target: AudioClip) => void, key?: string) =>
    edit(
      label,
      draft => {
        const target = draft.clips.find(item => item.id === clip.id)
        if (target?.kind === 'audio') change(target)
      },
      key,
    )
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      element.width = width * devicePixelRatio
      element.height = height * devicePixelRatio
      const context = element.getContext('2d')!
      context.scale(devicePixelRatio, devicePixelRatio)
      context.fillStyle = '#b9c86d'
      context.fillRect(0, 0, width, height)
      if (!buffer) {
        context.fillStyle = '#394419'
        context.font = '11px monospace'
        context.fillText('AUDIO MISSING', 12, height / 2)
        return
      }
      const rate = 2 ** (clip.pitchSemitones / 12)
      const visible = seconds * rate
      const data = buffer.getChannelData(0)
      context.strokeStyle = '#394419'
      context.beginPath()
      for (let pixel = 0; pixel < width; pixel++) {
        const first = Math.floor((clip.offset + (pixel / width) * visible) * buffer.sampleRate)
        const last = Math.min(
          data.length,
          Math.ceil((clip.offset + ((pixel + 1) / width) * visible) * buffer.sampleRate),
        )
        let low = 0
        let high = 0
        for (let sample = first; sample < last; sample++) {
          low = Math.min(low, data[sample])
          high = Math.max(high, data[sample])
        }
        context.moveTo(pixel, height / 2 + low * height * 0.45 * clip.gain)
        context.lineTo(pixel, height / 2 + high * height * 0.45 * clip.gain)
      }
      context.stroke()
      const fadeInX = (clip.fadeIn / seconds) * width
      const fadeOutX = width - (clip.fadeOut / seconds) * width
      context.fillStyle = '#39441955'
      context.beginPath()
      context.moveTo(0, 0)
      context.lineTo(fadeInX, 0)
      context.lineTo(0, height)
      context.fill()
      context.beginPath()
      context.moveTo(width, 0)
      context.lineTo(fadeOutX, 0)
      context.lineTo(width, height)
      context.fill()
      if (positionBeats >= clip.start && positionBeats < clip.start + clip.length) {
        context.fillStyle = '#a43b25'
        context.fillRect(((positionBeats - clip.start) / clip.length) * width, 0, 2, height)
      }
    }
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    draw()
    return () => observer.disconnect()
  }, [buffer, clip, seconds, positionBeats])
  return (
    <section className="audio-clip-section" aria-label="Audio clip editor">
      <div className="section-heading">
        <h2>
          Audio clip <span className="tag">{clip.name}</span>
        </h2>
        <span className="eyebrow">
          {track?.name} / {buffer ? `${buffer.duration.toFixed(2)} s source` : 'no audio'}
        </span>
      </div>
      <div className="waveform-wrap">
        <canvas ref={canvas} aria-label="Audio clip waveform" />
      </div>
      <div className="pad-parameters">
        <Range
          label="Clip gain"
          value={clip.gain}
          min={0}
          max={2}
          onChange={value =>
            update(
              'Clip gain',
              target => {
                target.gain = value
              },
              `gain-${clip.id}`,
            )
          }
        />
        <Range
          label="Offset"
          context="clip"
          value={clip.offset}
          min={0}
          max={Math.max(0.01, (buffer?.duration ?? 1) - 0.01)}
          step={0.001}
          format={`${clip.offset.toFixed(2)} s`}
          onChange={value =>
            update(
              'Clip offset',
              target => {
                target.offset = value
              },
              `offset-${clip.id}`,
            )
          }
        />
        <Range
          label="Fade in"
          value={clip.fadeIn}
          min={0}
          max={Math.max(0.01, seconds / 2)}
          step={0.001}
          format={`${Math.round(clip.fadeIn * 1000)} ms`}
          onChange={value =>
            update(
              'Fade in',
              target => {
                target.fadeIn = value
              },
              `fadein-${clip.id}`,
            )
          }
        />
        <Range
          label="Fade out"
          value={clip.fadeOut}
          min={0}
          max={Math.max(0.01, seconds / 2)}
          step={0.001}
          format={`${Math.round(clip.fadeOut * 1000)} ms`}
          onChange={value =>
            update(
              'Fade out',
              target => {
                target.fadeOut = value
              },
              `fadeout-${clip.id}`,
            )
          }
        />
        <Range
          label="Pitch"
          context="clip"
          value={clip.pitchSemitones}
          min={-24}
          max={24}
          step={1}
          format={`${clip.pitchSemitones} st`}
          onChange={value =>
            update(
              'Clip pitch',
              target => {
                target.pitchSemitones = value
              },
              `pitch-${clip.id}`,
            )
          }
        />
      </div>
      <div className="section-foot">
        <span>
          {seconds.toFixed(2)} SEC AT {project.bpm} BPM
        </span>
        <span>Pitch changes speed; clips are not time-stretched.</span>
      </div>
    </section>
  )
}
