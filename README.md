# La La La La Studio

A client-side polyphonic sampler, 16-step sequencer, and song arranger built with React, TypeScript, Vite, and Web Audio. No backend or audio uploads to a server. `/jam` adds YouTube backing-video embeds and pad takes that can be transferred into the Studio arrangement.

## Run

Requires Node.js 22.12+ and a modern browser with Web Audio and IndexedDB support. Chromium is the tested browser. Serve on localhost or HTTPS; do not open the app directly through `file://`.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The app starts with four locally synthesized sounds and a playable pattern. A click or key press unlocks the browser's audio context.

## Studio Workflow

- Select a track in the sidebar, sequencer, or mixer. Load an audio file through **Load sample**, or drop it onto the sample editor. Loading replaces that track's sample and creates up to 16 onset regions. If fewer regions are found, remaining pads repeat those regions.
- Play pads with pointer/touch or `1234`, `qwer`, `asdf`, `zxcv`. Selecting a pad opens its trim, gain, pitch, pan, envelope, loop, and choke controls. Drag either waveform marker; use zoom and scroll for long files.
- Toggle steps by clicking. Right-click or long-press a step to edit velocity and microtiming. Each track has a default sequencer pad; recorded steps can override it. Patterns are one bar of 16 sixteenth notes.
- **Play** loops the selected pattern. Space toggles playback. **Record** records pad hits into the nearest step while the pattern plays; it does not record a microphone. One note per track per step is retained.
- Mixer faders, pan, mute, solo, and insert buttons affect live and exported audio. The rack supports track or selected-pad inserts. Filter, tempo-synced delay, generated-impulse reverb, and a five-bit WaveShaper approximation are implemented.
- Duplicate or create patterns, add sections, choose their pattern and repeat count, and drag sections to reorder. Arrow buttons provide an accessible/mobile reorder alternative. **Play song** plays the finite arrangement.
- **Export** downloads either the arranged song as stereo 16-bit PCM WAV or project metadata as JSON. Audio is not embedded in JSON. WAV exports include an eight-second effect tail.
- `Ctrl+Z` / `Ctrl+Shift+Z` (or Command on macOS) undo/redo project commands outside text inputs. Text inputs retain native editing shortcuts. Toolbar buttons always undo/redo project edits.

## YouTube Jam

1. Open **Jam** and paste a YouTube watch, share, Shorts, or live-video URL. Click **Load video**, then use the embedded player's own playback controls. Start timestamps in shared URLs are supported. Video playback requires network access and permission from the video owner to embed it; **Open on YouTube** is available as a fallback.
2. Set your pad tempo, select a track, and use **Record take**. The first recording creates a blank Jam pattern rather than overwriting the starter pattern. Play pads with the keyboard or pointer. Recording loops over a 16-step bar; subsequent passes overdub that bar, retaining one note per track per step. Use **New take** for another pattern, and edit recorded notes in the sequencer below.
3. Stop the recording, enter a section name and repeat count, then click **Add to song**. This adds an independent pattern copy and an arrangement section in one undoable command. Further step edits to the Jam source do not change the copied pattern; both still use the project's shared tracks, pads, samples, and effects.
4. Open Studio to rearrange the section or render it to WAV. The YouTube source reference, last Jam pattern, recorded patterns, and transferred sections are persisted with the project. Internal Studio/Jam navigation does not reload the session.

**YouTube audio is playback-only.** The official embed does not expose decoded audio to Web Audio, so this app cannot sample, capture, mix, or include YouTube audio in WAV exports. Video playback and the pad scheduler are independent, not sample-accurately synchronized; Stop stops the pad engine, not the embedded video. Recorded pad notes and local uploaded samples are included in the arranged song. To use backing audio in an export, load an audio file you have the right to use into a sample track and sequence it. YouTube audio extraction and downloads are not implemented.

## Architecture

```text
src/audio/       Shared context, voice graph, effects, clock, slicing, WAV encoder
src/components/  PadGrid, WaveformEditor, StepSequencer, Mixer, Transport,
                 EffectRack, SongTimeline, JamPanel
src/state/       Project types, Zustand UI/project state, Immer patch commands
src/db/          IndexedDB project metadata and original audio Blob storage
src/Studio.tsx   Studio lifecycle, keyboard handling, audio-clock visual updates
tests/           Real Chromium Web Audio and UI integration tests
```

Every trigger creates a new AudioBufferSourceNode. Routing is source -> pad gain/envelope -> pad pan -> pad inserts -> track inserts -> track gain -> track pan -> master gain -> compressor -> analyser -> destination. Choke groups are global across tracks. Attack/release and short choke ramps avoid hard discontinuities. Track effect parameters update in place with smoothed AudioParams.

The scheduler polls every 25 ms and schedules against absolute AudioContext times, with a 150 ms horizon to accommodate up to 50 ms of negative microtiming. Swing delays alternating sixteenths without changing bar length. UI flashes and playheads consume timestamped events using the audio clock. Missed notes after a long main-thread stall are skipped, not burst-played. Live and offline playback share the voice/effect graph.

Project history stores forward/inverse patches, not full snapshots. Continuous edits are coalesced and history is bounded to 100 commands. AudioBuffers/Blobs remain outside React state. Meaningful edits are persisted after 500 ms; IndexedDB transactions save metadata and any new Blobs atomically. Wait for **Saved locally** before closing. Browser storage can be cleared or evicted, so it is not a substitute for backups.

## Tests

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover scheduler timestamps/swing/stall handling, onset detection, WAV encoding, command history, YouTube URL validation, and independent Jam-to-song transfer. Browser tests cover live audio levels/playhead, upload/slicing/reload, undo/redo, arrangement/downloads, actual filter attenuation/delay tails, source-node polyphony, trim/pitch/loop/choke behavior, Jam recording/transfer/reload/export, and desktop/mobile canvas/layout checks. The automated YouTube embed test stubs the external player response; it verifies embed construction and persistence, not YouTube service availability. Screenshots are written under `test-results/`.

## Current Limits

- Four sample tracks, 16 pads per track, one-bar patterns, and one recorded note per track per step.
- Live looped pads are gated to one bar; sequenced looped pads are gated to one step. Stop cancels voices; existing effect tails can decay naturally.
- Tempo/swing changes stop playback to avoid discontinuous rescheduling. Playback also stops when the page is hidden, since browsers throttle background timers.
- Upload limit: 100 MB per file. Offline export limit: 10 minutes of arrangement, plus the fixed tail. Very long/high-feedback tails may extend beyond that export tail.
- No project JSON import or ZIP bundle export in this pass. Old sample Blobs are retained so undo can restore them; storage garbage collection is not implemented.
- No MIDI, microphone capture, collaboration, sharing, or YouTube audio extraction. YouTube embeds require network access; Google Fonts are optional network assets. Local sample processing and storage stay client-side, with font fallbacks if offline.
- Chromium is covered by automated tests. Safari/Firefox audio codec and device-specific behavior still need manual testing. A full page reload is advisable after editing engine modules during Vite HMR.
