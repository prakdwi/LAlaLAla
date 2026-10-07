/**
 * Thin controller over the official YouTube IFrame Player API, so the Jam room can seek, play and
 * pause the backing video programmatically when sampling a cue region. If the API script cannot
 * load (offline, blocked), callers fall back to a plain embed.
 */
type YTPlayer = {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  getIframe: () => HTMLIFrameElement
  destroy: () => void
  addEventListener: (event: string, listener: (event: { data: number }) => void) => void
}
type YTNamespace = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace> | null = null
export function loadYouTubeApi(timeoutMs = 4000): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => {
      apiPromise = null
      reject(new Error('YouTube player API did not load.'))
    }, timeoutMs)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      clearTimeout(timer)
      if (window.YT) resolve(window.YT)
    }
    if (!document.querySelector('script[data-yt-api]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.ytApi = 'true'
      script.onerror = () => {
        clearTimeout(timer)
        apiPromise = null
        reject(new Error('YouTube player API failed to load.'))
      }
      document.head.appendChild(script)
    }
  })
  return apiPromise
}

export type VideoController = {
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
  currentTime: () => number
  duration: () => number
  playing: () => boolean
  /** resolves when playback actually starts (or after `timeoutMs`) */
  waitForPlaying: (timeoutMs?: number) => Promise<void>
  destroy: () => void
}

export async function createVideoController(
  element: HTMLElement,
  videoId: string,
  start: number,
): Promise<VideoController> {
  const YT = await loadYouTubeApi()
  let playing = false
  const waiters = new Set<() => void>()
  const player = await new Promise<YTPlayer>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('YouTube player did not become ready.')), 8000)
    const instance = new YT.Player(element, {
      videoId,
      host: 'https://www.youtube-nocookie.com',
      playerVars: { start, playsinline: 1, rel: 0, enablejsapi: 1, origin: window.location.origin },
      events: {
        onReady: () => {
          clearTimeout(timer)
          try {
            instance.getIframe().title = 'YouTube backing video'
          } catch {
            /* iframe not accessible */
          }
          resolve(instance)
        },
        onStateChange: (event: { data: number }) => {
          playing = event.data === YT.PlayerState.PLAYING
          if (playing) {
            waiters.forEach(resolveWaiter => resolveWaiter())
            waiters.clear()
          }
        },
        onError: () => {
          clearTimeout(timer)
          reject(new Error('This video cannot be embedded.'))
        },
      },
    })
  })
  return {
    play: () => player.playVideo(),
    pause: () => player.pauseVideo(),
    seek: seconds => player.seekTo(Math.max(0, seconds), true),
    currentTime: () => player.getCurrentTime?.() ?? 0,
    duration: () => player.getDuration?.() ?? 0,
    playing: () => playing,
    waitForPlaying: (timeoutMs = 1500) =>
      playing
        ? Promise.resolve()
        : new Promise(resolve => {
            const timer = setTimeout(() => {
              waiters.delete(done)
              resolve()
            }, timeoutMs)
            const done = () => {
              clearTimeout(timer)
              resolve()
            }
            waiters.add(done)
          }),
    destroy: () => {
      try {
        player.destroy()
      } catch {
        /* already gone */
      }
    },
  }
}

export const formatClock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${String(Math.floor((seconds % 1) * 10))}`
}
