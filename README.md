# La La La La Studio

A local-first browser DAW. Everything runs client-side with Web Audio: drum sampler, pitched sampler, polyphonic synth, step sequencer, piano roll, audio recording, clip arrangement, buses and sends, automation, and WAV / MP3 / stem export. No backend, no uploads. `/jam` adds YouTube backing-video embeds and pad takes that drop straight into the arrangement.

## Run

Requires Node.js 22.12+ and a Chromium-based browser (tested). Serve on localhost or HTTPS; do not open through `file://`.

```sh
npm install
./dev.sh          # split terminal: FRONTEND (Vite) | BACKEND (typecheck + unit tests, watch mode)
./dev.sh --no-split   # same, interleaved in one terminal with [frontend] / [backend] prefixes
npm run dev       # plain Vite only
```

`dev.sh` uses tmux when installed (`brew install tmux`), otherwise opens two Terminal windows on macOS. The app is browser-only, so the "backend" pane runs the engine toolchain rather than a server. A click or key press unlocks the audio context.

## What it does

**Tracks.** Add as many as you like from the mixer: drum sampler (16 pads, auto-sliced), pitched sampler (one sample played chromatically from a root note), synthesizer (two oscillators, sub, noise, resonant filter, ADSR, unison, glide, presets), audio track (microphone / line-in recording), and bus (group or send return). Rename, recolor, reorder, remove.

**Patterns and step sequencer.** Patterns are 1 to 16 bars at sixteenth resolution in 2/4 through 7/4. Toggle steps, right-click or long-press for velocity and microtiming, record pad hits live. Melodic tracks trigger their root note from the grid.

**Arrangement.** Clips live on lanes along a zoomable bar ruler. Pattern clips loop their pattern for their length, MIDI clips hold notes for a track, audio clips play recordings, automation clips move a parameter. Drag to move, drag the right edge to resize, double-click a lane to drop the current pattern, shift-drag the ruler for a loop region, click the ruler to seek. Snap follows the zoom level.

**Piano roll.** Click to add notes, drag to move, drag the right edge to resize, alt-drag for velocity, double-click to delete. The on-screen keyboard and the computer keyboard (A-L white keys, W-P black keys, Z/X octave) play the selected keys or synth track and record into a MIDI clip at the playhead while recording in song mode. Web MIDI controllers work after clicking **MIDI**.

**Recording.** Select an audio track, **Arm**, press record, then play the song. A count-in of 0 to 2 bars runs first; the recording is trimmed so the clip starts exactly on the downbeat. Monitor toggles live input through the track. Clips can be trimmed, faded, gained, and pitched. Clips are not time-stretched.

**Mixing.** Each channel has a live meter, fader, pan, mute, solo, two insert toggles, sends to every bus, and an output selector (master or a bus). The rack holds any number of effects per track, pad, or master: filter, 3-band EQ, compressor (with sidechain from another track), delay, reverb, chorus, saturation, bitcrush, and limiter. The small **+** beside a knob creates an automation clip for it.

**Transport.** Tempo and swing change live without stopping. Metronome, loop, count-in, and 2/4–7/4 time signatures. The clock runs in an AudioWorklet, so playback continues when the tab is hidden.

**Projects.** Several projects live in IndexedDB; switch from the sidebar. New, duplicate, delete, import (JSON or ZIP bundle), and export. Unused audio is garbage-collected when a project is deleted. Saved projects from the original one-bar version migrate automatically.

**Export.** Render the song to WAV or MP3, export per-track stems as a ZIP of WAVs, export a project bundle (ZIP with project JSON plus every sample and recording) that re-imports anywhere, or export settings-only JSON. The app installs as a PWA and works offline after the first load.

Press **?** for the keyboard shortcut list.

## Jam room (MPC mode)

The Jam page is a complete MPC-style sampler workflow built around the 4x4 pads, with an optional YouTube backing video.

- **Pads.** Up to four banks (A–D, 64 pads) per kit. Strike low on a pad for full velocity, high for soft; **Full level** forces maximum. Pads show MUTE / REV badges. The computer keys `1234 qwer asdf zxcv` play the current bank; MIDI notes 36–51 do too.
- **16 levels.** Spread the selected pad across all 16 pads by velocity or by tune (-8 to +7 semitones).
- **Note repeat.** Choose 1/4, 1/8, 1/16 or 1/32 and hold a pad for tempo-synced rolls, recorded like any other hit.
- **Recording.** **Record take** starts a looping take (1, 2, 4 or 8 bars) with count-in and metronome options; hits overdub pass after pass. **Quantize** snaps to 1/4, 1/8 or 1/16, or **Off** keeps your timing as microtiming. **Undo last hit**, **Erase** mode (tap a pad to remove its steps), **Clear kit**, **Clear take**. **Tap** sets the tempo.
- **Pad mute** mode mutes a pad in playback while you keep hitting it live.
- **Sample.** Record your microphone straight into the kit (or a new kit): it is auto-chopped onto the pads. **Resample** renders the current take to a sample on a new kit for layering and re-chopping.
- **Chop.** Threshold chopping with a sensitivity slider, equal regions (4–32), or **Slice here** to turn the selected pad's IN point into a new slice. Pads have trim, gain, tune, pan, attack, release, loop, choke group, reverse, mute, a name, and their own effects.
- **Add to song** copies the take into an independent pattern clip at the end of the arrangement.

### YouTube

Paste a YouTube watch, share, Shorts, or live URL and **Load video**. YouTube audio is playback-only: it cannot be sampled, mixed, or exported.

## Architecture

```text
src/audio/     engine (shared live/offline step scheduler), graph (buses, sends, voices, meters,
               automation), effects, synth, clock (AudioWorklet ticker), recorder (worklet capture),
               midi, timing (lookahead scheduler with live tempo, seek, loop), slicing, wav
src/state/     types (schema v2), migrate (v0 -> v2), defaults, arrangement (clip math), automation,
               actions, mpc (pad modes, note repeat, sampling, resample), sampling (pad banks,
               chop assignment), store (Zustand + Immer patches), jam
src/db/        IndexedDB: multiple projects, audio blobs, garbage collection, import
src/export/    MP3 (lamejs in a worker), ZIP bundles (fflate)
src/components Timeline, PianoRoll, AudioClipEditor, AutomationEditor, SynthPanel, KeyboardPiano,
               StepSequencer, PadGrid, WaveformEditor, Mixer, EffectRack, Transport, JamPanel
tests/         Chromium Web Audio and UI integration tests
```

One `scheduleStep` function drives both live playback and offline rendering so exports match what you hear. Clip positions are in beats; steps are sixteenths. History stores Immer patches, bounded to 100 commands, and edits persist 500 ms after they stop.

## Tests

```sh
npm test            # unit: scheduler, migration, arrangement, automation, slicing, WAV, history, Jam
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e    # real Chromium audio and UI flows
npm run check       # lint + format check + unit + build
```

## Limits

- Audio clips follow tempo by position only; they are not time-stretched.
- Sidechain ducking is triggered by the source track's notes rather than by its audio level.
- Offline export is limited to 10 minutes of arrangement plus a tail.
- Chromium is tested. Safari and Firefox need manual checks for codec and worklet behavior.
- No collaboration or cloud sync; storage is the browser's IndexedDB, so keep bundle exports as backups.
