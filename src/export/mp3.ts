/** Encodes a WAV blob to MP3 in a worker so the UI stays responsive. */
export async function wavToMp3(wav: Blob, kbps = 192, onProgress?: (fraction: number) => void): Promise<Blob> {
  const context = new OfflineAudioContext(2, 1, 44100)
  const buffer = await context.decodeAudioData(await wav.arrayBuffer())
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ progress?: number; done?: boolean; parts?: Uint8Array[] }>) => {
      if (event.data.progress !== undefined) onProgress?.(event.data.progress)
      if (event.data.done) {
        resolve(new Blob(event.data.parts as BlobPart[], { type: 'audio/mpeg' }))
        worker.terminate()
      }
    }
    worker.onerror = error => {
      reject(new Error(error.message || 'MP3 encoding failed.'))
      worker.terminate()
    }
    worker.postMessage(
      { channels, sampleRate: buffer.sampleRate, kbps },
      channels.map(channel => channel.buffer as ArrayBuffer),
    )
  })
}
