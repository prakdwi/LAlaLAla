import { openDB, type IDBPDatabase } from 'idb'
import type { Project, ProjectSummary } from '../state/types'
import { engine } from '../audio/engine'
import { factorySample } from '../audio/demo'
import { notify, reportError, useStudio } from '../state/store'
import { migrateProject } from '../state/migrate'
import { makeProject } from '../state/defaults'
import { stop } from '../state/actions'

const DB_NAME = 'songforge'
const DB_VERSION = 2

const database = () =>
  openDB(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore('projects')
        db.createObjectStore('audio')
      }
      if (oldVersion < 2) {
        db.createObjectStore('meta')
        // v1 kept a single project under the key "current"; re-key it by id.
        const store = transaction.objectStore('projects')
        const legacy = (await store.get('current')) as Project | undefined
        if (legacy) {
          const id = legacy.id || crypto.randomUUID()
          await store.put({ ...legacy, id }, id)
          await store.delete('current')
          await transaction.objectStore('meta').put(id, 'currentId')
        }
      }
    },
  })

export const summarize = (project: Project): ProjectSummary => ({
  id: project.id,
  name: project.name,
  updatedAt: project.updatedAt ?? 0,
  bpm: project.bpm,
  trackCount: project.tracks.length,
})

/** Every audio id a project references. */
export function referencedAudio(project: Project) {
  const ids = new Set<string>()
  for (const track of project.tracks) if (track.sampleBufferId) ids.add(track.sampleBufferId)
  for (const clip of project.clips) if (clip.kind === 'audio') ids.add(clip.bufferId)
  return ids
}

export async function saveProject(project: Project, blobs: Map<string, Blob>) {
  const db = await database()
  const transaction = db.transaction(['projects', 'audio', 'meta'], 'readwrite')
  await transaction.objectStore('projects').put(project, project.id)
  await transaction.objectStore('meta').put(project.id, 'currentId')
  const referenced = referencedAudio(project)
  for (const [id, blob] of blobs) {
    if (!referenced.has(id) || /^factory-/.test(id)) continue
    if (!(await transaction.objectStore('audio').getKey(id))) await transaction.objectStore('audio').put(blob, id)
  }
  await transaction.done
  db.close()
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await database()
  const projects = (await db.getAll('projects')) as Project[]
  db.close()
  return projects.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Removes audio blobs no saved project references any more. Returns the number deleted. */
export async function collectGarbage(keep = new Set<string>()) {
  const db = await database()
  const projects = (await db.getAll('projects')) as Project[]
  const referenced = new Set<string>(keep)
  for (const project of projects) for (const id of referencedAudio(project)) referenced.add(id)
  const transaction = db.transaction('audio', 'readwrite')
  let removed = 0
  for (const key of await transaction.store.getAllKeys()) {
    if (!referenced.has(String(key))) {
      await transaction.store.delete(key)
      removed++
    }
  }
  await transaction.done
  db.close()
  return removed
}

async function loadAudio(db: IDBPDatabase, project: Project) {
  const missing: string[] = []
  for (const id of referencedAudio(project)) {
    if (engine.buffers.has(id)) continue
    const stored = (await db.get('audio', id)) as Blob | undefined
    const kind = /^factory-(\d)$/.exec(id)
    const blob = stored ?? (kind ? factorySample(Number(kind[1])) : undefined)
    if (!blob) {
      missing.push(id)
      continue
    }
    try {
      await engine.decode(id, blob)
    } catch (error) {
      console.warn(`Could not decode audio ${id}`, error)
      missing.push(id)
    }
  }
  if (missing.length) {
    const names = project.tracks.filter(track => missing.includes(track.sampleBufferId)).map(track => track.name)
    reportError(
      `Audio missing for ${names.length ? names.join(', ') : `${missing.length} clip(s)`}. Load the sample again.`,
    )
  }
}

async function activate(project: Project, db?: IDBPDatabase) {
  const handle = db ?? (await database())
  await loadAudio(handle, project)
  if (!db) handle.close()
  useStudio.getState().hydrate(project)
  useStudio.setState({ projects: await listProjects() })
}

let boot: Promise<void> | undefined
export function initializeSession() {
  boot ??= (async () => {
    let project = useStudio.getState().project
    let db: IDBPDatabase | undefined
    try {
      db = await database()
      const currentId = (await db.get('meta', 'currentId')) as string | undefined
      let saved = currentId ? ((await db.get('projects', currentId)) as Project | undefined) : undefined
      if (!saved) {
        const all = (await db.getAll('projects')) as Project[]
        saved = all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
      }
      if (saved) project = migrateProject(saved)
    } catch (error) {
      // Storage is unreadable: run on the in-memory project so the app still works.
      db?.close()
      useStudio.getState().hydrate(project)
      useStudio.setState({ saveStatus: 'Storage unavailable' })
      reportError(error)
      return
    }
    try {
      await activate(project, db)
      db.close()
      await saveProject(project, engine.blobs)
    } catch (error) {
      // The project loaded; keep it even if some audio or the write-back failed.
      db.close()
      if (!useStudio.getState().ready) useStudio.getState().hydrate(project)
      useStudio.setState({ saveStatus: 'Save failed' })
      reportError(error)
    }
  })()
  return boot
}

export async function openProject(id: string) {
  stop()
  await flushPersistence()
  const db = await database()
  const stored = (await db.get('projects', id)) as Project | undefined
  if (!stored) {
    db.close()
    reportError('That project no longer exists.')
    return
  }
  const project = migrateProject(stored)
  await activate(project, db)
  await db.transaction('meta', 'readwrite').store.put(project.id, 'currentId')
  db.close()
}

export async function createProject(name = 'Untitled session') {
  stop()
  await flushPersistence()
  const project = { ...makeProject(), name }
  await saveProject(project, engine.blobs)
  await activate(project)
  notify(`Created "${name}".`)
}

export async function duplicateProject() {
  stop()
  await flushPersistence()
  const source = useStudio.getState().project
  const project: Project = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name: `${source.name} copy`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveProject(project, engine.blobs)
  await activate(project)
  notify(`Duplicated as "${project.name}".`)
}

export async function deleteProject(id: string) {
  await flushPersistence()
  const state = useStudio.getState()
  const db = await database()
  await db.delete('projects', id)
  db.close()
  if (state.project.id === id) {
    const remaining = await listProjects()
    if (remaining.length) await openProject(remaining[0].id)
    else await createProject()
  } else useStudio.setState({ projects: await listProjects() })
  const removed = await collectGarbage(new Set(engine.buffers.keys()))
  notify(removed ? `Project deleted. Freed ${removed} unused audio file(s).` : 'Project deleted.')
}

/** Imports project JSON. Audio is re-linked when the blobs are already stored (same browser) or supplied. */
export async function importProject(json: string, audio?: Map<string, Blob>) {
  stop()
  await flushPersistence()
  const project = migrateProject(JSON.parse(json))
  const existing = await listProjects()
  if (existing.some(item => item.id === project.id)) {
    project.id = crypto.randomUUID()
    project.name = `${project.name} (imported)`
  }
  if (audio) for (const [id, blob] of audio) if (!engine.buffers.has(id)) await engine.decode(id, blob)
  await saveProject(project, engine.blobs)
  await activate(project)
  notify(`Imported "${project.name}".`)
  return project
}

let flushNow: (() => Promise<void>) | null = null
/** Saves any debounced edits immediately. Call before switching or deleting projects. */
export async function flushPersistence() {
  if (flushNow) await flushNow()
}

export function watchPersistence() {
  let timer: ReturnType<typeof setTimeout>
  let pending = Promise.resolve()
  const persist = () => {
    const { project, revision } = useStudio.getState()
    pending = pending
      .then(() => saveProject(project, engine.blobs))
      .then(async () => {
        const current = useStudio.getState()
        if (current.revision === revision) useStudio.setState({ saveStatus: 'Saved locally' })
        const summary = summarize(project)
        const projects = current.projects.some(item => item.id === project.id)
          ? current.projects.map(item => (item.id === project.id ? summary : item))
          : [summary, ...current.projects]
        useStudio.setState({ projects: projects.sort((a, b) => b.updatedAt - a.updatedAt) })
      })
      .catch(error => {
        useStudio.setState({ saveStatus: 'Save failed' })
        reportError(error)
      })
  }
  let dirty = false
  const unsubscribe = useStudio.subscribe((state, previous) => {
    if (state.revision === previous.revision || !state.ready) return
    dirty = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      dirty = false
      persist()
    }, 500)
  })
  flushNow = async () => {
    clearTimeout(timer)
    if (dirty) {
      dirty = false
      persist()
    }
    await pending
  }
  const flush = () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer)
      persist()
    }
  }
  document.addEventListener('visibilitychange', flush)
  return () => {
    clearTimeout(timer)
    flushNow = null
    unsubscribe()
    document.removeEventListener('visibilitychange', flush)
  }
}
