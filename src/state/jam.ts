import type { Project } from './types'
import { uid } from './defaults'

export function parseYouTubeUrl(value: string): { videoId: string; start: number } | null {
  try {
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    const videoId = host === 'youtu.be' ? parts[0]
      : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com'].includes(host)
        ? url.pathname === '/watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null
        : null
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null
    const timestamp = url.searchParams.get('t') ?? url.searchParams.get('start') ?? '0'
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(timestamp)
    const start = match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0
    return { videoId, start: Math.min(start, 86400) }
  } catch { return null }
}

export function createJamPattern(project: Project) {
  const pattern = {
    id: uid(), name: `Jam ${project.patterns.filter(item => item.name.startsWith('Jam ')).length + 1}`,
    trackSteps: project.tracks.map(track => ({ trackId: track.id, steps: Array.from({ length: 16 }, () => ({ active: false, velocity: 1, microTimingMs: 0 })) })),
  }
  project.patterns.push(pattern)
  return pattern.id
}

export function addJamToSong(project: Project, patternId: string, name: string, repeatCount: number) {
  const source = project.patterns.find(pattern => pattern.id === patternId)
  if (!source || !source.trackSteps.some(row => row.steps.some(step => step.active))) throw new Error('Record pads or activate some steps before adding this take to the song.')
  const pattern = { ...source, id: uid(), name: name.trim() || source.name,
    trackSteps: source.trackSteps.map(row => ({ ...row, steps: row.steps.map(step => ({ ...step })) })) }
  project.patterns.push(pattern)
  const section = { id: uid(), name: pattern.name, patternId: pattern.id, repeatCount: Math.max(1, Math.min(32, Math.round(repeatCount) || 1)) }
  project.song.push(section)
  return section.id
}