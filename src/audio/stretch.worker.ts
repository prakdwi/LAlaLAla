/// <reference lib="webworker" />
import { stretchChannel } from './stretch'

export type StretchRequest = { id: string; channels: Float32Array[]; ratio: number; sampleRate: number }
export type StretchResponse = { id: string; channels: Float32Array[] }

self.onmessage = (event: MessageEvent<StretchRequest>) => {
  const { id, channels, ratio, sampleRate } = event.data
  const stretched = channels.map(channel => stretchChannel(channel, ratio, sampleRate))
  const response: StretchResponse = { id, channels: stretched }
  ;(self as unknown as Worker).postMessage(
    response,
    stretched.map(channel => channel.buffer as ArrayBuffer),
  )
}
