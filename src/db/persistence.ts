import { openDB } from 'idb'
import type { Project } from '../state/types'
import { engine } from '../audio/engine'
import { factorySample } from '../audio/demo'
import { reportError, useStudio } from '../state/store'

const database = () => openDB('songforge', 1, { upgrade(db) {
  db.createObjectStore('projects'); db.createObjectStore('audio')
} })

export async function saveProject(project: Project, blobs: Map<string, Blob>) {
  const db = await database()
  const transaction = db.transaction(['projects', 'audio'], 'readwrite')
  await transaction.objectStore('projects').put(project, 'current')
  for (const [id, blob] of blobs) {
    if (!await transaction.objectStore('audio').getKey(id)) await transaction.objectStore('audio').put(blob, id)
  }
  await transaction.done
  db.close()
}

let boot: Promise<void> | undefined
export function initializeSession() {
  boot ??= (async () => {
    let project = useStudio.getState().project
    try {
      const db = await database()
      const saved = await db.get('projects', 'current') as Project | undefined
      if (saved) project = saved
      for (const track of project.tracks) {
        const stored = await db.get('audio', track.sampleBufferId) as Blob | undefined
        const kind = /^factory-(\d)$/.exec(track.sampleBufferId)
        const blob = stored ?? (kind ? factorySample(Number(kind[1])) : undefined)
        if (blob) await engine.decode(track.sampleBufferId, blob)
        else reportError(`Audio missing for ${track.name}. Upload its sample again.`)
      }
      db.close()
      useStudio.getState().hydrate(project)
      await saveProject(project, engine.blobs)
    } catch (error) {
      useStudio.getState().hydrate(project)
      useStudio.setState({ saveStatus: 'Storage unavailable' })
      reportError(error)
    }
  })()
  return boot
}

export function watchPersistence() {
  let timer: ReturnType<typeof setTimeout>
  let pending = Promise.resolve()
  const persist = () => {
    const { project, revision } = useStudio.getState()
    pending = pending.then(() => saveProject(project, engine.blobs)).then(() => {
      if (useStudio.getState().revision === revision) useStudio.setState({ saveStatus: 'Saved locally' })
    }).catch(error => { useStudio.setState({ saveStatus: 'Save failed' }); reportError(error) })
  }
  const unsubscribe = useStudio.subscribe((state, previous) => {
    if (state.revision === previous.revision || !state.ready) return
    clearTimeout(timer); timer = setTimeout(persist, 500)
  })
  const flush = () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); persist() } }
  document.addEventListener('visibilitychange', flush)
  return () => { clearTimeout(timer); unsubscribe(); document.removeEventListener('visibilitychange', flush) }
}