import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const youtubeFixture = readFileSync(new URL('./fixtures/youtube-api.js', import.meta.url), 'utf8')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Play pattern', exact: true })).toBeEnabled()
})

test('real audio playback, visual clock, undo and redo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click()
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLCanvasElement>('[aria-label="Live master level"]')?.dataset.level) > 0.001,
  )
  await expect(page.locator('.playhead')).toHaveCount(4)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  const step = page.getByRole('button', { name: 'Kick step 2', exact: true })
  await step.click()
  await expect(step).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+z')
  await expect(step).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Control+Shift+z')
  await expect(step).toHaveAttribute('aria-pressed', 'true')
  await step.click({ button: 'right' })
  await expect(page.getByRole('slider', { name: 'Velocity', exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Microtiming', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('uploaded file is sliced, playable and restored from IndexedDB', async ({ page }) => {
  await page.evaluate(async () => {
    const { encodeWav } = await import('/src/audio/wav.ts')
    const sampleRate = 44100
    const data = new Float32Array(sampleRate)
    for (const start of [0, 0.25, 0.6]) {
      for (let offset = 0; offset < 2205; offset++)
        data[Math.floor(start * sampleRate) + offset] = Math.sin(offset * 0.2) * Math.exp(-offset / 600) * 0.8
    }
    const blob = encodeWav({ numberOfChannels: 1, length: data.length, sampleRate, getChannelData: () => data })
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'test-transients.wav', { type: 'audio/wav' }))
    const input = document.querySelector<HTMLInputElement>('.sample-section input[type=file]')!
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.locator('.sample-info')).toContainText('1.000 s')
  await page.getByRole('button', { name: 'Pad 2', exact: true }).click()
  expect(Number(await page.getByRole('spinbutton', { name: 'Slice start', exact: true }).inputValue())).toBeGreaterThan(
    0.2,
  )
  await expect(page.locator('.save-status')).toContainText('Saved locally')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Play pattern', exact: true })).toBeEnabled()
  await expect(page.locator('.sample-info')).toContainText('1.000 s')
  await page.getByRole('button', { name: 'Pad 2', exact: true }).click()
  expect(Number(await page.getByRole('spinbutton', { name: 'Slice start', exact: true }).inputValue())).toBeGreaterThan(
    0.2,
  )
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLCanvasElement>('[aria-label="Live master level"]')?.dataset.level) > 0.001,
  )
})

test('arrangement clips: select, resize, loop region, play song, downloadable WAV/JSON', async ({ page }) => {
  await expect(page.locator('.clip')).toHaveCount(2)
  await page.locator('.clip').first().click()
  await expect(page.getByRole('spinbutton', { name: 'Clip length' })).toHaveValue('8')
  await page.getByRole('spinbutton', { name: 'Clip length' }).fill('4')
  await expect(page.locator('.clip').first()).toContainText('Intro')
  await page.getByRole('button', { name: 'Duplicate clip' }).click()
  await expect(page.locator('.clip')).toHaveCount(3)
  await page.getByTitle('Loop region').first().click()
  await expect(page.locator('.loop-region')).toBeVisible()
  await page.getByRole('button', { name: 'Play song', exact: true }).click()
  await expect(page.locator('.playhead-line')).toBeVisible()
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLCanvasElement>('[aria-label="Live master level"]')?.dataset.level) > 0.001,
  )
  // live tempo change must not stop playback
  await page.getByLabel('BPM').fill('120')
  await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const wavPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Render song as WAV' }).click()
  expect((await wavPromise).suggestedFilename()).toMatch(/\.wav$/)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByText('JSON holds settings only')).toBeVisible()
  const jsonPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export project JSON' }).click()
  expect((await jsonPromise).suggestedFilename()).toMatch(/\.json$/)
})

test('synth track, piano roll notes, keyboard playing, multi-bar pattern and undo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Add track' }).click()
  await page.getByRole('menuitem', { name: 'Synthesizer' }).click()
  await expect(page.locator('.track-library button')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Key C4', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /New MIDI clip for Synth 1/ }).click()
  await expect(page.getByRole('tab', { name: 'Piano roll' })).toHaveAttribute('aria-selected', 'true')
  const grid = page.locator('.piano-grid')
  await page.locator('.piano-scroll').scrollIntoViewIfNeeded()
  const box = (await page.locator('.piano-scroll').boundingBox())!
  await page.mouse.click(box.x + 120, box.y + 150)
  await page.mouse.click(box.x + 260, box.y + 190)
  await expect(grid.locator('.piano-note')).toHaveCount(2)
  await page.keyboard.press('Control+z')
  await expect(grid.locator('.piano-note')).toHaveCount(1)
  await page.getByRole('button', { name: 'Play song', exact: true }).click()
  await expect(page.locator('.piano-key.hit').first()).toBeVisible({ timeout: 8000 })
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  // keyboard plays the synth
  await page.keyboard.down('a')
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLCanvasElement>('[aria-label="Live master level"]')?.dataset.level) > 0.0005,
  )
  await page.keyboard.up('a')
  // multi-bar pattern paging
  await page.getByRole('tab', { name: 'Step sequencer' }).click()
  await page.getByRole('combobox', { name: 'Pattern bars' }).selectOption('2')
  await expect(page.getByRole('button', { name: 'Bar 2', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bar 2', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Kick step 17', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('audio track records microphone input into a clip after a count-in', async ({ page }) => {
  await page.getByRole('button', { name: 'Add track' }).click()
  await page.getByRole('menuitem', { name: 'Audio track' }).click()
  await page.getByRole('button', { name: 'Arm microphone', exact: true }).click()
  await expect(page.locator('.notice-toast')).toContainText('Input armed')
  await page.getByLabel('Count-in bars').selectOption('1')
  await page.getByRole('button', { name: 'Record pads into pattern' }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('button', { name: 'Record pads into pattern' }).click()
  await page.getByRole('button', { name: 'Play song', exact: true }).click()
  await expect(page.locator('.position small')).toContainText('COUNT-IN')
  await expect(page.locator('.position small')).toContainText('AUDIO RECORDING', { timeout: 10000 })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.clip-audio')).toHaveCount(1)
  await page.locator('.clip-audio').click()
  await expect(page.getByRole('tab', { name: 'Audio clip' })).toHaveAttribute('aria-selected', 'true')
  expect(Number(await page.getByRole('spinbutton', { name: 'Clip start' }).inputValue())).toBe(0)
  await expect(page.locator('.save-status')).toContainText('Saved locally')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Play pattern', exact: true })).toBeEnabled()
  await expect(page.locator('.clip-audio')).toHaveCount(1)
  await expect(page.locator('.error-banner')).toHaveCount(0)
})

test('bus send, sidechain compressor, automation clip and project library', async ({ page }) => {
  await page.getByRole('button', { name: 'Add track' }).click()
  await page.getByRole('menuitem', { name: /Bus/ }).click()
  await page.locator('.track-library button').first().click()
  await page.getByRole('slider', { name: 'Kick send to Bus 1' }).fill('0.8')
  await page.getByRole('combobox', { name: 'Kick output' }).selectOption({ label: '→ Bus 1' })
  await page.getByRole('combobox', { name: 'Add effect' }).selectOption('compressor')
  await page.getByRole('combobox', { name: 'Sidechain source' }).selectOption({ label: 'Snare' })
  await page.getByRole('tab', { name: 'filter' }).click()
  await page.locator('.automate-button').first().click()
  await expect(page.getByRole('tab', { name: 'Automation' })).toHaveAttribute('aria-selected', 'true')
  const canvas = page.locator('.automation-canvas')
  await canvas.scrollIntoViewIfNeeded()
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + 30, box.y + 30)
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30)
  await expect(page.locator('.automation-point')).toHaveCount(2)
  await page.getByRole('button', { name: 'Play song', exact: true }).click()
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLCanvasElement>('[aria-label="Live master level"]')?.dataset.level) > 0.001,
  )
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('button', { name: 'Project actions' }).click()
  await page.getByRole('menuitem', { name: 'New project' }).click()
  await expect(page.locator('.project-library button')).toHaveCount(2)
  await expect(page.locator('.track-library button')).toHaveCount(4)
  await page.locator('.project-library button').nth(1).click()
  await expect(page.locator('.track-library button')).toHaveCount(5)
  await expect(page.locator('.clip-automation')).toHaveCount(1)
})

test('offline filter attenuation, delay tail, voice polyphony and WAV samples', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { AudioGraph } = await import('/src/audio/engine.ts')
    const { makeProject } = await import('/src/state/defaults.ts')
    const render = async (type: 'dry' | 'filter' | 'delay') => {
      const context = new OfflineAudioContext(2, 44100, 44100)
      const buffer = context.createBuffer(1, 4410, 44100)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < data.length; index++)
        data[index] = Math.sin((index * 2 * Math.PI * 6000) / 44100) * 0.5
      const project = makeProject()
      project.masterVolume = 1
      const track = project.tracks[0]
      track.sampleBufferId = 'test'
      track.volume = 1
      const pad = track.pads[0]
      pad.endTime = 0.1
      pad.gain = 1
      for (const effect of track.effects) {
        effect.enabled = effect.type === type
        effect.params.cutoff = 200
        effect.params.mix = 0.5
        effect.params.division = 0.5
      }
      const graph = new AudioGraph(context, new Map([['test', buffer]]))
      graph.sync(project)
      let sources = 0
      const create = context.createBufferSource.bind(context)
      context.createBufferSource = () => {
        sources++
        return create()
      }
      graph.trigger(track, pad, 0.1, 1, 120)
      graph.trigger(track, pad, 0.11, 0.5, 120)
      const output = (await context.startRendering()).getChannelData(0)
      const energy = (start: number, end: number) =>
        output.slice(start * 44100, end * 44100).reduce((sum: number, value: number) => sum + value * value, 0)
      return { early: energy(0.1, 0.22), tail: energy(0.3, 0.8), sources }
    }
    const dry = await render('dry')
    const filter = await render('filter')
    const delay = await render('delay')
    return { dry, filter, delay }
  })
  expect(result.dry.sources).toBe(2)
  expect(result.filter.early).toBeLessThan(result.dry.early * 0.05)
  expect(result.delay.tail).toBeGreaterThan(0.1)
  expect(result.dry.tail).toBeLessThan(0.001)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Render song as WAV' }).click()
  const bytes = await readFile((await (await downloadPromise).path())!)
  let peak = 0
  for (let offset = 44; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)))
  expect(peak).toBeGreaterThan(1000)
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
  expect(bytes.readUInt16LE(22)).toBe(2)
})

test('trim, pitch, loop gating and future-scheduled choke groups', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { AudioGraph } = await import('/src/audio/engine.ts')
    const { makeProject } = await import('/src/state/defaults.ts')
    const context = new OfflineAudioContext(2, 44100, 44100)
    const buffer = context.createBuffer(1, 44100, 44100)
    buffer.getChannelData(0).fill(0.1)
    const project = makeProject()
    const track = project.tracks[0]
    track.sampleBufferId = 'test'
    const graph = new AudioGraph(context, new Map([['test', buffer]]))
    graph.sync(project)
    const records: { start?: number; offset?: number; stops: number[]; rate?: number; loop?: boolean }[] = []
    const create = context.createBufferSource.bind(context)
    context.createBufferSource = () => {
      const source = create()
      const record: (typeof records)[number] = { stops: [] }
      records.push(record)
      const start = source.start.bind(source)
      const stop = source.stop.bind(source)
      source.start = (when = 0, offset = 0) => {
        record.start = when
        record.offset = offset
        record.rate = source.playbackRate.value
        record.loop = source.loop
        start(when, offset)
      }
      source.stop = (when = 0) => {
        record.stops.push(when)
        stop(when)
      }
      return source
    }
    const pad = { ...track.pads[0], startTime: 0.2, endTime: 0.6, pitchSemitones: 12, chokeGroup: 1 }
    graph.trigger(track, pad, 0.3, 1, 120)
    graph.trigger(track, { ...pad, pitchSemitones: 0 }, 0.1, 1, 120)
    graph.trigger(track, { ...pad, chokeGroup: 0, loop: true }, 0.6, 1, 120, 0.125)
    await context.startRendering()
    return records
  })
  expect(result).toHaveLength(3)
  expect(result[0].offset).toBeCloseTo(0.2)
  expect(result[0].rate).toBe(2)
  expect(result[0].stops.at(-1)).toBeCloseTo(0.5)
  expect(result[1].stops.at(-1)).toBeCloseTo(0.305)
  expect(result[2].loop).toBe(true)
  expect(result[2].stops.at(-1)).toBeCloseTo(0.725)
})

test('desktop and mobile layouts and nonblank waveform', async ({ page }) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      await page.locator('.pad-grid').evaluate(grid => {
        const pads = [...grid.children].map(element => element.getBoundingClientRect())
        return pads.every((pad, index) => index % 4 === 3 || pad.right <= pads[index + 1].left)
      }),
    ).toBe(true)
    await expect(page.getByRole('button', { name: 'Pad 16', exact: true })).toBeVisible()
    const colors = await page
      .locator('.waveform-wrap canvas')
      .evaluate(
        (canvas: HTMLCanvasElement) =>
          new Set(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data).size,
      )
    expect(colors).toBeGreaterThan(20)
    await page.screenshot({ path: `test-results/studio-${width}.png`, fullPage: true })
  }
})

test('YouTube links, Jam recording, independent song transfer, reload and WAV export', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Embedded player test fixture</body></html>' }),
  )
  await page.route('https://www.youtube.com/iframe_api', route =>
    route.fulfill({ contentType: 'application/javascript', body: youtubeFixture }),
  )
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('link', { name: 'Jam', exact: true }).click()
  await expect(page).toHaveURL(/\/jam$/)
  const url = page.getByRole('textbox', { name: 'YouTube video URL' })
  await url.fill('https://example.com/watch?v=jfKfPfyJRdk')
  await page.getByRole('button', { name: 'Load video' }).click()
  await expect(page.getByRole('alert')).toContainText('valid YouTube video URL')
  await url.fill('https://youtu.be/jfKfPfyJRdk?t=30')
  await page.getByRole('button', { name: 'Load video' }).click()
  await expect(page.locator('iframe[title="YouTube backing video"]')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/jfKfPfyJRdk\?start=30/,
  )
  // tab-audio sampling of the backing video, with a stubbed share dialog that returns a tone
  await page.evaluate(() => {
    const context = new AudioContext()
    const destination = context.createMediaStreamDestination()
    const osc = context.createOscillator()
    osc.frequency.value = 220
    osc.connect(destination)
    osc.start()
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      value: async () => destination.stream,
      configurable: true,
    })
  })
  await page.getByRole('button', { name: 'Connect tab audio' }).click()
  await expect(page.locator('.notice-toast')).toContainText('Tab audio connected')
  await page.getByLabel('Cue in seconds').fill('30')
  await page.getByLabel('Cue out seconds').fill('30.8')
  await page.getByRole('button', { name: 'Sample IN → OUT' }).click()
  await expect(page.locator('.notice-toast')).toContainText(/Sampled 0\.[6-9]\d s into Kick/, { timeout: 10000 })
  await expect(page.locator('.sample-info')).not.toContainText('0.600 s')
  await expect(page.locator('.youtube-limit')).toContainText('excluded from WAV exports')
  await page.getByRole('button', { name: 'Record take', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recording', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Pad 3', exact: true }).click()
  await expect(page.locator('.jam-take .section-heading')).toContainText('1 NOTES')
  await page.getByRole('button', { name: 'Stop Jam recording' }).click()
  await page.getByRole('textbox', { name: 'Jam section name' }).fill('YouTube pad take')
  await page.getByRole('spinbutton', { name: 'Jam repeat count' }).fill('3')
  await page.getByRole('button', { name: 'Add to song', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toContainText('YouTube pad take')
  await page.getByRole('button', { name: 'New take', exact: true }).click()
  await expect(page.locator('.jam-take .section-heading')).toContainText('0 NOTES')
  await expect(page.getByRole('button', { name: 'Add to song', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: 'Studio', exact: true }).click()
  await expect(page.locator('.clip').last()).toContainText('YouTube pad take')
  await page.locator('.clip').last().click()
  await expect(page.getByRole('spinbutton', { name: 'Clip length', exact: true })).toHaveValue('12')
  await page.getByRole('combobox', { name: 'Pattern', exact: true }).selectOption({ label: 'YouTube pad take' })
  await expect(page.locator('.step-cell.active')).toHaveCount(1)
  await expect(page.locator('.save-status')).toContainText('Saved locally')
  await page.reload()
  await expect(page.locator('.clip').last()).toContainText('YouTube pad take')
  await page.getByRole('link', { name: 'Jam', exact: true }).click()
  await expect(page.locator('iframe[title="YouTube backing video"]')).toHaveAttribute('src', /start=30/)
  await expect(page.locator('.take-pattern')).toHaveText('Jam 2')
  await page.getByRole('link', { name: 'Studio', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Render song as WAV' }).click()
  const bytes = await readFile((await (await downloadPromise).path())!)
  const sampleRate = bytes.readUInt32LE(24)
  const tailStart = Math.floor(((6 * 240) / 92) * sampleRate)
  let peak = 0
  for (let offset = 44 + tailStart * 4; offset < bytes.length; offset += 2)
    peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)))
  expect(peak).toBeGreaterThan(1000)
  expect(errors).toEqual([])
})

test('Jam room MPC modes: banks, 16 levels, quantized recording, note repeat, erase, pad mute, chop, resample', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Jam', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: 'Pad modes' })).toBeVisible()
  // banks
  await page.getByRole('button', { name: 'Add pad bank' }).click()
  await page.getByRole('button', { name: 'Bank B', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pad 17', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bank A', exact: true }).click()
  // 16 levels
  await page.getByLabel('16 levels mode').selectOption('velocity')
  await expect(page.getByText('100%', { exact: true })).toBeVisible()
  await page.getByLabel('16 levels mode').selectOption('off')
  // quantized recording via keyboard
  await page.getByLabel('Jam count-in bars').selectOption('0')
  await page.getByRole('button', { name: 'Record take', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recording', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(150)
  for (const key of ['1', 'q', 'a']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(170)
  }
  await expect(page.locator('.jam-take .section-heading')).toContainText(/[3-9] NOTES/)
  // note repeat roll adds several steps
  await page.getByLabel('Note repeat rate').selectOption('0.125')
  const pad = page.getByRole('button', { name: 'Pad 5', exact: true })
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 40)
  await page.mouse.down()
  await page.waitForTimeout(600)
  await page.mouse.up()
  await page.getByLabel('Note repeat rate').selectOption('0')
  await expect(page.locator('.jam-take .section-heading')).toContainText(/(1[0-9]|[6-9]) NOTES/)
  // erase removes that pad's steps
  await page.getByRole('button', { name: 'Erase' }).click()
  await page.getByRole('button', { name: 'Pad 5', exact: true }).click()
  await page.getByRole('button', { name: 'Erase' }).click()
  await expect(page.locator('.jam-take .section-heading')).toContainText(/[2-5] NOTES/)
  // pad mute flags the pad
  await page.getByRole('button', { name: 'Pad mute' }).click()
  await page.getByRole('button', { name: 'Pad 1', exact: true }).click()
  await page.getByRole('button', { name: 'Pad mute' }).click()
  await expect(page.locator('.pad-badge', { hasText: 'MUTE' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Stop Jam recording' }).click()
  // chop into equal regions
  await page.getByLabel('Chop mode').selectOption('equal')
  await page.getByLabel('Chop region count').selectOption('8')
  await page.getByRole('button', { name: 'Chop', exact: true }).click()
  await page.getByRole('button', { name: 'Pad 2', exact: true }).click()
  expect(Number(await page.getByRole('spinbutton', { name: 'Slice start' }).inputValue())).toBeCloseTo(0.075, 2)
  await page.getByLabel('Reverse').check()
  await expect(page.locator('.pad-badge', { hasText: 'REV' }).first()).toBeVisible()
  // resample the take onto a new kit
  await page.getByRole('button', { name: 'Resample' }).click()
  await expect(page.locator('.notice-toast')).toContainText('Resampled', { timeout: 15000 })
  await expect(page.locator('.track-library button')).toHaveCount(5)
  // sample from the (fake) microphone
  await page.getByRole('button', { name: 'Sample mic', exact: true }).click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Stop sampling' }).click()
  await expect(page.locator('.notice-toast')).toContainText('Sampled', { timeout: 8000 })
})

test('Jam layout fits desktop and mobile and returns to Studio without a reload', async ({ page }) => {
  await page.getByRole('link', { name: 'Jam', exact: true }).click()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('textbox', { name: 'YouTube video URL' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const boxes = await page.locator('.youtube-player, .jam-take').evaluateAll(elements =>
      elements.map(element => {
        const { left, right, top, bottom } = element.getBoundingClientRect()
        return { left, right, top, bottom }
      }),
    )
    expect(boxes[0].right <= boxes[1].left || boxes[0].bottom <= boxes[1].top).toBe(true)
    await page.screenshot({ path: `test-results/jam-${width}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Studio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Jam room' })).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Jam room' })).toBeVisible()
})
