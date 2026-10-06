import { Mp3Encoder } from '@breezystack/lamejs'

export type Mp3Request = { channels: Float32Array[]; sampleRate: number; kbps: number }

self.onmessage = (event: MessageEvent<Mp3Request>) => {
  const { channels, sampleRate, kbps } = event.data
  const encoder = new Mp3Encoder(channels.length, sampleRate, kbps)
  const toInt16 = (data: Float32Array) => {
    const out = new Int16Array(data.length)
    for (let index = 0; index < data.length; index++) {
      const value = Math.max(-1, Math.min(1, data[index]))
      out[index] = value < 0 ? value * 32768 : value * 32767
    }
    return out
  }
  const left = toInt16(channels[0])
  const right = channels[1] ? toInt16(channels[1]) : undefined
  const parts: Uint8Array[] = []
  const block = 1152
  for (let offset = 0; offset < left.length; offset += block) {
    const chunk = right
      ? encoder.encodeBuffer(left.subarray(offset, offset + block), right.subarray(offset, offset + block))
      : encoder.encodeBuffer(left.subarray(offset, offset + block))
    if (chunk.length) parts.push(new Uint8Array(chunk))
    if (offset % (block * 200) === 0) (self as unknown as Worker).postMessage({ progress: offset / left.length })
  }
  const tail = encoder.flush()
  if (tail.length) parts.push(new Uint8Array(tail))
  ;(self as unknown as Worker).postMessage(
    { done: true, parts },
    parts.map(part => part.buffer as ArrayBuffer),
  )
}
