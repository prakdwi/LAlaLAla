import { chromium } from '@playwright/test'
const base = process.argv[2]; const wait = Number(process.argv[3] || 0)
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('console', m => { if (m.type() === 'debug' || m.type() === 'error') console.log('  console[' + m.type() + ']:', m.text().slice(0, 300)) })
page.on('pageerror', e => console.log('  pageerror:', e.message))
await page.goto(base + '/')
await page.getByRole('button', { name: 'Play pattern', exact: true }).waitFor({ timeout: 30000 })
if (wait) await page.waitForTimeout(wait)
await page.evaluate(async () => {
  const sampleRate = 44100
  const data = new Float32Array(sampleRate * 2)
  for (const start of [0, 0.3, 0.7, 1.1, 1.5]) for (let o = 0; o < 4000; o++) data[Math.floor(start * sampleRate) + o] = Math.sin(o * 0.15) * Math.exp(-o / 900) * 0.8
  const bytes = new ArrayBuffer(44 + data.length * 2); const v = new DataView(bytes)
  const t = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  t(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); t(8, 'WAVE'); t(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); t(36, 'data'); v.setUint32(40, data.length * 2, true)
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, data[i] * 32767, true)
  const dt = new DataTransfer(); dt.items.add(new File([bytes], 'hits.wav', { type: 'audio/wav' }))
  const input = document.querySelector('.sample-section input[type=file]'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }))
})
await page.waitForTimeout(2500)
console.log('sample-info:', await page.locator('.sample-info').textContent(), '| banner:', await page.locator('.error-banner').textContent().catch(() => '(none)'))
const starts = []
for (let i = 1; i <= 5; i++) { await page.getByRole('button', { name: `Pad ${i}`, exact: true }).click(); starts.push(Number(await page.getByRole('spinbutton', { name: 'Slice start' }).inputValue())) }
console.log(`${base} wait=${wait} pad starts:`, starts.join(', '))
await browser.close()
