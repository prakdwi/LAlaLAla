/**
 * Song builder: a structure (intro, verse, chorus...) laid out from one pattern. Each section is a
 * derived pattern keeping only some roles (drums, bass, chords, lead) so the song breathes without
 * the user drawing a single clip. Sections become ruler markers.
 */
import type { Project, Track } from './types'
import { makeStep, uid } from './defaults'
import { findBass, findChordTracks, findKick } from './mixAssistant'

export type Role = 'drums' | 'bass' | 'chords' | 'lead' | 'other'
export type SectionSpec = { name: string; roles: Role[] | 'all'; bars: number }
export type Structure = { id: string; label: string; sections: SectionSpec[] }

export const STRUCTURES: Structure[] = [
  {
    id: 'loop',
    label: 'Loop (intro, loop, outro)',
    sections: [
      { name: 'Intro', roles: ['chords', 'lead'], bars: 4 },
      { name: 'Loop', roles: 'all', bars: 16 },
      { name: 'Outro', roles: ['chords', 'bass'], bars: 4 },
    ],
  },
  {
    id: 'pop',
    label: 'Pop (verse / chorus / bridge)',
    sections: [
      { name: 'Intro', roles: ['chords'], bars: 4 },
      { name: 'Verse', roles: ['drums', 'bass', 'chords'], bars: 8 },
      { name: 'Chorus', roles: 'all', bars: 8 },
      { name: 'Verse 2', roles: ['drums', 'bass', 'chords'], bars: 8 },
      { name: 'Chorus 2', roles: 'all', bars: 8 },
      { name: 'Bridge', roles: ['chords', 'lead'], bars: 4 },
      { name: 'Chorus 3', roles: 'all', bars: 8 },
      { name: 'Outro', roles: ['chords'], bars: 4 },
    ],
  },
  {
    id: 'edm',
    label: 'Electronic (build / drop / break)',
    sections: [
      { name: 'Intro', roles: ['drums'], bars: 8 },
      { name: 'Build', roles: ['drums', 'chords'], bars: 8 },
      { name: 'Drop', roles: 'all', bars: 16 },
      { name: 'Break', roles: ['chords', 'lead'], bars: 8 },
      { name: 'Build 2', roles: ['drums', 'chords', 'lead'], bars: 8 },
      { name: 'Drop 2', roles: 'all', bars: 16 },
      { name: 'Outro', roles: ['drums', 'bass'], bars: 8 },
    ],
  },
  {
    id: 'hiphop',
    label: 'Hip-hop (verse / hook)',
    sections: [
      { name: 'Intro', roles: ['chords', 'lead'], bars: 4 },
      { name: 'Verse', roles: ['drums', 'bass', 'chords'], bars: 16 },
      { name: 'Hook', roles: 'all', bars: 8 },
      { name: 'Verse 2', roles: ['drums', 'bass', 'chords'], bars: 16 },
      { name: 'Hook 2', roles: 'all', bars: 8 },
      { name: 'Outro', roles: ['chords'], bars: 4 },
    ],
  },
  {
    id: 'ambient',
    label: 'Slow build (layers come in one by one)',
    sections: [
      { name: 'Pad', roles: ['chords'], bars: 8 },
      { name: 'Melody', roles: ['chords', 'lead'], bars: 8 },
      { name: 'Bass', roles: ['chords', 'lead', 'bass'], bars: 8 },
      { name: 'Full', roles: 'all', bars: 16 },
      { name: 'Fade', roles: ['chords', 'lead'], bars: 8 },
    ],
  },
]

/** Role of each track for section filtering. */
export function trackRoles(project: Project): Map<string, Role> {
  const roles = new Map<string, Role>()
  const bass = findBass(project)
  const kick = findKick(project)
  const chords = new Set(findChordTracks(project).map(track => track.id))
  for (const track of project.tracks) {
    if (track.kind === 'drums' || track.id === kick?.id) roles.set(track.id, 'drums')
    else if (track.id === bass?.id) roles.set(track.id, 'bass')
    else if (chords.has(track.id)) roles.set(track.id, 'chords')
    else if (track.kind === 'synth' || track.kind === 'keys') roles.set(track.id, 'lead')
    else roles.set(track.id, 'other')
  }
  return roles
}

/**
 * Lays the structure out on the first lane from `patternId`, replacing that lane's clips and the
 * markers. Section patterns are derived once and reused when the same role set repeats.
 */
export function buildSong(project: Project, structure: Structure, patternId: string) {
  const main = project.patterns.find(item => item.id === patternId) ?? project.patterns[0]
  const lane = project.lanes[0]
  const roles = trackRoles(project)
  const beatsPerBar = project.timeSignature.beats
  const patternBars = main.bars
  project.clips = project.clips.filter(clip => clip.laneId !== lane.id)
  project.markers = []
  const derived = new Map<string, string>()
  let cursor = 0
  for (const section of structure.sections) {
    const key = section.roles === 'all' ? 'all' : [...section.roles].sort().join('+')
    let sectionPatternId = section.roles === 'all' ? main.id : derived.get(key)
    if (!sectionPatternId) {
      const keep = new Set(section.roles === 'all' ? [] : section.roles)
      const pattern = {
        id: uid(),
        name: `${main.name} · ${section.roles === 'all' ? 'all' : (section.roles as Role[]).join(' + ')}`,
        bars: main.bars,
        trackSteps: main.trackSteps.map(row => {
          const kept = keep.has(roles.get(row.trackId) ?? 'other')
          return {
            trackId: row.trackId,
            steps: row.steps.map(step => (kept ? { ...step } : makeStep())),
            notes: kept ? row.notes.map(note => ({ ...note, id: uid() })) : [],
          }
        }),
      }
      project.patterns.push(pattern)
      sectionPatternId = pattern.id
      derived.set(key, pattern.id)
    }
    const bars = Math.max(patternBars, Math.round(section.bars / patternBars) * patternBars)
    const length = bars * beatsPerBar
    project.clips.push({
      id: uid(),
      kind: 'pattern',
      name: section.name,
      laneId: lane.id,
      start: cursor,
      length,
      muted: false,
      patternId: sectionPatternId,
    })
    project.markers.push({ id: uid(), name: section.name, beat: cursor })
    cursor += length
  }
  project.loop = { enabled: false, start: 0, end: cursor }
  return cursor
}

export const describeTrackRole = (track: Track, roles: Map<string, Role>) => roles.get(track.id) ?? 'other'
