import { openDB } from 'idb'
import type { LibraryItem, SynthParams, Track } from '../state/types'
import { engine } from '../audio/engine'
import { notify, reportError, useStudio } from '../state/store'
import { makeStep, makeTrack, stepsPerBar, uid } from '../state/defaults'
import { assignSample } from '../state/sampling'
import { selectTrack } from '../state/actions'
import { detectSlices } from '../audio/slicing'

const DB_NAME = 'songforge'

/** Opens the shared DB at whatever version persistence.ts created; the library store exists from v3. */
const database = () => openDB(DB_NAME)

export async function listLibrary(): Promise<LibraryItem[]> {
  const db = await database()
  if (!db.objectStoreNames.contains('library')) {
    db.close()
    return []
  }
  const items = (await db.getAll('library')) as LibraryItem[]
  db.close()
  return items.sort((a, b) => b.createdAt - a.createdAt)
}

/** Audio ids the library references, so garbage collection keeps them. */
export async function libraryAudioIds() {
  const ids = new Set<string>()
  for (const item of await listLibrary()) {
    if (item.kind === 'sample') ids.add(item.bufferId)
    if (item.kind === 'kit') ids.add(item.sampleBufferId)
  }
  return ids
}

async function put(item: LibraryItem, blobs: Map<string, Blob>) {
  const db = await database()
  const transaction = db.transaction(['library', 'audio'], 'readwrite')
  await transaction.objectStore('library').put(item, item.id)
  const audioId = item.kind === 'sample' ? item.bufferId : item.kind === 'kit' ? item.sampleBufferId : ''
  const blob = audioId ? blobs.get(audioId) : undefined
  if (audioId && blob && !/^factory-/.test(audioId) && !(await transaction.objectStore('audio').getKey(audioId)))
    await transaction.objectStore('audio').put(blob, audioId)
  await transaction.done
  db.close()
  await refreshLibrary()
}

export async function refreshLibrary() {
  try {
    useStudio.setState({ library: await listLibrary() })
  } catch (error) {
    reportError(error)
  }
}

export async function saveSampleToLibrary(name: string, bufferId: string, slices: number[], tags: string[] = []) {
  const buffer = engine.buffers.get(bufferId)
  if (!buffer) {
    reportError('That sample has no audio loaded.')
    return
  }
  const item: LibraryItem = {
    id: uid(),
    kind: 'sample',
    name: name.trim() || 'Sample',
    createdAt: Date.now(),
    bufferId,
    duration: buffer.duration,
    slices,
    tags,
  }
  await put(item, engine.blobs)
  notify(`Saved sample "${item.name}" to the library.`)
  return item
}

export async function saveKitToLibrary(track: Track, name = track.name) {
  if (!engine.buffers.has(track.sampleBufferId)) {
    reportError('That kit has no audio loaded.')
    return
  }
  const item: LibraryItem = {
    id: uid(),
    kind: 'kit',
    name: name.trim() || track.name,
    createdAt: Date.now(),
    sampleBufferId: track.sampleBufferId,
    pads: track.pads.map(pad => ({
      ...pad,
      id: uid(),
      effects: pad.effects.map(effect => ({ ...effect, id: uid() })),
    })),
    tags: [],
  }
  await put(item, engine.blobs)
  notify(`Saved kit "${item.name}" to the library.`)
  return item
}

export async function saveSynthToLibrary(name: string, synth: SynthParams) {
  const item: LibraryItem = {
    id: uid(),
    kind: 'synth',
    name: name.trim() || 'Patch',
    createdAt: Date.now(),
    synth: { ...synth },
    tags: [],
  }
  await put(item, engine.blobs)
  notify(`Saved patch "${item.name}" to the library.`)
  return item
}

export async function renameLibraryItem(id: string, name: string) {
  const db = await database()
  const item = (await db.get('library', id)) as LibraryItem | undefined
  if (item) await db.put('library', { ...item, name: name.trim() || item.name }, id)
  db.close()
  await refreshLibrary()
}

export async function deleteLibraryItem(id: string) {
  const db = await database()
  await db.delete('library', id)
  db.close()
  await refreshLibrary()
  notify('Removed from the library.')
}

/** Ensure the item's audio is decoded in the engine (it may come from another project). */
async function ensureAudio(bufferId: string) {
  if (engine.buffers.has(bufferId)) return true
  const db = await database()
  const blob = (await db.get('audio', bufferId)) as Blob | undefined
  db.close()
  if (!blob) return false
  await engine.decode(bufferId, blob)
  return true
}

/** Put a library item onto a track: samples and kits onto drum/keys tracks, patches onto synth tracks. */
export async function loadLibraryItem(item: LibraryItem, options: { trackId?: string; newTrack?: boolean } = {}) {
  const state = useStudio.getState()
  try {
    if (item.kind === 'synth') {
      let targetId = options.trackId ?? ''
      const existing = state.project.tracks.find(track => track.id === targetId && track.kind === 'synth')
      state.edit('Load patch', draft => {
        if (existing && !options.newTrack) {
          draft.tracks.find(track => track.id === existing.id)!.synth = { ...item.synth }
          targetId = existing.id
        } else {
          const created = makeTrack('synth', item.name, draft.tracks.length)
          created.synth = { ...item.synth }
          targetId = created.id
          draft.tracks.push(created)
          for (const pattern of draft.patterns)
            pattern.trackSteps.push({
              trackId: created.id,
              steps: Array.from({ length: pattern.bars * stepsPerBar(draft) }, makeStep),
              notes: [],
            })
        }
      })
      const track = useStudio.getState().project.tracks.find(track => track.id === targetId)
      if (track) selectTrack(track)
      notify(`Loaded patch "${item.name}".`)
      return
    }
    const bufferId = item.kind === 'sample' ? item.bufferId : item.sampleBufferId
    if (!(await ensureAudio(bufferId))) {
      reportError(`The audio for "${item.name}" is missing from storage.`)
      return
    }
    const buffer = engine.buffers.get(bufferId)!
    let targetId = options.trackId ?? ''
    const target = state.project.tracks.find(
      track => track.id === targetId && (track.kind === 'drums' || track.kind === 'keys'),
    )
    state.edit(item.kind === 'kit' ? 'Load kit' : 'Load sample', draft => {
      if (!target || options.newTrack) {
        const created = makeTrack('drums', item.name, draft.tracks.length, bufferId)
        targetId = created.id
        draft.tracks.push(created)
        for (const pattern of draft.patterns)
          pattern.trackSteps.push({
            trackId: created.id,
            steps: Array.from({ length: pattern.bars * stepsPerBar(draft) }, makeStep),
            notes: [],
          })
      }
      const track = draft.tracks.find(track => track.id === targetId)!
      if (item.kind === 'kit') {
        track.sampleBufferId = item.sampleBufferId
        const oldPads = track.pads.map(pad => pad.id)
        track.pads = item.pads.map(pad => ({
          ...pad,
          id: uid(),
          effects: pad.effects.map(effect => ({ ...effect, id: uid() })),
        }))
        track.sequencerPadId = track.pads[0]?.id ?? ''
        for (const pattern of draft.patterns)
          for (const step of pattern.trackSteps.find(row => row.trackId === track.id)?.steps ?? [])
            if (step.padId) step.padId = track.pads[Math.max(0, oldPads.indexOf(step.padId))]?.id
      } else {
        const slices = item.slices.length ? item.slices : detectSlices(buffer.getChannelData(0), buffer.sampleRate)
        assignSample(draft, track.id, bufferId, buffer.duration, slices)
      }
    })
    const track = useStudio.getState().project.tracks.find(track => track.id === targetId)
    if (track) selectTrack(track)
    notify(`Loaded ${item.kind} "${item.name}" onto ${track?.name ?? 'track'}.`)
  } catch (error) {
    reportError(error)
  }
}

/** Put a library sample onto one pad of a kit (the pad plays the whole sample). */
export async function loadSampleToPad(item: Extract<LibraryItem, { kind: 'sample' }>, trackId: string, padId: string) {
  // A pad is a region of its track's sample, so a different sample needs its own track. Offer the
  // nearest equivalent: load the sample onto a new kit with pad 1 = whole sample.
  void padId
  await loadLibraryItem(item, { trackId, newTrack: true })
}
