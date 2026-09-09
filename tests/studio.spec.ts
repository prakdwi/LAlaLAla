import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Play pattern', exact: true })).toBeEnabled()
})

test('real audio playback, visual clock, undo and redo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector<HTMLCanvasElement>('[aria-label="Live master level"]')?.dataset.level) > 0.001)
  await expect(page.locator('.playhead')).toHaveCount(4)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  const step = page.getByRole('button', { name: 'Kick step 2', exact: true })
  await step.click(); await expect(step).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+z'); await expect(step).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Control+Shift+z'); await expect(step).toHaveAttribute('aria-pressed', 'true')
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
      for (let offset = 0; offset < 2205; offset++) data[Math.floor(start * sampleRate) + offset] = Math.sin(offset * 0.2) * Math.exp(-offset / 600) * 0.8
    }
    const blob = encodeWav({ numberOfChannels: 1, length: data.length, sampleRate, getChannelData: () => data })
    const transfer = new DataTransfer()
    transfer.items.add(new File([blob], 'test-transients.wav', { type: 'audio/wav' }))
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.locator('.sample-info')).toContainText('1.000 s')
  await page.getByRole('button', { name: 'Pad 2', exact: true }).click()
  expect(Number(await page.getByRole('spinbutton', { name: 'Slice start', exact: true }).inputValue())).toBeGreaterThan(0.2)
  await expect(page.locator('.save-status')).toContainText('Saved locally')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Play pattern', exact: true })).toBeEnabled()
  await expect(page.locator('.sample-info')).toContainText('1.000 s')
  await page.getByRole('button', { name: 'Pad 2', exact: true }).click()
  expect(Number(await page.getByRole('spinbutton', { name: 'Slice start', exact: true }).inputValue())).toBeGreaterThan(0.2)
  await page.waitForFunction(() => Number(document.querySelector<HTMLCanvasElement>('[aria-label="Live master level"]')?.dataset.level) > 0.001)
})

test('arrangement reorder, repeat edit and downloadable WAV/JSON', async ({ page }) => {
  await page.locator('.song-block').first().click()
  await page.getByRole('spinbutton', { name: 'Repeat count' }).fill('1')
  await page.getByRole('button', { name: 'Move section right' }).click()
  await expect(page.locator('.song-block').last()).toContainText('Intro')
  await page.getByRole('button', { name: 'Play song', exact: true }).click()
  await expect(page.locator('.song-block.current')).toHaveCount(1)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const wavPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Render song as WAV' }).click()
  expect((await wavPromise).suggestedFilename()).toMatch(/\.wav$/)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByText('Audio is not embedded in project JSON.')).toBeVisible()
  const jsonPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Project JSON' }).click()
  expect((await jsonPromise).suggestedFilename()).toMatch(/\.json$/)
})

test('offline filter attenuation, delay tail, voice polyphony and WAV samples', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { AudioGraph } = await import('/src/audio/engine.ts')
    const { makeProject } = await import('/src/state/defaults.ts')
    const render = async (type: 'dry' | 'filter' | 'delay') => {
      const context = new OfflineAudioContext(2, 44100, 44100)
      const buffer = context.createBuffer(1, 4410, 44100)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < data.length; index++) data[index] = Math.sin(index * 2 * Math.PI * 6000 / 44100) * 0.5
      const project = makeProject(); project.masterVolume = 1
      const track = project.tracks[0]; track.sampleBufferId = 'test'; track.volume = 1
      const pad = track.pads[0]; pad.endTime = 0.1; pad.gain = 1
      for (const effect of track.effects) { effect.enabled = effect.type === type; effect.params.cutoff = 200; effect.params.mix = 0.5; effect.params.division = 0.5 }
      const graph = new AudioGraph(context, new Map([['test', buffer]])); graph.sync(project)
      let sources = 0
      const create = context.createBufferSource.bind(context)
      context.createBufferSource = () => { sources++; return create() }
      graph.trigger(track, pad, 0.1, 1, 120)
      graph.trigger(track, pad, 0.11, 0.5, 120)
      const output = (await context.startRendering()).getChannelData(0)
      const energy = (start: number, end: number) => output.slice(start * 44100, end * 44100).reduce((sum: number, value: number) => sum + value * value, 0)
      return { early: energy(0.1, 0.22), tail: energy(0.3, 0.8), sources }
    }
    const dry = await render('dry'); const filter = await render('filter'); const delay = await render('delay')
    return { dry, filter, delay }
  })
  expect(result.dry.sources).toBe(2)
  expect(result.filter.early).toBeLessThan(result.dry.early * 0.05)
  expect(result.delay.tail).toBeGreaterThan(0.1)
  expect(result.dry.tail).toBeLessThan(0.001)
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Render song as WAV' }).click()
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
    const project = makeProject(); const track = project.tracks[0]
    track.sampleBufferId = 'test'
    const graph = new AudioGraph(context, new Map([['test', buffer]])); graph.sync(project)
    const records: { start?: number; offset?: number; stops: number[]; rate?: number; loop?: boolean }[] = []
    const create = context.createBufferSource.bind(context)
    context.createBufferSource = () => {
      const source = create(); const record: typeof records[number] = { stops: [] }; records.push(record)
      const start = source.start.bind(source); const stop = source.stop.bind(source)
      source.start = (when = 0, offset = 0) => { record.start = when; record.offset = offset; record.rate = source.playbackRate.value; record.loop = source.loop; start(when, offset) }
      source.stop = (when = 0) => { record.stops.push(when); stop(when) }
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
    expect(await page.locator('.pad-grid').evaluate(grid => {
      const pads = [...grid.children].map(element => element.getBoundingClientRect())
      return pads.every((pad, index) => index % 4 === 3 || pad.right <= pads[index + 1].left)
    })).toBe(true)
    await expect(page.getByRole('button', { name: 'Pad 16', exact: true })).toBeVisible()
    const colors = await page.locator('.waveform-wrap canvas').evaluate((canvas: HTMLCanvasElement) => new Set(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data).size)
    expect(colors).toBeGreaterThan(20)
    await page.screenshot({ path: `test-results/studio-${width}.png`, fullPage: true })
  }
})

test('YouTube links, Jam recording, independent song transfer, reload and WAV export', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Embedded player test fixture</body></html>' }))
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
  await expect(page.locator('iframe[title="YouTube backing video"]')).toHaveAttribute('src', /youtube-nocookie.com\/embed\/jfKfPfyJRdk\?start=30/)
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
  await expect(page.locator('.song-block').last()).toContainText('YouTube pad take')
  await page.locator('.song-block').last().click()
  await expect(page.getByRole('spinbutton', { name: 'Repeat count', exact: true })).toHaveValue('3')
  await page.getByRole('combobox', { name: 'Pattern', exact: true }).selectOption({ label: 'YouTube pad take' })
  await expect(page.locator('.step-cell.active')).toHaveCount(1)
  await expect(page.locator('.save-status')).toContainText('Saved locally')
  await page.reload()
  await expect(page.locator('.song-block').last()).toContainText('YouTube pad take')
  await page.getByRole('link', { name: 'Jam', exact: true }).click()
  await expect(page.locator('iframe[title="YouTube backing video"]')).toHaveAttribute('src', /start=30/)
  await expect(page.locator('.take-pattern')).toHaveText('Jam 2')
  await page.getByRole('link', { name: 'Studio', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Render song as WAV' }).click()
  const bytes = await readFile((await (await downloadPromise).path())!)
  const sampleRate = bytes.readUInt32LE(24)
  const tailStart = Math.floor(6 * 240 / 92 * sampleRate)
  let peak = 0
  for (let offset = 44 + tailStart * 4; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)))
  expect(peak).toBeGreaterThan(1000)
  expect(errors).toEqual([])
})

test('Jam layout fits desktop and mobile and returns to Studio without a reload', async ({ page }) => {
  await page.getByRole('link', { name: 'Jam', exact: true }).click()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('textbox', { name: 'YouTube video URL' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const boxes = await page.locator('.youtube-player, .jam-take').evaluateAll(elements => elements.map(element => {
      const { left, right, top, bottom } = element.getBoundingClientRect(); return { left, right, top, bottom }
    }))
    expect(boxes[0].right <= boxes[1].left || boxes[0].bottom <= boxes[1].top).toBe(true)
    await page.screenshot({ path: `test-results/jam-${width}.png`, fullPage: true })
  }
  await page.getByRole('link', { name: 'Studio', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Jam room' })).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Jam room' })).toBeVisible()
})