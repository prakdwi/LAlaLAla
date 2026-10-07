/**
 * "Learn the tools" lessons. Every demo button builds or changes a small demo project, opens the
 * screen it talks about, and plays the result so you hear what the control does.
 */
import {
  addSynth,
  playDemo,
  program,
  requireProject,
  selectTrackByName,
  startProject,
  writeNotes,
  type KitSound,
} from './build'
import type { Tutorial } from './songs'
import { chop, resamplePattern, setMpc } from '../state/mpc'
import { useStudio } from '../state/store'
import { makeDrumLayer, makeSynthLayer, useLab } from '../state/lab'
import { saveSynthToLibrary } from '../db/library'
import { makeSynth } from '../state/defaults'
import type { SynthParams } from '../state/types'

const every = (start: number, step: number, end: number) =>
  Array.from({ length: Math.ceil((end - start) / step) }, (_, i) => start + i * step)

const BASIC_KIT: KitSound[] = [
  { name: 'Kick', kind: 'kick', params: { pitch: 55, decay: 0.35, click: 0.5 } },
  { name: 'Snare', kind: 'snare' },
  { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.05 } },
]
const basicBeat = (project: string) => {
  program(project, 'Demo', 'Kit', 0, [0, 10, 16, 26])
  program(project, 'Demo', 'Kit', 1, [8, 24])
  program(
    project,
    'Demo',
    'Kit',
    2,
    every(0, 2, 32).map(step => ({ step, velocity: step % 4 ? 0.45 : 0.7 })),
  )
}

// ---------------------------------------------------------------------------------------------
const PR = 'Piano roll demo'
const KEYS: Partial<SynthParams> = {
  osc1: 'triangle',
  osc2: 'sine',
  osc2Detune: 12,
  osc2Level: 0.3,
  subLevel: 0.1,
  cutoff: 2600,
  resonance: 0.5,
  envAmount: 0.3,
  attack: 0.005,
  decay: 0.6,
  sustain: 0.4,
  release: 0.5,
  unison: 1,
}
const pianoRoll: Tutorial = {
  id: 'tool-piano-roll',
  section: 'tools',
  title: 'The piano roll',
  subtitle: 'Write chords and melodies',
  projectName: PR,
  summary:
    'The piano roll is a grid: time runs left to right, pitch runs bottom to top, and each bar is a note. You can draw notes with the mouse, or play them on the keyboard while recording. In the Jam room it edits the notes of the current take; in the Studio it edits MIDI clips on the arrangement.',
  listenFor: [
    'How a note’s length changes how long it rings.',
    'How quieter notes (velocity) make a part feel played instead of programmed.',
  ],
  steps: [
    {
      title: 'Set up a demo with a keys sound',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Creates a small project with a drum kit, a simple beat and a soft keys synth, then opens the Jam room with the keys selected. The keyboard and piano roll replace the pads for melodic kits.',
      ],
      runLabel: 'Create demo',
      run: async () => {
        await startProject({
          name: PR,
          bpm: 90,
          swing: 0.1,
          kitName: 'Kit',
          patternName: 'Demo',
          bars: 2,
          sounds: BASIC_KIT,
        })
        basicBeat(PR)
        addSynth(PR, 'Keys', KEYS, 0.6)
        selectTrackByName(PR, 'Keys')
      },
    },
    {
      title: 'Draw a chord progression',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Click anywhere in the grid to add a note at that pitch and time; drag right while you click to make it longer. Stack notes vertically to make a chord.',
        'The demo draws four chords, one per two beats: C major, A minor, F major, G major. Each chord is three notes stacked on the same beat.',
      ],
      runLabel: 'Draw chords and play',
      run: async () => {
        writeNotes(PR, 'Demo', 'Keys', [
          [60, 0, 2],
          [64, 0, 2],
          [67, 0, 2],
          [57, 2, 2],
          [60, 2, 2],
          [64, 2, 2],
          [53, 4, 2],
          [57, 4, 2],
          [60, 4, 2],
          [55, 6, 2],
          [59, 6, 2],
          [62, 6, 2],
        ])
        selectTrackByName(PR, 'Keys')
        await playDemo(6)
      },
    },
    {
      title: 'Melody, note length and velocity',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Drag a note to move it. Drag its right edge to make it longer or shorter. Hold Alt (Option) and drag up or down to change velocity: faded notes are quieter. Double-click a note to delete it.',
        'The demo adds a short melody on top of the chords with long and short notes and a few soft ones, so you can hear the difference.',
      ],
      runLabel: 'Add melody and play',
      run: async () => {
        writeNotes(PR, 'Demo', 'Keys', [
          [60, 0, 2, 0.6],
          [64, 0, 2, 0.6],
          [67, 0, 2, 0.6],
          [57, 2, 2, 0.6],
          [60, 2, 2, 0.6],
          [64, 2, 2, 0.6],
          [53, 4, 2, 0.6],
          [57, 4, 2, 0.6],
          [60, 4, 2, 0.6],
          [55, 6, 2, 0.6],
          [59, 6, 2, 0.6],
          [62, 6, 2, 0.6],
          [76, 0, 1, 0.9],
          [74, 1, 0.5, 0.5],
          [72, 1.5, 0.5, 0.6],
          [74, 2, 1.5, 0.9],
          [72, 4, 0.5, 0.8],
          [69, 4.5, 0.5, 0.45],
          [72, 5, 1, 0.8],
          [71, 6, 2, 0.9],
        ])
        selectTrackByName(PR, 'Keys')
        await playDemo(6)
      },
    },
    {
      title: 'Record from the keyboard',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Your computer keyboard is a piano: A S D F G H J K L are the white keys from C, W E T Y U O P are the black keys, and Z / X shift the octave. A MIDI keyboard works too after clicking MIDI.',
        'The demo clears the melody and sets Quantize to 1/16. Press Record take, play along, and watch your notes appear in the piano roll. Every pass of the loop overdubs.',
      ],
      runLabel: 'Clear and get ready to record',
      run: () => {
        writeNotes(PR, 'Demo', 'Keys', [
          [60, 0, 2],
          [64, 0, 2],
          [67, 0, 2],
          [53, 4, 2],
          [57, 4, 2],
          [60, 4, 2],
        ])
        setMpc({ quantize: 0.25 })
        selectTrackByName(PR, 'Keys')
      },
    },
    {
      title: 'Quantize: tight or human',
      where: 'jam',
      body: [
        'Quantize decides where recorded notes land. 1/16 snaps them to the nearest sixteenth so everything is tight. Off keeps exactly when you played, so the part breathes.',
        'Record the same melody once at 1/16 and once with Off, and compare. The piano roll’s 1/16 button does the same thing for notes you drag with the mouse.',
      ],
      runLabel: 'Set Quantize Off',
      run: () => setMpc({ quantize: 0 }),
    },
  ],
}

// ---------------------------------------------------------------------------------------------
const SY = 'Synth demo'
const riff: [number, number, number, number?][] = [
  [48, 0, 0.5],
  [48, 0.75, 0.25],
  [55, 1, 0.5],
  [58, 1.5, 0.5],
  [60, 2, 1],
  [58, 3, 0.5],
  [55, 3.5, 0.5],
  [51, 4, 0.5],
  [51, 4.75, 0.25],
  [58, 5, 0.5],
  [60, 5.5, 0.5],
  [63, 6, 1],
  [60, 7, 0.5],
  [58, 7.5, 0.5],
]
const setPatch = async (patch: Partial<SynthParams>, notes = riff) => {
  addSynth(SY, 'Synth', patch, 0.6)
  writeNotes(SY, 'Demo', 'Synth', notes)
  selectTrackByName(SY, 'Synth')
  await playDemo(6)
}
const synth: Tutorial = {
  id: 'tool-synth',
  section: 'tools',
  title: 'Synthesized sounds',
  subtitle: 'From one plain tone to pads, plucks, leads and bass',
  projectName: SY,
  summary:
    'A synth starts with oscillators (raw tones), shapes them with a filter (brightness) and an envelope (how the volume and brightness move over time). Every step plays the same riff with one change, so you hear exactly what each control does. Hover any knob for a plain-English explanation.',
  listenFor: ['The same notes can sound like a bell, a pad or a bass depending only on these settings.'],
  steps: [
    {
      title: 'Start with a plain tone',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Creates a project with a synth track playing a riff, using the default sound. The synth controls appear on the right of the Jam room (and below the keyboard in the Studio).',
      ],
      runLabel: 'Create demo and play',
      run: async () => {
        await startProject({
          name: SY,
          bpm: 100,
          swing: 0,
          kitName: 'Kit',
          patternName: 'Demo',
          bars: 2,
          sounds: BASIC_KIT,
        })
        basicBeat(SY)
        await setPatch(makeSynth())
      },
    },
    {
      title: 'Oscillators: the raw tone',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Sine is pure and soft, triangle is a little brighter, saw is buzzy and rich, square is hollow. Two oscillators slightly detuned against each other sound wider; detuned by 12 they add an octave.',
        'Demo: a pure sine first, then two saws detuned a little for a thick tone.',
      ],
      runLabel: 'Hear sine, then saws',
      run: async () => {
        await setPatch({ osc1: 'sine', osc2Level: 0, subLevel: 0, cutoff: 12000, envAmount: 0 })
        setTimeout(
          () =>
            void setPatch({
              osc1: 'sawtooth',
              osc2: 'sawtooth',
              osc2Detune: 0.15,
              osc2Level: 0.9,
              subLevel: 0,
              cutoff: 12000,
              envAmount: 0,
            }),
          3500,
        )
      },
    },
    {
      title: 'Filter and envelope: the “wow” pluck',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Cutoff sets how bright the sound is. Resonance adds a ringing peak at the cutoff. Env amount makes the filter open on every note and close as the note decays: that is the classic pluck.',
      ],
      runLabel: 'Hear the pluck',
      run: () =>
        setPatch({
          osc1: 'sawtooth',
          osc2: 'square',
          osc2Detune: 7,
          osc2Level: 0.4,
          cutoff: 300,
          resonance: 4,
          envAmount: 0.8,
          attack: 0.002,
          decay: 0.2,
          sustain: 0.1,
          release: 0.15,
        }),
    },
    {
      title: 'Envelope shape: a soft pad',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Attack is how long the note takes to fade in; release is how long it rings after. A slow attack, high sustain and long release turn the same notes into a soft pad. Unison stacks detuned copies for width.',
      ],
      runLabel: 'Hear the pad',
      run: () =>
        setPatch(
          {
            osc1: 'sawtooth',
            osc2: 'sawtooth',
            osc2Detune: 0.12,
            osc2Level: 0.8,
            cutoff: 1200,
            resonance: 0.6,
            envAmount: 0.1,
            attack: 0.6,
            decay: 1,
            sustain: 0.8,
            release: 1.4,
            unison: 5,
            spread: 0.6,
          },
          [
            [48, 0, 4],
            [55, 0, 4],
            [63, 0, 4],
            [51, 4, 4],
            [58, 4, 4],
            [65, 4, 4],
          ],
        ),
    },
    {
      title: 'Glide: a sliding lead',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Glide makes the pitch slide from one note to the next instead of jumping. Combined with unison it gives a big lead. Turned up on a sine bass, the same control gives an 808 slide.',
      ],
      runLabel: 'Hear the lead',
      run: () =>
        setPatch(
          {
            osc1: 'sawtooth',
            osc2: 'sawtooth',
            osc2Detune: 0.08,
            osc2Level: 0.7,
            cutoff: 4000,
            resonance: 1.2,
            envAmount: 0.3,
            attack: 0.01,
            decay: 0.3,
            sustain: 0.7,
            release: 0.2,
            unison: 5,
            spread: 0.3,
            glide: 0.08,
          },
          riff.map(([pitch, start, length]) => [pitch + 12, start, length + 0.1]),
        ),
    },
    {
      title: 'Bass: sub and sine',
      where: 'jam',
      goTo: 'jam',
      body: [
        'For bass, keep the tone simple and low: a sine or square with the Sub oscillator up and the filter fairly closed. The demo moves the riff two octaves down.',
      ],
      runLabel: 'Hear the bass',
      run: () =>
        setPatch(
          {
            osc1: 'square',
            osc2Level: 0,
            subLevel: 0.8,
            cutoff: 500,
            resonance: 1,
            envAmount: 0.3,
            attack: 0.003,
            decay: 0.3,
            sustain: 0.6,
            release: 0.15,
            unison: 1,
            glide: 0.03,
          },
          riff.map(([pitch, start, length]) => [pitch - 24, start, length]),
        ),
    },
    {
      title: 'Save your sound',
      where: 'lab',
      body: [
        'Press Save patch on the synth panel to keep a sound in the Library; load it on any synth track in any project. For deeper design, open the Sound Lab and pick Synth patch: it has the same controls plus a keyboard to audition.',
      ],
      runLabel: 'Save this patch to the library',
      run: async () => {
        const project = requireProject(SY)
        const track = project.tracks.find(item => item.name === 'Synth')
        if (track?.synth) await saveSynthToLibrary('Tutorial bass', track.synth)
      },
    },
  ],
}

// ---------------------------------------------------------------------------------------------
const MP = 'MPC demo'
const MPC_KIT: KitSound[] = [
  { name: 'Kick', kind: 'kick', params: { pitch: 55, decay: 0.4, click: 0.5, drive: 0.3 } },
  { name: 'Snare', kind: 'snare', params: { noiseDecay: 0.18 } },
  { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.05 } },
  { name: 'Open hat', kind: 'hat', params: { decay: 0.2, noiseDecay: 0.3 } },
  { name: 'Clap', kind: 'clap' },
  { name: 'Low tom', kind: 'tom', params: { pitch: 90 } },
  { name: 'High tom', kind: 'tom', params: { pitch: 160 } },
  { name: 'Rim', kind: 'perc', params: { pitch: 1300, decay: 0.04 } },
]
const mpc: Tutorial = {
  id: 'tool-mpc',
  section: 'tools',
  title: 'The MPC sampler',
  subtitle: 'Pads, takes, note repeat, chopping and sampling',
  projectName: MP,
  summary:
    'The Jam room works like an MPC: sixteen pads per bank, each playing a slice of a sample. You perform on the pads, record takes that loop and overdub, and chop any audio (a file, your microphone, a video, or your own beat) into new pads.',
  listenFor: [
    'Pads struck near the bottom are louder than pads struck near the top.',
    'Note repeat locks rolls to the tempo.',
  ],
  steps: [
    {
      title: 'Load a kit onto the pads',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Creates a project with an eight-sound kit on pads 1 to 8 and opens the Jam room. Pads play with the keys 1 2 3 4 / Q W E R / A S D F / Z X C V, the mouse, touch, or MIDI notes 36 to 51.',
        'Where you strike a pad sets its velocity: low on the pad is loud, high is soft. Turn on Full level to make every hit full volume.',
      ],
      runLabel: 'Create kit',
      run: async () => {
        await startProject({
          name: MP,
          bpm: 92,
          swing: 0.15,
          kitName: 'MPC kit',
          patternName: 'Demo',
          bars: 2,
          sounds: MPC_KIT,
        })
        setMpc({ bank: 0, levels: 'off', repeat: 0, erase: false, padMute: false, fullLevel: false, quantize: 0.25 })
        selectTrackByName(MP, 'MPC kit')
      },
    },
    {
      title: 'Record a take',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Set Count-in to 1 and press Record take. A take loops (here two bars) and each pass adds what you play, so you can lay down the kick first, then the snare, then the hats.',
        'Quantize 1/16 tidies your timing as you record. Undo last hit removes a mistake without stopping. The demo records an example take for you to listen to.',
      ],
      runLabel: 'Hear an example take',
      run: async () => {
        program(MP, 'Demo', 'MPC kit', 0, [0, 7, 10, 16, 26])
        program(MP, 'Demo', 'MPC kit', 1, [8, 24])
        program(
          MP,
          'Demo',
          'MPC kit',
          2,
          every(0, 2, 32).map(step => ({ step, velocity: step % 4 ? 0.45 : 0.7 })),
        )
        program(MP, 'Demo', 'MPC kit', 7, [
          { step: 14, velocity: 0.6 },
          { step: 30, velocity: 0.6 },
        ])
        useStudio.getState().edit('Count-in', draft => {
          draft.countInBars = 1
        })
        await playDemo(6)
      },
    },
    {
      title: 'Note repeat for rolls',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Choose a Repeat rate (1/16 or 1/32) and hold a pad: it re-triggers in time with the beat for as long as you hold it. This is how hi-hat rolls and snare build-ups are played. While recording, every repeat is recorded.',
        'The demo turns Repeat on at 1/16 and adds an example roll so you can hear it.',
      ],
      runLabel: 'Turn on repeat and hear a roll',
      run: async () => {
        setMpc({ repeat: 0.25 })
        program(MP, 'Demo', 'MPC kit', 2, [
          ...every(0, 2, 24).map(step => ({ step, velocity: 0.55 })),
          ...[24, 25, 26, 27, 28, 29, 30, 31].map((step, index) => ({ step, velocity: 0.4 + index * 0.08 })),
        ])
        await playDemo(6)
      },
    },
    {
      title: '16 levels: one sound, sixteen ways',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Select a pad, then set 16 levels to Tune: all sixteen pads now play that one sound, each a semitone apart. Turn a kick into a bassline, or a vocal chop into a melody. Velocity mode spreads it from soft to loud instead.',
        'The demo selects the Low tom and switches to Tune. Play pads 1 to 16 to hear it.',
      ],
      runLabel: 'Switch to 16 levels: Tune',
      run: () => {
        const project = requireProject(MP)
        const tom = project.tracks[0].pads[5]
        useStudio.setState({ selectedPadId: tom.id })
        setMpc({ levels: 'tune', repeat: 0 })
      },
    },
    {
      title: 'Erase and pad mute',
      where: 'jam',
      body: [
        'Erase: turn it on and tap a pad to remove every hit of that pad from the take. Pad mute: tap a pad to silence it in playback while still playing it live, handy for drops and breakdowns.',
      ],
      runLabel: 'Back to normal pads',
      run: () => setMpc({ levels: 'off', erase: false, padMute: false }),
    },
    {
      title: 'Resample and chop',
      where: 'jam',
      goTo: 'jam',
      body: [
        'Resample renders the current take into a single sample on a new kit. Chop then cuts it up: Threshold finds the hits automatically, Equal regions cuts it into 4 to 32 even pieces. Each piece lands on a pad.',
        'The demo resamples the beat, chops it into 8 equal slices and plays them back in a new order: the essence of flipping a sample.',
      ],
      runLabel: 'Resample, chop and flip',
      run: async () => {
        requireProject(MP)
        await resamplePattern()
        const state = useStudio.getState()
        const track = state.project.tracks.find(item => item.id === state.selectedTrackId)
        if (!track) return
        chop(track, 'equal', { count: 8 })
        const name = track.name
        program(MP, 'Demo', 'MPC kit', 0, [])
        program(MP, 'Demo', 'MPC kit', 1, [])
        program(MP, 'Demo', 'MPC kit', 2, [])
        program(MP, 'Demo', 'MPC kit', 7, [])
        for (const [pad, steps] of [
          [0, [0, 16]],
          [3, [4, 20]],
          [1, [8]],
          [6, [12, 28]],
          [2, [24]],
        ] as const)
          program(MP, 'Demo', name, pad, [...steps])
        await playDemo(6)
      },
    },
    {
      title: 'Sample anything',
      where: 'jam',
      body: [
        'Sample mic records from your microphone onto the kit. With a YouTube video loaded, Connect tab audio and Sample IN → OUT captures exactly the region you mark. Load sample on the sample editor takes any audio file. Every one of them is chopped onto the pads the same way.',
        'Save kit keeps the chopped result in the Library for other projects.',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------------------------
const lab: Tutorial = {
  id: 'tool-lab',
  section: 'tools',
  title: 'The Sound Lab',
  subtitle: 'Design drums and layered sounds from scratch',
  projectName: '',
  summary:
    'The Sound Lab synthesizes sounds without any samples. Design a drum, stack layers, process them, then send the result to a kit or save it to the Library. Click the waveform any time to hear the sound.',
  listenFor: ['Pitch and Sweep make the difference between a tight kick and a booming 808.'],
  steps: [
    {
      title: 'Design a kick',
      where: 'lab',
      goTo: 'lab',
      body: [
        'Pitch sets the body note, Sweep how far it drops, Decay how long it rings, Click the snap at the start. The demo builds a short punchy kick; press Audition to hear it.',
      ],
      runLabel: 'Load a punchy kick',
      run: () => {
        const layer = makeDrumLayer('kick')
        if (layer.kind === 'drum')
          Object.assign(layer.params, { pitch: 60, sweep: 0.5, decay: 0.25, click: 0.7, drive: 0.4 })
        useLab.setState({
          mode: 'drum',
          name: 'Punchy kick',
          layers: [layer],
          selectedLayerId: layer.id,
          rendered: undefined,
        })
      },
    },
    {
      title: 'Turn it into an 808',
      where: 'lab',
      goTo: 'lab',
      body: [
        'Lower the pitch, raise the sweep and stretch the decay past a second. That long, pitched tail is the 808.',
      ],
      runLabel: 'Make it an 808',
      run: () => {
        const layer = makeDrumLayer('kick')
        if (layer.kind === 'drum')
          Object.assign(layer.params, { pitch: 45, sweep: 0.6, decay: 1.4, click: 0.3, drive: 0.5 })
        useLab.setState({ mode: 'drum', name: '808', layers: [layer], selectedLayerId: layer.id, rendered: undefined })
      },
    },
    {
      title: 'Layer a sound',
      where: 'lab',
      goTo: 'lab',
      body: [
        'Layer mode stacks sources. The demo layers a clap, a snare and a short synth blip into one hit. Each layer has its own level, tune and offset; Offset a layer by a few milliseconds for a flam.',
        'Then the Process column shapes the mix: EQ, drive, filter, compression and space.',
      ],
      runLabel: 'Build a layered snare',
      run: () => {
        const clap = makeDrumLayer('clap')
        const snare = makeDrumLayer('snare')
        const blip = makeSynthLayer()
        if (blip.kind === 'synth')
          Object.assign(blip, {
            pitch: 72,
            hold: 0.05,
            gain: 0.4,
            synth: { ...blip.synth, osc1: 'square', decay: 0.08, sustain: 0, release: 0.05 },
          })
        useLab.setState({
          mode: 'layer',
          name: 'Layered snare',
          layers: [snare, clap, blip],
          selectedLayerId: snare.id,
          rendered: undefined,
        })
      },
    },
    {
      title: 'Use it',
      where: 'lab',
      body: [
        'Send to puts the sound on the selected kit (or a new track). Save to library keeps it for every project. Then play it in the Jam room like any other pad.',
      ],
    },
  ],
}

export const TOOL_TUTORIALS: Tutorial[] = [pianoRoll, synth, mpc, lab]
