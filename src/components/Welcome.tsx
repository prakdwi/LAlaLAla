import { useEffect, useState } from 'react'
import { Dices, GraduationCap, Headphones, Play, Sparkles, X } from 'lucide-react'
import { notify, reportError, useStudio } from '../state/store'
import { applyTemplate, randomTemplate, TEMPLATES, type Template } from '../templates'
import { keyName } from '../state/scale'
import { markWelcome } from '../state/welcome'
import { IconButton } from './Controls'

/**
 * Starter picker. On first run it is the welcome screen and hands over to the coach; from the
 * project menu it just builds the chosen starter as a new project.
 */
export function StarterPicker({ mode, onClose }: { mode: 'welcome' | 'picker'; onClose: () => void }) {
  const [busy, setBusy] = useState('')
  const finish = (tour: boolean) => {
    if (mode === 'welcome') {
      markWelcome()
      if (tour) useStudio.setState({ tourStep: 0 })
    }
    onClose()
  }
  const build = async (template: Template) => {
    setBusy(template.id)
    try {
      await applyTemplate(template)
      notify(`Built the ${template.name} starter in ${keyName(template.key)}. Press Space to play.`)
      finish(true)
    } catch (error) {
      reportError(error)
      setBusy('')
    }
  }
  return (
    <div className="shortcuts-overlay welcome-overlay" role="dialog" aria-label="Choose a starter">
      <div className="shortcuts-panel welcome-panel">
        <div className="section-heading">
          <h2>
            <Sparkles size={15} />
            {mode === 'welcome'
              ? 'Welcome. Pick a starter and you are making music in one click.'
              : 'New project from a starter'}
          </h2>
          <IconButton title="Close" onClick={() => finish(false)}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="welcome-note">
          Each starter builds a kit, drums, chords and a bass line in a key, and lays out a short song. Everything is
          editable afterwards, and nothing leaves this browser.
        </p>
        <div className="starter-grid">
          {TEMPLATES.map(template => (
            <button
              key={template.id}
              className="starter-card"
              disabled={Boolean(busy)}
              onClick={() => void build(template)}
              aria-label={`Build the ${template.name} starter`}
            >
              <strong>{busy === template.id ? 'Building…' : template.name}</strong>
              <span className="eyebrow">
                {template.bpm} BPM · {keyName(template.key)}
              </span>
              <small>{template.blurb}</small>
            </button>
          ))}
        </div>
        <div className="welcome-actions">
          <button disabled={Boolean(busy)} onClick={() => void build(randomTemplate())}>
            <Dices size={14} />
            Surprise me
          </button>
          {mode === 'welcome' ? (
            <button disabled={Boolean(busy)} onClick={() => finish(true)}>
              <Play size={14} />
              Keep the demo loop
            </button>
          ) : (
            <button disabled={Boolean(busy)} onClick={() => finish(false)}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type CoachStep = { title: string; body: string; done: (labels: string[], playing: boolean) => boolean }

const STEPS: CoachStep[] = [
  {
    title: 'Press Space to play',
    body: 'Space plays and stops the pattern. Shift+Space plays the whole song from the timeline.',
    done: (_labels, playing) => playing,
  },
  {
    title: 'Change the drums',
    body: 'Click any cell in the step sequencer to add or remove a hit. Right-click a cell for velocity.',
    done: labels => labels.includes('Toggle step'),
  },
  {
    title: 'Turn something',
    body: 'Change the tempo in the transport, or drag a knob in the effect rack or mixer. Every change can be undone with Ctrl+Z.',
    done: labels =>
      labels.some(label =>
        /tempo|swing|volume|pan\b|filter|delay|reverb|bitcrush|\beq\b|compressor|chorus|saturation|limiter|synth|pad (gain|pitch|pan)/i.test(
          label,
        ),
      ),
  },
]

/** Three-step coach shown after the welcome. Steps complete themselves by watching the store. */
export function Coach({ navigate }: { navigate: (path: string) => void }) {
  const { tourStep, past, playing } = useStudio()
  const labels = past.map(command => command.label)
  const stepDone = tourStep >= 0 && tourStep < STEPS.length && STEPS[tourStep].done(labels, playing)
  useEffect(() => {
    if (!stepDone) return
    const timer = setTimeout(() => useStudio.setState(state => ({ tourStep: state.tourStep + 1 })), 500)
    return () => clearTimeout(timer)
  }, [stepDone, tourStep])
  if (tourStep < 0) return null
  const close = () => useStudio.setState({ tourStep: -1 })
  const finished = tourStep >= STEPS.length
  return (
    <aside className="coach" role="status" aria-label="Getting started">
      <div className="coach-head">
        <span className="eyebrow">{finished ? 'YOU ARE SET' : `STEP ${tourStep + 1} OF ${STEPS.length}`}</span>
        <IconButton title="Close the guide" onClick={close}>
          <X size={13} />
        </IconButton>
      </div>
      {finished ? (
        <>
          <strong>That is the whole loop: play, change, listen.</strong>
          <span>
            Next, learn the tools or sample something in the Jam room. Press ? any time for shortcuts and terms.
          </span>
          <div className="coach-actions">
            <button
              onClick={() => {
                close()
                navigate('/learn')
              }}
            >
              <GraduationCap size={13} />
              Tutorials
            </button>
            <button
              onClick={() => {
                close()
                navigate('/jam')
              }}
            >
              <Headphones size={13} />
              Jam room
            </button>
            <button onClick={close}>Done</button>
          </div>
        </>
      ) : (
        <>
          <strong>{STEPS[tourStep].title}</strong>
          <span>{STEPS[tourStep].body}</span>
          <div className="coach-actions">
            <button onClick={() => useStudio.setState({ tourStep: tourStep + 1 })}>Skip</button>
          </div>
        </>
      )}
    </aside>
  )
}
