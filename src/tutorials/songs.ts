/**
 * Three style studies. Each one teaches how a well-known record is built (tempo, feel, sound
 * choices, arrangement) and recreates that approach with ORIGINAL patterns, chords and sounds.
 * Nothing here transcribes the actual songs' melodies, samples or lyrics.
 */
import { addEffect, addSynth, arrange, kitIdFor, program, setMix, startProject, writeNotes, type Hit } from './build'

export type TutorialStep = {
  title: string
  where: 'studio' | 'jam' | 'lab'
  body: string[]
  tip?: string
  /** performs the step in the app; absent for steps the learner does by hand */
  run?: () => Promise<void> | void
  runLabel?: string
}

export type Tutorial = {
  id: string
  song: string
  artist: string
  projectName: string
  tempo: string
  feel: string
  key: string
  summary: string
  listenFor: string[]
  steps: TutorialStep[]
}

const every = (start: number, step: number, end: number) =>
  Array.from({ length: Math.ceil((end - start) / step) }, (_, i) => start + i * step)

// ---------------------------------------------------------------------------------------------
const NIAGARA = 'Niagara-style beat'
const niagara: Tutorial = {
  id: 'niagara-falls',
  song: 'Niagara Falls (Foot or 2)',
  artist: 'Travis Scott',
  projectName: NIAGARA,
  tempo: '150 BPM, played half-time (feels like 75)',
  feel: 'Dark, spacious trap: booming 808s, rolling hats, a haunting melody drenched in reverb',
  key: 'F minor (our original progression)',
  summary:
    'This style lives on contrast: a sparse, eerie melody floating in reverb over drums that hit hard and leave space. The snare or clap lands on beat 3 of each bar, which makes a fast tempo feel slow and heavy. The 808 is both the kick and the bassline.',
  listenFor: [
    'How empty the space is between drum hits, and how long the reverb tails are.',
    'Hi-hats that switch between steady eighths and fast rolls at the end of phrases.',
    'The 808 sliding between notes instead of jumping.',
  ],
  steps: [
    {
      title: 'Start the project and build an 808 kit',
      where: 'lab',
      body: [
        'Trap kits are mostly synthesized. Here we make a long, booming 808 kick, a clap, a crisp snare, closed and open hats and a percussion tick, all with the Sound Lab drum synth.',
        'Open the Sound Lab and try it yourself: pick Kick, drop Pitch to about 45 Hz, raise Sweep and stretch Decay past a second. That long tail is the 808 sound.',
      ],
      tip: 'Set the tempo to 150 and think in half-time: the backbeat moves to beat 3.',
      runLabel: 'Create project + kit',
      run: () =>
        startProject({
          name: NIAGARA,
          bpm: 150,
          swing: 0,
          kitName: 'Trap kit',
          patternName: 'Drop',
          bars: 2,
          sounds: [
            { name: '808 kick', kind: 'kick', params: { pitch: 46, sweep: 0.55, decay: 1.3, click: 0.35, drive: 0.5 } },
            { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.2, tone: 3500 } },
            { name: 'Snare', kind: 'snare', params: { pitch: 210, noiseDecay: 0.15, tone: 8000 } },
            { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.045 } },
            { name: 'Open hat', kind: 'hat', params: { decay: 0.2, noiseDecay: 0.3 } },
            { name: 'Tick', kind: 'perc', params: { pitch: 1400, decay: 0.05 } },
          ],
        }),
    },
    {
      title: 'Program the half-time drums',
      where: 'studio',
      body: [
        'Clap and snare together on step 9 of each bar (beat 3). Kicks are syncopated and leave gaps for the 808 tail. Open hats sit just before the backbeat.',
        'Look at the step sequencer after running this step: two bars, 32 steps.',
      ],
      runLabel: 'Program drums',
      run: () => {
        program(NIAGARA, 'Drop', 'Trap kit', 0, [0, 7, 10, 16, 19, 26])
        program(NIAGARA, 'Drop', 'Trap kit', 1, [8, 24])
        program(NIAGARA, 'Drop', 'Trap kit', 2, [
          { step: 8, velocity: 0.5 },
          { step: 24, velocity: 0.5 },
        ])
        program(NIAGARA, 'Drop', 'Trap kit', 4, [6, 22])
        program(NIAGARA, 'Drop', 'Trap kit', 5, [
          { step: 13, velocity: 0.5 },
          { step: 29, velocity: 0.6 },
        ])
      },
    },
    {
      title: 'Rolling hi-hats',
      where: 'jam',
      body: [
        'Steady eighth-note hats with sixteenth bursts at the end of each phrase, and velocity rising into the roll.',
        'Then do it by hand: open the Jam room, select the kit, set Repeat to 1/32 and hold the Hat pad over the last beat of a take. That is how trap rolls are performed.',
      ],
      runLabel: 'Program hats',
      run: () => {
        const hats: Hit[] = [
          ...every(0, 2, 12).map(step => ({ step, velocity: step % 4 ? 0.55 : 0.8 })),
          { step: 12, velocity: 0.7 },
          { step: 13, velocity: 0.5 },
          { step: 14, velocity: 0.65 },
          { step: 15, velocity: 0.8 },
          ...every(16, 2, 28).map(step => ({ step, velocity: step % 4 ? 0.55 : 0.8 })),
          { step: 28, velocity: 0.5 },
          { step: 29, velocity: 0.6 },
          { step: 30, velocity: 0.75 },
          { step: 31, velocity: 0.95 },
        ]
        program(NIAGARA, 'Drop', 'Trap kit', 3, hats, 'Program hats')
      },
    },
    {
      title: 'The haunting melody',
      where: 'lab',
      body: [
        'A bell-like synth: triangle wave plus a sine an octave up, a short decay so each note pings, and a long release so it rings out.',
        'The line arpeggiates an F minor chord, then a D-flat major chord. These are our own notes; edit them in the Jam piano roll to make it yours.',
      ],
      tip: 'Design your own bell in the Sound Lab under Synth patch, save it, and load it from the Library.',
      runLabel: 'Add bell melody',
      run: () => {
        addSynth(
          NIAGARA,
          'Bell',
          {
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
          0.55,
        )
        writeNotes(NIAGARA, 'Drop', 'Bell', [
          [65, 0, 0.5],
          [68, 0.5, 0.5],
          [72, 1, 0.5],
          [68, 1.5, 0.5],
          [75, 2, 1],
          [72, 3, 1],
          [61, 4, 0.5],
          [65, 4.5, 0.5],
          [68, 5, 0.5],
          [65, 5.5, 0.5],
          [72, 6, 1.5],
          [70, 7.5, 0.5],
        ])
        addEffect(NIAGARA, 'Bell', 'reverb', { mix: 0.55 })
        addEffect(NIAGARA, 'Bell', 'delay', { division: 0.75, feedback: 0.4, mix: 0.25 })
      },
    },
    {
      title: 'A dark pad underneath',
      where: 'studio',
      body: [
        'Held chords with a slow attack fill the space without fighting the melody. Keep it quiet and low-passed.',
      ],
      runLabel: 'Add pad',
      run: () => {
        addSynth(
          NIAGARA,
          'Pad',
          {
            osc1: 'sawtooth',
            osc2: 'sawtooth',
            osc2Detune: 0.12,
            osc2Level: 0.8,
            cutoff: 900,
            resonance: 0.6,
            envAmount: 0.1,
            attack: 0.8,
            decay: 1,
            sustain: 0.8,
            release: 1.5,
            unison: 3,
            spread: 0.6,
          },
          0.35,
        )
        writeNotes(NIAGARA, 'Drop', 'Pad', [
          [53, 0, 4, 0.6],
          [56, 0, 4, 0.6],
          [60, 0, 4, 0.6],
          [49, 4, 4, 0.6],
          [53, 4, 4, 0.6],
          [56, 4, 4, 0.6],
        ])
        addEffect(NIAGARA, 'Pad', 'reverb', { mix: 0.5 })
      },
    },
    {
      title: 'The gliding 808 bassline',
      where: 'studio',
      body: [
        'The kick pad gives the punch; a sine synth with glide gives the 808 its pitch. Notes follow the kick rhythm and slide into each other.',
        'Glide only happens between overlapping notes on a mono line, so the lengths here touch.',
      ],
      runLabel: 'Add 808 bass',
      run: () => {
        addSynth(
          NIAGARA,
          '808',
          {
            osc1: 'sine',
            osc2Level: 0,
            subLevel: 0.6,
            noiseLevel: 0,
            cutoff: 1200,
            resonance: 0.5,
            envAmount: 0.1,
            attack: 0.003,
            decay: 1.2,
            sustain: 0.6,
            release: 0.25,
            glide: 0.07,
            unison: 1,
          },
          0.8,
        )
        writeNotes(NIAGARA, 'Drop', '808', [
          [41, 0, 1.75, 1],
          [41, 1.75, 0.75, 0.9],
          [44, 2.5, 1.5, 1],
          [37, 4, 0.75, 1],
          [37, 4.75, 1.75, 0.9],
          [39, 6.5, 1.5, 1],
        ])
        addEffect(NIAGARA, '808', 'saturation', { drive: 0.4, mix: 0.5 })
      },
    },
    {
      title: 'Bring in the original and match it',
      where: 'jam',
      body: [
        'Paste the official link into "Play along with the original" above. In the Jam room, play it and tap the tempo along with the record until the click lines up.',
        'Connect tab audio, set IN and OUT around a few seconds of the melody, and press Sample IN → OUT. Chop it with Threshold and play the chops against our drums. Swap our Bell for your chop when it sits right.',
      ],
      tip: 'Match by ear first: hum the bass note of the original and pitch the 808 pad until it agrees.',
    },
    {
      title: 'Arrange: intro, drop, break, drop',
      where: 'studio',
      body: [
        'The intro is only the melody and pad, so the drums hit harder when they arrive. The break drops the kick and 808 for two bars of tension.',
        'This creates section patterns from the main one and lays them out on the arrangement timeline.',
      ],
      runLabel: 'Arrange song',
      run: () =>
        arrange(NIAGARA, 'Drop', [
          { name: 'Intro', keep: ['Bell', 'Pad'], repeats: 2 },
          { name: 'Drop', keep: 'all', repeats: 4 },
          { name: 'Break', keep: ['Bell', 'Pad', 'Trap kit'], repeats: 1 },
          { name: 'Drop', keep: 'all', repeats: 4 },
        ]),
    },
    {
      title: 'Make it yours, then export',
      where: 'jam',
      body: [
        'Press Play song in the Studio. Then open the Jam room, pick the Bell track, record a new take over the beat and change the melody. Try muting the 808 with Pad mute while you play.',
        'When it feels right: Export, then Render song as WAV or MP3.',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------------------------
const SKY = 'Touch-the-Sky-style beat'
const touchTheSky: Tutorial = {
  id: 'touch-the-sky',
  song: 'Touch the Sky',
  artist: 'Kanye West',
  projectName: SKY,
  tempo: 'About 100 BPM with a light swing',
  feel: 'Triumphant soul: a sped-up horn sample, live-sounding funk drums, big and bright',
  key: 'D major (our original stabs)',
  summary:
    'The record is built on a classic soul sample, sped up so it sounds brighter and more urgent, with hard drums under it. The skill to learn is the chop: take a few seconds of a soul or funk record, cut it into hits, pitch it up, and replay it on pads. We build an original horn section to practise on, and show how to sample your own records.',
  listenFor: [
    'The horn stabs answering each other, and how the rhythm of the chop drives the song.',
    'Ghost notes on the snare (quiet hits between the loud ones) that make the drums feel played.',
    'The sample sounds slightly fast and high: that is the pitched-up soul sound.',
  ],
  steps: [
    {
      title: 'Start the project and build a funk kit',
      where: 'lab',
      body: [
        'A punchy kick, a fat snare with plenty of noise, a closed hat and a tambourine, all synthesized so you have something to practise on straight away.',
      ],
      runLabel: 'Create project + kit',
      run: () =>
        startProject({
          name: SKY,
          bpm: 100,
          swing: 0.1,
          kitName: 'Funk kit',
          patternName: 'Hook',
          bars: 2,
          sounds: [
            { name: 'Kick', kind: 'kick', params: { pitch: 62, sweep: 0.5, decay: 0.3, click: 0.6, drive: 0.3 } },
            { name: 'Snare', kind: 'snare', params: { pitch: 200, noise: 0.9, noiseDecay: 0.2, drive: 0.3 } },
            { name: 'Hat', kind: 'hat', params: { decay: 0.035, noiseDecay: 0.05 } },
            { name: 'Tambourine', kind: 'hat', params: { pitch: 900, character: 0.3, decay: 0.07, noiseDecay: 0.12 } },
            { name: 'Clap', kind: 'clap' },
          ],
        }),
    },
    {
      title: 'Sample a soul record (the real technique)',
      where: 'jam',
      body: [
        'Find a soul or funk record you have the right to use. In the Jam room, paste its YouTube link, click Connect tab audio, set IN and OUT around a bright horn or vocal phrase of 2 to 4 seconds, and press Sample IN → OUT.',
        'Then Chop with Threshold, or Equal regions at 8, and tune the pads up 2 or 3 semitones for the sped-up soul sound. Play the chops on pads 1 to 8 over the drums.',
        'No record handy? The next step builds an original horn part to practise the same idea.',
      ],
      tip: 'Clear samples before releasing anything. For practice and learning, anything you own is fair game.',
    },
    {
      title: 'Original horn stabs',
      where: 'lab',
      body: [
        'A brassy synth: two detuned saws, a filter envelope that opens on each note, three-voice unison. Short stabs on D, G, A and B minor give the triumphant lift.',
      ],
      runLabel: 'Add horns',
      run: () => {
        addSynth(
          SKY,
          'Horns',
          {
            osc1: 'sawtooth',
            osc2: 'sawtooth',
            osc2Detune: 0.1,
            osc2Level: 0.8,
            subLevel: 0,
            cutoff: 1300,
            resonance: 1,
            envAmount: 0.7,
            attack: 0.02,
            decay: 0.25,
            sustain: 0.45,
            release: 0.25,
            unison: 3,
            spread: 0.3,
          },
          0.6,
        )
        writeNotes(SKY, 'Hook', 'Horns', [
          [62, 0, 0.5],
          [66, 0, 0.5],
          [69, 0, 0.5],
          [62, 1.5, 0.25],
          [66, 1.5, 0.25],
          [69, 1.5, 0.25],
          [62, 2, 1],
          [66, 2, 1],
          [69, 2, 1],
          [67, 4, 0.5],
          [71, 4, 0.5],
          [74, 4, 0.5],
          [64, 5.5, 0.25],
          [69, 5.5, 0.25],
          [73, 5.5, 0.25],
          [62, 6, 1.5],
          [66, 6, 1.5],
          [71, 6, 1.5],
        ])
        addEffect(SKY, 'Horns', 'reverb', { mix: 0.25 })
      },
    },
    {
      title: 'Funk drums with ghost notes',
      where: 'studio',
      body: [
        'Backbeat snares on 2 and 4 at full velocity, with ghost snares at about a third of the level in between. Tambourine doubles the backbeat. Right-click a step in the sequencer to see its velocity.',
      ],
      runLabel: 'Program drums',
      run: () => {
        program(SKY, 'Hook', 'Funk kit', 0, [0, 3, 8, 10, 16, 19, 22, 24])
        program(SKY, 'Hook', 'Funk kit', 1, [
          4,
          12,
          20,
          28,
          { step: 7, velocity: 0.3 },
          { step: 15, velocity: 0.35 },
          { step: 23, velocity: 0.3 },
          { step: 30, velocity: 0.4 },
        ])
        program(
          SKY,
          'Hook',
          'Funk kit',
          2,
          every(0, 2, 32).map(step => ({ step, velocity: step % 4 ? 0.5 : 0.75 })),
        )
        program(
          SKY,
          'Hook',
          'Funk kit',
          3,
          [4, 12, 20, 28].map(step => ({ step, velocity: 0.6 })),
        )
      },
    },
    {
      title: 'A bouncing bassline',
      where: 'studio',
      body: ['A plucky square-and-saw bass follows the chord roots and anticipates the changes by a sixteenth.'],
      runLabel: 'Add bass',
      run: () => {
        addSynth(
          SKY,
          'Bass',
          {
            osc1: 'square',
            osc2: 'sawtooth',
            osc2Detune: -12,
            osc2Level: 0.5,
            subLevel: 0.6,
            cutoff: 420,
            resonance: 2.5,
            envAmount: 0.5,
            attack: 0.003,
            decay: 0.2,
            sustain: 0.3,
            release: 0.12,
            unison: 1,
          },
          0.7,
        )
        writeNotes(SKY, 'Hook', 'Bass', [
          [38, 0, 0.75],
          [38, 0.75, 0.25],
          [38, 1.5, 0.5],
          [45, 2.5, 0.5],
          [38, 3, 0.75],
          [43, 4, 0.75],
          [43, 4.75, 0.5],
          [45, 5.5, 0.5],
          [47, 6, 1.25],
          [45, 7.5, 0.5],
        ])
      },
    },
    {
      title: 'Glue it together',
      where: 'studio',
      body: [
        'Saturation on the drums makes them sound like a record. A compressor on the bass with sidechain from the kit ducks the bass each time the kick and snare hit, so the low end stays clean.',
      ],
      runLabel: 'Add mix processing',
      run: () => {
        addEffect(SKY, 'Funk kit', 'saturation', { drive: 0.35, mix: 0.6 })
        addEffect(SKY, 'Bass', 'compressor', {
          threshold: -24,
          ratio: 4,
          attack: 0.005,
          release: 0.15,
          sidechainTrackId: kitIdFor(SKY, 'Funk kit'),
        })
        setMix(SKY, 'Horns', 0.6, 0.1)
      },
    },
    {
      title: 'Arrange: intro, verse, hook',
      where: 'studio',
      body: ['Horns alone for the intro, drums and bass for the verses so a rapper has room, everything for the hook.'],
      runLabel: 'Arrange song',
      run: () =>
        arrange(SKY, 'Hook', [
          { name: 'Intro', keep: ['Horns'], repeats: 2 },
          { name: 'Verse', keep: ['Funk kit', 'Bass'], repeats: 4 },
          { name: 'Hook', keep: 'all', repeats: 2 },
          { name: 'Verse', keep: ['Funk kit', 'Bass'], repeats: 4 },
          { name: 'Hook', keep: 'all', repeats: 4 },
        ]),
    },
    {
      title: 'Replace the horns with your chop',
      where: 'jam',
      body: [
        'Once you have sampled your own record in step 2, record a take of your chops in the Jam room over the drums, then Add to song. Mute the Horns track in the mixer and your sample becomes the hook.',
        'Export the song as WAV or MP3 when you are happy.',
      ],
    },
  ],
}

// ---------------------------------------------------------------------------------------------
const DUST = '1985-style beat'
const nineteen85: Tutorial = {
  id: '1985',
  song: '1985',
  artist: 'Freddie Gibbs & Madlib',
  projectName: DUST,
  tempo: 'About 88 BPM with heavy swing',
  feel: 'Dusty, loop-based boom bap: a warm, slightly woozy keys loop and loose drums',
  key: 'D minor (our original vamp)',
  summary:
    'Madlib-style production is about the loop and the feel. A short musical phrase repeats with little change, drums are played loosely rather than locked to a grid, and everything is a bit dirty: filtered, saturated, crushed. Arrangement is done by taking elements away and bringing them back.',
  listenFor: [
    'How the snare sits a hair late, behind the beat.',
    'The loop never changes much, yet it never feels static.',
    'Tape-like grit: the highs are rolled off and the drums are crunchy.',
  ],
  steps: [
    {
      title: 'Start the project and build a dusty kit',
      where: 'lab',
      body: [
        'A round kick with drive, a snappy snare with the top end rolled off, a short hat and a rim click. Turn the Tone knob down in the Lab drum synth for that dusty sound.',
      ],
      tip: 'Swing at 40% pushes every second sixteenth late. That is most of the boom-bap bounce.',
      runLabel: 'Create project + kit',
      run: () =>
        startProject({
          name: DUST,
          bpm: 88,
          swing: 0.4,
          kitName: 'Dusty kit',
          patternName: 'Beat',
          bars: 2,
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
            { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.05, tone: 6000 } },
            { name: 'Rim', kind: 'perc', params: { pitch: 1200, decay: 0.04, click: 0.8 } },
          ],
        }),
    },
    {
      title: 'Find a loop (sample or play one)',
      where: 'jam',
      body: [
        'The classic way: dig through records, find two bars of keys or strings you love, and sample them with Connect tab audio and Sample IN → OUT in the Jam room. Do not chop it. Let it loop.',
        'The next step plays an original electric-piano loop so you can follow along without a record.',
      ],
    },
    {
      title: 'Original keys loop',
      where: 'lab',
      body: [
        'A soft electric-piano tone: sine plus a quiet triangle an octave up, gentle decay, chorus for the wobble. The vamp moves between D minor 9 and G minor 9.',
      ],
      runLabel: 'Add keys loop',
      run: () => {
        addSynth(
          DUST,
          'Keys loop',
          {
            osc1: 'sine',
            osc2: 'triangle',
            osc2Detune: 12,
            osc2Level: 0.3,
            subLevel: 0,
            cutoff: 2200,
            resonance: 0.4,
            envAmount: 0.2,
            attack: 0.01,
            decay: 1.2,
            sustain: 0.35,
            release: 0.8,
            unison: 1,
          },
          0.6,
        )
        writeNotes(DUST, 'Beat', 'Keys loop', [
          [50, 0, 3.5, 0.7],
          [53, 0, 3.5, 0.6],
          [57, 0, 3.5, 0.6],
          [60, 0.02, 3.5, 0.55],
          [64, 0.04, 3.5, 0.5],
          [65, 3, 0.5, 0.5],
          [64, 3.5, 0.5, 0.5],
          [43, 4, 3.5, 0.7],
          [58, 4, 3.5, 0.6],
          [62, 4, 3.5, 0.6],
          [65, 4.02, 3.5, 0.55],
          [69, 4.04, 3.5, 0.5],
          [67, 7, 0.5, 0.5],
          [65, 7.5, 0.5, 0.5],
        ])
        addEffect(DUST, 'Keys loop', 'chorus', { rate: 0.6, depth: 0.005, mix: 0.5 })
        addEffect(DUST, 'Keys loop', 'filter', { mode: 'lowpass', cutoff: 3500, q: 0.7 })
      },
    },
    {
      title: 'Loose, laid-back drums',
      where: 'studio',
      body: [
        'Kicks wander around the beat and the snare is late by about 15 ms. Microtiming does that: right-click any step to see it.',
        'Better still, play it: Jam room, Quantize Off, record the drums by hand. The imperfection is the point.',
      ],
      runLabel: 'Program drums',
      run: () => {
        program(DUST, 'Beat', 'Dusty kit', 0, [
          0,
          { step: 5, micro: 12 },
          10,
          16,
          { step: 21, micro: -8 },
          26,
          { step: 27, velocity: 0.5 },
        ])
        program(
          DUST,
          'Beat',
          'Dusty kit',
          1,
          [4, 12, 20, 28].map(step => ({ step, micro: 15 })),
        )
        program(
          DUST,
          'Beat',
          'Dusty kit',
          2,
          every(0, 2, 32).map((step, index) => ({
            step,
            velocity: [0.7, 0.45, 0.6, 0.4][index % 4],
            micro: [0, 6, -4, 8][index % 4],
          })),
        )
        program(DUST, 'Beat', 'Dusty kit', 3, [
          { step: 14, velocity: 0.6 },
          { step: 31, velocity: 0.5 },
        ])
      },
    },
    {
      title: 'Add the dust',
      where: 'studio',
      body: [
        'Saturation and a little bitcrush on the drums, a low-pass at 6 kHz to roll off the shine. Subtle is better: you should feel it more than hear it.',
      ],
      runLabel: 'Add grit',
      run: () => {
        addEffect(DUST, 'Dusty kit', 'saturation', { drive: 0.5, mix: 0.6 })
        addEffect(DUST, 'Dusty kit', 'bitcrush', { mix: 0.2 })
        addEffect(DUST, 'Dusty kit', 'filter', { mode: 'lowpass', cutoff: 6000, q: 0.5 })
      },
    },
    {
      title: 'A simple bassline',
      where: 'studio',
      body: [
        'A warm sine bass doubling the roots, mostly long notes. In this style the bass supports the loop and stays out of the way.',
      ],
      runLabel: 'Add bass',
      run: () => {
        addSynth(
          DUST,
          'Bass',
          {
            osc1: 'sine',
            osc2: 'triangle',
            osc2Level: 0.2,
            subLevel: 0.4,
            cutoff: 700,
            resonance: 0.5,
            envAmount: 0.1,
            attack: 0.01,
            decay: 0.6,
            sustain: 0.6,
            release: 0.2,
          },
          0.7,
        )
        writeNotes(DUST, 'Beat', 'Bass', [
          [38, 0, 1.5],
          [38, 2.5, 0.5],
          [45, 3, 1],
          [43, 4, 2],
          [41, 6.5, 1],
        ])
      },
    },
    {
      title: 'Loop the original the Madlib way',
      where: 'jam',
      body: [
        'Paste the official link into "Play along with the original" above and tap the tempo along with it. Sample two bars with Sample IN → OUT and keep them as one long pad: no chopping, just a loop.',
        'Trigger the loop pad on step 1 of each bar, set Quantize Off, and play our dusty drums over it by hand.',
      ],
    },
    {
      title: 'Arrange by subtraction',
      where: 'studio',
      body: [
        'Open on the loop alone, bring in the beat, then a "switch" section that drops the kick and bass, so only the loop, hats and rims remain. Bring everything back and end on the loop.',
      ],
      runLabel: 'Arrange song',
      run: () =>
        arrange(DUST, 'Beat', [
          { name: 'Loop', keep: ['Keys loop'], repeats: 2 },
          { name: 'Beat', keep: 'all', repeats: 4 },
          { name: 'Switch', keep: ['Keys loop', 'Dusty kit'], repeats: 2 },
          { name: 'Beat', keep: 'all', repeats: 4 },
          { name: 'Loop', keep: ['Keys loop'], repeats: 1 },
        ]),
    },
    {
      title: 'Play it in, then export',
      where: 'jam',
      body: [
        'Open the Jam room, set Quantize Off and record your own hat pattern over the loop. Keep the takes that feel good and Add to song.',
        'Export the song as WAV or MP3. For the full Madlib move, Resample the beat onto a new kit and chop your own beat again.',
      ],
    },
  ],
}

export const TUTORIALS: Tutorial[] = [niagara, touchTheSky, nineteen85]
