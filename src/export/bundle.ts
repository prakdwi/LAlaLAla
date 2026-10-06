import { unzip, zip, strToU8, strFromU8 } from 'fflate'
import type { Project } from '../state/types'
import { referencedAudio } from '../db/persistence'

/**
 * Project bundle: a ZIP holding project.json and audio/<id>.<ext> for every referenced sample
 * and recording. Factory sounds are regenerated on import and are not included.
 */
export async function exportBundle(project: Project, blobs: Map<string, Blob>): Promise<Blob> {
  const files: Record<string, Uint8Array> = { 'project.json': strToU8(JSON.stringify(project, null, 2)) }
  const manifest: Record<string, string> = {}
  for (const id of referencedAudio(project)) {
    if (/^factory-/.test(id)) continue
    const blob = blobs.get(id)
    if (!blob) continue
    const ext = blob.type.includes('mpeg')
      ? 'mp3'
      : blob.type.includes('ogg')
        ? 'ogg'
        : blob.type.includes('mp4') || blob.type.includes('m4a')
          ? 'm4a'
          : 'wav'
    const name = `audio/${id}.${ext}`
    files[name] = new Uint8Array(await blob.arrayBuffer())
    manifest[id] = name
  }
  files['audio/manifest.json'] = strToU8(JSON.stringify(manifest))
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (error, result) => (error ? reject(error) : resolve(result))),
  )
  return new Blob([data as BlobPart], { type: 'application/zip' })
}

export async function readBundle(file: Blob): Promise<{ json: string; audio: Map<string, Blob> }> {
  const data = new Uint8Array(await file.arrayBuffer())
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, (error, result) => (error ? reject(error) : resolve(result))),
  )
  if (!files['project.json']) throw new Error('This ZIP does not contain project.json.')
  const manifest = files['audio/manifest.json']
    ? (JSON.parse(strFromU8(files['audio/manifest.json'])) as Record<string, string>)
    : {}
  const audio = new Map<string, Blob>()
  for (const [id, name] of Object.entries(manifest)) {
    const bytes = files[name]
    if (!bytes) continue
    const type = name.endsWith('.mp3')
      ? 'audio/mpeg'
      : name.endsWith('.ogg')
        ? 'audio/ogg'
        : name.endsWith('.m4a')
          ? 'audio/mp4'
          : 'audio/wav'
    audio.set(id, new Blob([bytes as BlobPart], { type }))
  }
  return { json: strFromU8(files['project.json']), audio }
}
