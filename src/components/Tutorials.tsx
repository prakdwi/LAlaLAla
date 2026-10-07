import { useState } from 'react'
import { BookOpen, Check, CircleDot, Headphones, Layers, FlaskConical, Play, Wand2 } from 'lucide-react'
import { TUTORIALS, type Tutorial } from '../tutorials/songs'
import { notify, reportError, useStudio } from '../state/store'
import { play, stop } from '../state/actions'

const STORE_KEY = 'lalala-tutorial-progress'
const readProgress = (): Record<string, number[]> => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')
  } catch {
    return {}
  }
}
const writeProgress = (progress: Record<string, number[]>) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(progress))
  } catch {
    /* storage unavailable: progress is per-session only */
  }
}

const WHERE = {
  studio: { label: 'Studio', icon: Layers, path: '/' },
  jam: { label: 'Jam room', icon: Headphones, path: '/jam' },
  lab: { label: 'Sound Lab', icon: FlaskConical, path: '/lab' },
}

/** Fourth window: step-by-step lessons that build three style studies inside the app. */
export function Tutorials({ navigate }: { navigate: (path: string) => void }) {
  const { ready, project } = useStudio()
  const [selected, setSelected] = useState(TUTORIALS[0].id)
  const [progress, setProgress] = useState(readProgress)
  const [busy, setBusy] = useState(-1)
  const tutorial = TUTORIALS.find(item => item.id === selected) ?? TUTORIALS[0]
  const done = new Set(progress[tutorial.id] ?? [])
  const active = project.name === tutorial.projectName

  const mark = (index: number, value = true) => {
    const next = {
      ...progress,
      [tutorial.id]: value ? [...new Set([...done, index])] : [...done].filter(item => item !== index),
    }
    setProgress(next)
    writeProgress(next)
  }
  const runStep = async (index: number) => {
    const step = tutorial.steps[index]
    if (!step.run) return
    setBusy(index)
    try {
      stop()
      await step.run()
      mark(index)
      notify(`Done: ${step.title}`)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(-1)
    }
  }
  const buildAll = async (target: Tutorial) => {
    setBusy(99)
    try {
      stop()
      for (const [index, step] of target.steps.entries()) {
        if (!step.run) continue
        await step.run()
        const current = readProgress()
        current[target.id] = [...new Set([...(current[target.id] ?? []), index])]
        writeProgress(current)
      }
      setProgress(readProgress())
      notify(`Built "${target.projectName}". Press Play song to hear it.`)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(-1)
    }
  }

  return (
    <section className="tutorials" aria-label="Tutorials">
      <div className="jam-heading">
        <div>
          <span className="eyebrow">LEARN BY BUILDING</span>
          <h1>Tutorials</h1>
        </div>
        <span className="tag">STYLE STUDIES</span>
      </div>
      <p className="tutorial-note">
        Each lesson studies how a well-known record is built (tempo, feel, sound design, arrangement) and walks you
        through making a beat in that style. The drums, chords, melodies and sounds are original, made here in the app.
        They are not transcriptions of the songs.
      </p>
      <div className="tutorial-layout">
        <div className="tutorial-list" role="tablist" aria-label="Songs">
          {TUTORIALS.map(item => {
            const count = (progress[item.id] ?? []).length
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={item.id === tutorial.id}
                className={`tutorial-card ${item.id === tutorial.id ? 'selected' : ''}`}
                onClick={() => setSelected(item.id)}
              >
                <strong>{item.song}</strong>
                <span>{item.artist}</span>
                <small>
                  {count}/{item.steps.length} steps
                </small>
                <i className="tutorial-progress" style={{ width: `${(count / item.steps.length) * 100}%` }} />
              </button>
            )
          })}
        </div>
        <div className="tutorial-body">
          <div className="tutorial-head">
            <div>
              <span className="eyebrow">IN THE STYLE OF</span>
              <h2>
                {tutorial.song} <small>— {tutorial.artist}</small>
              </h2>
            </div>
            <div className="inline-actions">
              <button className="play-button" disabled={!ready || busy >= 0} onClick={() => void buildAll(tutorial)}>
                <Wand2 size={14} />
                {busy === 99 ? 'Building…' : 'Build the whole beat'}
              </button>
              {active && (
                <button
                  onClick={() => {
                    navigate('/')
                    void play(true)
                  }}
                >
                  <Play size={13} />
                  Play song
                </button>
              )}
            </div>
          </div>
          <dl className="tutorial-facts">
            <div>
              <dt>Tempo</dt>
              <dd>{tutorial.tempo}</dd>
            </div>
            <div>
              <dt>Feel</dt>
              <dd>{tutorial.feel}</dd>
            </div>
            <div>
              <dt>Key</dt>
              <dd>{tutorial.key}</dd>
            </div>
          </dl>
          <p>{tutorial.summary}</p>
          <div className="listen-for">
            <strong>
              <BookOpen size={13} /> Listen for
            </strong>
            <ul>
              {tutorial.listenFor.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {!active && done.size > 0 && (
            <p className="tutorial-warning">
              This lesson works on the "{tutorial.projectName}" project. Run step 1 again or switch to it from the
              sidebar's project list.
            </p>
          )}
          <ol className="tutorial-steps">
            {tutorial.steps.map((step, index) => {
              const where = WHERE[step.where]
              const Icon = where.icon
              const finished = done.has(index)
              return (
                <li key={step.title} className={finished ? 'done' : ''}>
                  <div className="step-head">
                    <button
                      className="step-check"
                      aria-label={finished ? `Mark step ${index + 1} not done` : `Mark step ${index + 1} done`}
                      aria-pressed={finished}
                      onClick={() => mark(index, !finished)}
                    >
                      {finished ? <Check size={14} /> : <CircleDot size={14} />}
                    </button>
                    <strong>
                      {index + 1}. {step.title}
                    </strong>
                    <button className="where" onClick={() => navigate(where.path)} title={`Open the ${where.label}`}>
                      <Icon size={12} />
                      {where.label}
                    </button>
                  </div>
                  {step.body.map(paragraph => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {step.tip && <p className="step-tip">Tip: {step.tip}</p>}
                  {step.run && (
                    <button className="do-step" disabled={!ready || busy >= 0} onClick={() => void runStep(index)}>
                      <Wand2 size={12} />
                      {busy === index ? 'Working…' : `Do this step: ${step.runLabel ?? step.title}`}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
