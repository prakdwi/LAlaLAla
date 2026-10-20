/**
 * Factory content packs. Kits are synthesized with the Sound Lab drum engine at install time and
 * saved to the library as ordinary kits (one sample, sliced, named pads); patches are synth
 * parameter sets. Installing is idempotent: items carry a `pack:<id>` tag.
 */
import { renderKit, type KitSound } from '../tutorials/build'
import { encodeWav } from '../audio/wav'
import { engine } from '../audio/engine'
import { saveKitToLibrary, saveSynthToLibrary } from '../db/library'
import { makePad, makeSynth, uid } from '../state/defaults'
import { notify, useStudio } from '../state/store'
import type { Pad, SynthParams, Track } from '../state/types'

export type Pack = {
  id: string
  name: string
  blurb: string
  kits: { name: string; sounds: KitSound[] }[]
  patches: { name: string; patch: Partial<SynthParams> }[]
}

const hat = (decay: number, tone = 9000): KitSound => ({
  name: 'Hat',
  kind: 'hat',
  params: { decay, noiseDecay: decay * 1.5, tone },
})
const openHat = (decay = 0.2): KitSound => ({
  name: 'Open hat',
  kind: 'hat',
  params: { decay, noiseDecay: decay * 1.4 },
})

export const PACKS: Pack[] = [
  {
    id: 'trap-essentials',
    name: 'Trap essentials',
    blurb: 'Three 808 kits with claps, snares and tight hats.',
    kits: [
      {
        name: 'Trap 808 A',
        sounds: [
          { name: '808', kind: 'kick', params: { pitch: 46, sweep: 0.55, decay: 1.2, click: 0.35, drive: 0.5 } },
          { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.2, tone: 3500 } },
          { name: 'Snare', kind: 'snare', params: { pitch: 210, noiseDecay: 0.15, tone: 8000 } },
          hat(0.03),
          openHat(),
          { name: 'Rim', kind: 'perc', params: { pitch: 1400, decay: 0.05 } },
        ],
      },
      {
        name: 'Trap 808 B (dark)',
        sounds: [
          {
            name: '808 long',
            kind: 'kick',
            params: { pitch: 42, sweep: 0.5, decay: 1.6, click: 0.25, drive: 0.65, tone: 2500 },
          },
          { name: 'Clap wide', kind: 'clap', params: { noiseDecay: 0.26, tone: 3000, character: 0.8 } },
          { name: 'Snare tight', kind: 'snare', params: { pitch: 230, noiseDecay: 0.12, tone: 9000 } },
          hat(0.025, 10000),
          openHat(0.26),
          { name: 'Perc', kind: 'perc', params: { pitch: 900, decay: 0.07 } },
        ],
      },
      {
        name: 'Drill kit',
        sounds: [
          { name: '808 slide', kind: 'kick', params: { pitch: 44, sweep: 0.5, decay: 1.1, click: 0.3, drive: 0.55 } },
          { name: 'Snare', kind: 'snare', params: { pitch: 220, noise: 0.85, noiseDecay: 0.16, tone: 9000 } },
          hat(0.025),
          openHat(0.18),
          { name: 'Perc', kind: 'perc', params: { pitch: 1000, decay: 0.05, click: 0.6 } },
          { name: 'Tom', kind: 'tom', params: { pitch: 150, decay: 0.25 } },
        ],
      },
    ],
    patches: [
      {
        name: '808 sub',
        patch: {
          osc1: 'sine',
          osc2: 'sine',
          osc2Level: 0,
          subLevel: 0.6,
          cutoff: 900,
          resonance: 0.2,
          envAmount: 0.1,
          attack: 0.005,
          decay: 0.3,
          sustain: 0.9,
          release: 0.2,
          glide: 0.12,
          unison: 1,
        },
      },
      {
        name: 'Dark pad',
        patch: {
          osc1: 'sawtooth',
          osc2: 'sawtooth',
          osc2Detune: 0.12,
          osc2Level: 0.8,
          cutoff: 800,
          resonance: 0.6,
          envAmount: 0.1,
          attack: 0.8,
          decay: 1,
          sustain: 0.8,
          release: 1.6,
          unison: 3,
          spread: 0.6,
        },
      },
      {
        name: 'Bell',
        patch: {
          osc1: 'triangle',
          osc2: 'sine',
          osc2Detune: 12,
          osc2Level: 0.4,
          subLevel: 0,
          cutoff: 3200,
          resonance: 0.8,
          envAmount: 0.3,
          attack: 0.004,
          decay: 0.5,
          sustain: 0.15,
          release: 1.4,
          unison: 1,
        },
      },
    ],
  },
  {
    id: 'house-club',
    name: 'House and club',
    blurb: 'Punchy four-on-the-floor kits and stab, organ and bass patches.',
    kits: [
      {
        name: 'House kit',
        sounds: [
          { name: 'Kick', kind: 'kick', params: { pitch: 58, sweep: 0.5, decay: 0.3, click: 0.6, drive: 0.4 } },
          { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.16 } },
          hat(0.03),
          openHat(0.15),
          { name: 'Perc', kind: 'perc', params: { pitch: 800, decay: 0.06 } },
          { name: 'Snare', kind: 'snare', params: { pitch: 200, noise: 0.9, noiseDecay: 0.2 } },
        ],
      },
      {
        name: 'Techno kit',
        sounds: [
          { name: 'Kick hard', kind: 'kick', params: { pitch: 60, sweep: 0.65, decay: 0.26, click: 0.8, drive: 0.6 } },
          { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.12, tone: 5000 } },
          hat(0.02, 11000),
          openHat(0.12),
          { name: 'Rim', kind: 'perc', params: { pitch: 1600, decay: 0.03, click: 0.9 } },
          { name: 'Tom', kind: 'tom', params: { pitch: 180, decay: 0.2 } },
        ],
      },
    ],
    patches: [
      {
        name: 'Organ bass',
        patch: {
          osc1: 'square',
          osc2: 'sawtooth',
          osc2Detune: 0,
          osc2Level: 0.5,
          subLevel: 0.4,
          cutoff: 700,
          resonance: 0.8,
          envAmount: 0.4,
          attack: 0.004,
          decay: 0.18,
          sustain: 0.4,
          release: 0.12,
          unison: 1,
        },
      },
      {
        name: 'Piano stab',
        patch: {
          osc1: 'sawtooth',
          osc2: 'square',
          osc2Detune: 7,
          osc2Level: 0.4,
          cutoff: 2600,
          resonance: 1.4,
          envAmount: 0.7,
          attack: 0.003,
          decay: 0.3,
          sustain: 0.1,
          release: 0.2,
          unison: 2,
          spread: 0.3,
        },
      },
      {
        name: 'Rave lead',
        patch: {
          osc1: 'sawtooth',
          osc2: 'sawtooth',
          osc2Detune: 12,
          osc2Level: 0.7,
          cutoff: 4000,
          resonance: 1,
          envAmount: 0.5,
          attack: 0.01,
          decay: 0.4,
          sustain: 0.5,
          release: 0.3,
          unison: 4,
          spread: 0.7,
        },
      },
    ],
  },
  {
    id: 'lofi-soul',
    name: 'Lo-fi and soul',
    blurb: 'Dusty, soft kits and warm keys.',
    kits: [
      {
        name: 'Lo-fi kit',
        sounds: [
          {
            name: 'Kick',
            kind: 'kick',
            params: { pitch: 50, sweep: 0.35, decay: 0.3, click: 0.15, drive: 0.5, tone: 1800 },
          },
          {
            name: 'Snare',
            kind: 'snare',
            params: { pitch: 170, noise: 0.6, noiseDecay: 0.14, tone: 2800, drive: 0.5 },
          },
          hat(0.025, 5000),
          {
            name: 'Shaker',
            kind: 'hat',
            params: { pitch: 600, character: 0.3, decay: 0.05, noiseDecay: 0.09, tone: 4000 },
          },
          { name: 'Rim', kind: 'perc', params: { pitch: 1200, decay: 0.04, click: 0.8 } },
          openHat(0.14),
        ],
      },
      {
        name: 'Boom bap kit',
        sounds: [
          {
            name: 'Kick',
            kind: 'kick',
            params: { pitch: 52, sweep: 0.4, decay: 0.35, click: 0.2, drive: 0.6, tone: 2500 },
          },
          {
            name: 'Snare',
            kind: 'snare',
            params: { pitch: 180, noise: 0.7, noiseDecay: 0.18, tone: 3500, drive: 0.4 },
          },
          hat(0.03, 6000),
          openHat(0.16),
          { name: 'Rim', kind: 'perc', params: { pitch: 1200, decay: 0.04, click: 0.8 } },
          { name: 'Clap', kind: 'clap' },
        ],
      },
    ],
    patches: [
      {
        name: 'Rhodes',
        patch: {
          osc1: 'sine',
          osc2: 'triangle',
          osc2Detune: 19,
          osc2Level: 0.25,
          subLevel: 0,
          cutoff: 1800,
          resonance: 0.4,
          envAmount: 0.25,
          attack: 0.004,
          decay: 0.9,
          sustain: 0.3,
          release: 0.6,
          unison: 1,
        },
      },
      {
        name: 'Warm keys',
        patch: {
          osc1: 'triangle',
          osc2: 'sine',
          osc2Detune: 12,
          osc2Level: 0.3,
          subLevel: 0.1,
          cutoff: 2000,
          resonance: 0.5,
          envAmount: 0.3,
          attack: 0.005,
          decay: 0.6,
          sustain: 0.4,
          release: 0.5,
          unison: 1,
        },
      },
      {
        name: 'Round bass',
        patch: {
          osc1: 'sine',
          osc2: 'triangle',
          osc2Level: 0.3,
          subLevel: 0.5,
          cutoff: 600,
          resonance: 0.3,
          envAmount: 0.2,
          attack: 0.005,
          decay: 0.3,
          sustain: 0.8,
          release: 0.2,
          unison: 1,
        },
      },
    ],
  },
  {
    id: 'world-pop',
    name: 'Afro and pop',
    blurb: 'Bouncy percussion kits and bright pluck and pad patches.',
    kits: [
      {
        name: 'Afro kit',
        sounds: [
          { name: 'Kick', kind: 'kick', params: { pitch: 56, sweep: 0.45, decay: 0.28, click: 0.4, drive: 0.35 } },
          { name: 'Rim', kind: 'perc', params: { pitch: 1300, decay: 0.05, click: 0.9 } },
          hat(0.03),
          {
            name: 'Shaker',
            kind: 'hat',
            params: { pitch: 700, character: 0.3, decay: 0.05, noiseDecay: 0.08, tone: 5000 },
          },
          { name: 'Conga', kind: 'tom', params: { pitch: 240, decay: 0.16, sweep: 0.3 } },
          { name: 'Clap', kind: 'clap' },
        ],
      },
      {
        name: 'Pop kit',
        sounds: [
          { name: 'Kick', kind: 'kick', params: { pitch: 60, sweep: 0.5, decay: 0.32, click: 0.6, drive: 0.3 } },
          { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.18 } },
          hat(0.03),
          { name: 'Snare', kind: 'snare', params: { pitch: 200, noise: 0.9, noiseDecay: 0.2, drive: 0.3 } },
          openHat(0.16),
          { name: 'Tom', kind: 'tom', params: { pitch: 200, decay: 0.22 } },
        ],
      },
    ],
    patches: [
      {
        name: 'Pluck',
        patch: {
          osc1: 'sawtooth',
          osc2: 'square',
          osc2Detune: 7,
          osc2Level: 0.4,
          cutoff: 3000,
          resonance: 1.4,
          envAmount: 0.7,
          attack: 0.003,
          decay: 0.22,
          sustain: 0.05,
          release: 0.2,
          unison: 2,
          spread: 0.3,
        },
      },
      {
        name: 'Big pad',
        patch: {
          osc1: 'sawtooth',
          osc2: 'sawtooth',
          osc2Detune: 0.12,
          osc2Level: 0.8,
          cutoff: 1600,
          resonance: 0.6,
          envAmount: 0.1,
          attack: 0.3,
          decay: 1,
          sustain: 0.8,
          release: 1.4,
          unison: 3,
          spread: 0.6,
        },
      },
      {
        name: 'Log bass',
        patch: {
          osc1: 'sine',
          osc2: 'triangle',
          osc2Detune: 7,
          osc2Level: 0.4,
          cutoff: 1200,
          resonance: 1.4,
          envAmount: 0.7,
          attack: 0.003,
          decay: 0.35,
          sustain: 0.2,
          release: 0.2,
          unison: 1,
        },
      },
    ],
  },
]

export const packTag = (pack: Pack) => `pack:${pack.id}`

export function packInstalled(pack: Pack) {
  const tag = packTag(pack)
  const library = useStudio.getState().library
  const kits = library.filter(item => item.kind === 'kit' && item.tags.includes(tag)).length
  const patches = library.filter(item => item.kind === 'synth' && item.tags.includes(tag)).length
  return kits >= pack.kits.length && patches >= pack.patches.length
}

/** Renders and saves everything in the pack that is not in the library yet. */
export async function installPack(pack: Pack, onProgress?: (done: number, total: number) => void) {
  await engine.ready()
  const tag = packTag(pack)
  const library = useStudio.getState().library
  const total = pack.kits.length + pack.patches.length
  let done = 0
  for (const kit of pack.kits) {
    if (!library.some(item => item.kind === 'kit' && item.tags.includes(tag) && item.name === kit.name)) {
      const rendered = renderKit(kit.sounds)
      const bufferId = uid()
      const blob = encodeWav({
        numberOfChannels: 1,
        length: rendered.data.length,
        sampleRate: 44100,
        getChannelData: () => rendered.data,
      })
      await engine.decode(bufferId, blob)
      const pads: Pad[] = rendered.starts.map((start, index) => ({
        ...makePad(start, rendered.starts[index + 1] ?? rendered.duration),
        name: kit.sounds[index]?.name,
      }))
      while (pads.length < 16) pads.push(makePad(0, rendered.duration))
      const track: Track = {
        id: uid(),
        name: kit.name,
        kind: 'drums',
        color: '',
        sampleBufferId: bufferId,
        pads,
        rootNote: 60,
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        effects: [],
        sequencerPadId: pads[0].id,
        sends: [],
      }
      await saveKitToLibrary(track, kit.name, [tag])
    }
    onProgress?.(++done, total)
  }
  for (const patch of pack.patches) {
    if (!library.some(item => item.kind === 'synth' && item.tags.includes(tag) && item.name === patch.name))
      await saveSynthToLibrary(patch.name, { ...makeSynth(), ...patch.patch }, [tag])
    onProgress?.(++done, total)
  }
  notify(`Installed "${pack.name}": ${pack.kits.length} kits and ${pack.patches.length} patches are in the library.`)
}
