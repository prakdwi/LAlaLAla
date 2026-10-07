/**
 * Tooltip text for every knob. `tech` says what the control does in engineering terms; `plain`
 * says what you will hear. Keys are the knob label, optionally prefixed with a context
 * ("compressor:Attack") where the same label means different things in different places.
 */
export type KnobHelp = { tech: string; plain: string }

const HELP: Record<string, KnobHelp> = {
  // ---- pad / sampler ----
  Gain: {
    tech: 'Output level of this pad before the track fader, as a linear gain multiplier.',
    plain: 'How loud this pad is.',
  },
  Pitch: {
    tech: 'Playback-rate transposition in semitones; also changes duration.',
    plain: 'Makes the sound higher or lower, and faster or slower with it.',
  },
  'Pad pan': {
    tech: 'Stereo position of this pad (equal-power panner, −1 left to +1 right).',
    plain: 'Moves this sound to the left or right speaker.',
  },
  Attack: {
    tech: 'Amplitude envelope rise time from silence to full level.',
    plain: 'How quickly the sound fades in. Low is snappy, high is a soft swell.',
  },
  Release: {
    tech: 'Amplitude envelope fall time after the note ends or the region finishes.',
    plain: 'How long the sound takes to fade out at the end.',
  },
  Velocity: {
    tech: 'Note-on intensity scaling the hit’s amplitude (0–100%).',
    plain: 'How hard the note is hit. Lower is quieter and gentler.',
  },
  Microtiming: {
    tech: 'Offset of this step from the grid in milliseconds (negative is early).',
    plain: 'Nudges the hit slightly early or late to make it feel human.',
  },

  // ---- filter ----
  Cutoff: {
    tech: 'Filter corner frequency where attenuation begins.',
    plain: 'Low-pass: lower makes it darker and muffled. High-pass: higher makes it thinner.',
  },
  Resonance: {
    tech: 'Filter Q: gain boost and bandwidth narrowing around the cutoff.',
    plain: 'Adds a ringing, whistling edge right at the filter point.',
  },
  Reso: {
    tech: 'Filter Q: gain boost and bandwidth narrowing around the cutoff.',
    plain: 'Adds a ringing, whistling edge right at the filter point.',
  },

  // ---- EQ ----
  Low: { tech: 'Low-shelf gain below about 200 Hz, in dB.', plain: 'More or less bass and boom.' },
  Mid: {
    tech: 'Peaking-band gain around the mid frequency, in dB.',
    plain: 'More or less body and honk in the middle of the sound.',
  },
  'Mid freq': {
    tech: 'Centre frequency of the mid peaking band.',
    plain: 'Picks which part of the middle the Mid knob boosts or cuts.',
  },
  High: { tech: 'High-shelf gain above about 4 kHz, in dB.', plain: 'More or less sparkle, air and hiss.' },

  // ---- compressor / limiter ----
  Threshold: {
    tech: 'Level in dBFS above which gain reduction starts.',
    plain: 'How loud the sound must get before it is squashed. Lower squashes more.',
  },
  Thresh: {
    tech: 'Level in dBFS above which gain reduction starts.',
    plain: 'How loud the sound must get before it is squashed. Lower squashes more.',
  },
  Ratio: {
    tech: 'Input-to-output ratio above threshold (4:1 means 4 dB in gives 1 dB out).',
    plain: 'How hard the squash is. Higher is flatter and more controlled.',
  },
  Knee: {
    tech: 'Width in dB of the soft transition around the threshold.',
    plain: 'Makes the squashing kick in gently instead of all at once.',
  },
  'compressor:Attack': {
    tech: 'Time for gain reduction to engage after the signal crosses the threshold.',
    plain: 'Slow lets the punchy start of each hit through. Fast tames it.',
  },
  'compressor:Release': {
    tech: 'Time for gain reduction to recover once the signal falls below threshold.',
    plain: 'How quickly the volume comes back after a squash. Fast pumps.',
  },

  // ---- time / modulation ----
  Feedback: {
    tech: 'Proportion of the delayed signal fed back into the delay line.',
    plain: 'How many times the echo repeats.',
  },
  'Dry / wet': {
    tech: 'Crossfade between the unprocessed and processed signal.',
    plain: 'How much of the effect you hear compared with the original sound.',
  },
  Mix: {
    tech: 'Crossfade between the unprocessed and processed signal.',
    plain: 'How much of the effect you hear compared with the original sound.',
  },
  Rate: { tech: 'LFO frequency modulating the chorus delay time, in Hz.', plain: 'How fast the wobble moves.' },
  Depth: {
    tech: 'LFO modulation amount applied to the chorus delay time.',
    plain: 'How strong the wobble and shimmer are.',
  },
  Drive: {
    tech: 'Input gain into a tanh waveshaper (soft clipping).',
    plain: 'Adds warmth and grit. High values sound crunchy and distorted.',
  },

  // ---- synth ----
  'Osc 2 detune': {
    tech: 'Pitch offset of oscillator 2 relative to oscillator 1, in semitones.',
    plain: 'Small amounts thicken the sound. 12 adds an octave, 7 adds a fifth.',
  },
  'Osc 2 level': { tech: 'Mix level of oscillator 2.', plain: 'How much of the second tone you hear.' },
  Sub: {
    tech: 'Level of a sine sub-oscillator one octave below the played note.',
    plain: 'Adds deep low end underneath.',
  },
  Noise: {
    tech: 'Level of the white-noise source mixed into the voice.',
    plain: 'Adds breath, hiss or a snare-like rattle.',
  },
  Unison: {
    tech: 'Number of stacked, detuned copies of each oscillator per voice.',
    plain: 'Makes one note sound like several players. Bigger and wider.',
  },
  Spread: {
    tech: 'Detune spread across unison voices, in cents.',
    plain: 'How out of tune the stacked copies are. More is lusher and chorused.',
  },
  'Env amount': {
    tech: 'Depth of the envelope’s sweep on the filter cutoff.',
    plain: 'How much each note opens up bright then closes down. The “wow” on each hit.',
  },
  Glide: {
    tech: 'Portamento time for pitch to slide between consecutive notes.',
    plain: 'Notes slide into each other instead of jumping, like an 808 slide.',
  },
  Decay: {
    tech: 'Envelope fall time from peak to the sustain level.',
    plain: 'How fast the sound drops after the initial hit.',
  },
  Sustain: {
    tech: 'Envelope level held while a note is held down (0–1).',
    plain: 'How loud the note stays while you keep holding the key.',
  },

  // ---- drum synth (Sound Lab) ----
  'drum:Pitch': {
    tech: 'Starting frequency of the drum body oscillator.',
    plain: 'Low is a deep boom, high is a tight knock.',
  },
  Sweep: {
    tech: 'Amount of exponential pitch drop at the start of the hit.',
    plain: 'Makes the drum “pew” downward. Big values give a punchy 808 thump.',
  },
  'drum:Decay': {
    tech: 'Exponential decay time of the body oscillator.',
    plain: 'How long the drum rings. Long gives a boomy 808 tail.',
  },
  Click: {
    tech: 'Level of the short transient at the very start of the hit.',
    plain: 'Adds a sharp attack so the drum cuts through the mix.',
  },
  'drum:Drive': {
    tech: 'Soft-clip saturation applied to the rendered hit.',
    plain: 'Makes the drum fatter, louder and more aggressive.',
  },
  'drum:Noise': {
    tech: 'Level of the filtered noise layer.',
    plain: 'Adds rattle and sizzle, like snare wires or a hat.',
  },
  'Noise decay': { tech: 'Decay time of the noise layer’s envelope.', plain: 'How long the sizzle lasts.' },
  Tone: {
    tech: 'Low-pass cutoff applied to the noise layer.',
    plain: 'Lower is darker and dustier, higher is brighter and crispier.',
  },
  Character: {
    tech: 'Hats: metallic partial density and pitch. Claps: spacing of the flam.',
    plain: 'Hats get more metallic and clangy. Claps sound like more hands.',
  },

  // ---- Sound Lab layers & finishing ----
  Level: { tech: 'Gain of this layer into the processing chain.', plain: 'How loud this layer is in the final sound.' },
  Tune: { tech: 'Transposition of this layer in semitones.', plain: 'Makes this layer higher or lower in pitch.' },
  Offset: {
    tech: 'Start delay of this layer relative to the others, in milliseconds.',
    plain: 'Starts this layer slightly later. Good for flams and layered hits.',
  },
  Note: { tech: 'MIDI note the synth layer plays when rendered.', plain: 'Which note the synth layer plays.' },
  Hold: {
    tech: 'Gate time before the synth layer’s release stage begins.',
    plain: 'How long the synth note is held before it fades.',
  },
  Start: {
    tech: 'Region start point within the source sample, in seconds.',
    plain: 'Where in the recording this layer begins.',
  },
  End: {
    tech: 'Region end point within the source sample, in seconds.',
    plain: 'Where in the recording this layer stops.',
  },
  Tail: {
    tech: 'Extra render time after the last layer, for reverb and delay decay.',
    plain: 'Leaves room for echoes to ring out instead of cutting off.',
  },
  'Fade out': {
    tech: 'Linear gain ramp to silence at the end of the region.',
    plain: 'Smoothly fades the end so it does not click.',
  },
  'Fade in': {
    tech: 'Linear gain ramp up from silence at the start of the region.',
    plain: 'Smoothly fades the start in, softening the attack.',
  },

  // ---- audio clips ----
  'Clip gain': { tech: 'Gain applied to this clip before the track’s effects.', plain: 'How loud this recording is.' },
  'clip:Offset': {
    tech: 'Read position inside the source recording where the clip starts, in seconds.',
    plain: 'Skips into the recording, so the clip starts later in the take.',
  },
  'clip:Pitch': {
    tech: 'Playback-rate transposition in semitones (not time-stretched).',
    plain: 'Higher or lower, and the recording speeds up or slows down with it.',
  },
}

export function knobHelp(label: string, context?: string): KnobHelp | undefined {
  return (context && HELP[`${context}:${label}`]) || HELP[label]
}

/** Exposed for tests: every label that has help. */
export const KNOB_HELP_KEYS = Object.keys(HELP)
