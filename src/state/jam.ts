import type { Project } from './types'
import { makePattern } from './defaults'
import { appendPatternClip } from './arrangement'

export function parseYouTubeUrl(value: string): { videoId: string; start: number } | null {
  try {
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    const videoId =
      host === 'youtu.be'
        ? parts[0]
        : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com'].includes(
              host,
            )
          ? url.pathname === '/watch'
            ? url.searchParams.get('v')
            : ['embed', 'shorts', 'live'].includes(parts[0])
              ? parts[1]
              : null
          : null
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null
    const timestamp = url.searchParams.get('t') ?? url.searchParams.get('start') ?? '0'
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(timestamp)
    const start = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0
    return { videoId, start: Math.min(start, 86400) }
  } catch {
    return null
  }
}

export function createJamPattern(project: Project) {
  const pattern = makePattern(
    project,
    `Jam ${project.patterns.filter(item => item.name.startsWith('Jam ')).length + 1}`,
  )
  project.patterns.push(pattern)
  return pattern.id
}

/** Copies the take into an independent pattern and appends it to the arrangement as one clip. */
export function addJamToSong(project: Project, patternId: string, name: string, repeatCount: number) {
  const source = project.patterns.find(pattern => pattern.id === patternId)
  if (!source || !source.trackSteps.some(row => row.steps.some(step => step.active) || row.notes.length))
    throw new Error('Record pads or activate some steps before adding this take to the song.')
  const pattern = {
    ...source,
    id: crypto.randomUUID(),
    name: name.trim() || source.name,
    trackSteps: source.trackSteps.map(row => ({
      ...row,
      steps: row.steps.map(step => ({ ...step })),
      notes: row.notes.map(note => ({ ...note, id: crypto.randomUUID() })),
    })),
  }
  project.patterns.push(pattern)
  return appendPatternClip(project, pattern.id, pattern.name, repeatCount)
}
