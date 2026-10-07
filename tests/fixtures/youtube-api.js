// Minimal stand-in for https://www.youtube.com/iframe_api used by the e2e suite.
// It renders a silent iframe-like box and simulates playback timing.
;(function () {
  const PlayerState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
  class Player {
    constructor(element, options) {
      this.options = options
      this.time = Number(options.playerVars?.start || 0)
      this.state = PlayerState.CUED
      this.listeners = {}
      this.iframe = document.createElement('iframe')
      this.iframe.setAttribute('src', `${options.host || 'https://www.youtube.com'}/embed/${options.videoId}?start=${this.time}&enablejsapi=1`)
      this.iframe.setAttribute('data-fixture', 'youtube-player')
      this.iframe.style.width = '100%'
      this.iframe.style.aspectRatio = '16 / 9'
      element.replaceWith(this.iframe)
      this.tick = setInterval(() => {
        if (this.state === PlayerState.PLAYING) this.time += 0.1
      }, 100)
      setTimeout(() => options.events?.onReady?.({ target: this }), 50)
    }
    setState(state) {
      this.state = state
      this.options.events?.onStateChange?.({ data: state, target: this })
    }
    playVideo() {
      setTimeout(() => this.setState(PlayerState.PLAYING), 30)
    }
    pauseVideo() {
      this.setState(PlayerState.PAUSED)
    }
    seekTo(seconds) {
      this.time = seconds
    }
    getCurrentTime() {
      return this.time
    }
    getDuration() {
      return 300
    }
    getPlayerState() {
      return this.state
    }
    getIframe() {
      return this.iframe
    }
    destroy() {
      clearInterval(this.tick)
      this.iframe.remove()
    }
    addEventListener(name, listener) {
      this.listeners[name] = listener
    }
  }
  window.YT = { Player, PlayerState }
  window.onYouTubeIframeAPIReady?.()
})()
