import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Link, Pause, Play, Radio, Scissors, Unplug } from 'lucide-react'
import { createVideoController, formatClock, type VideoController } from '../audio/youtube'
import { useStudio } from '../state/store'
import { connectTabAudio, releaseTabAudio, sampleVideoRegion, setMpc, startSampling, stopSampling } from '../state/mpc'
import type { Track } from '../state/types'

/**
 * Backing video with cue points. With tab audio connected, the video's sound can be sampled onto
 * the current kit: a manual Sample / Stop while it plays, or an exact IN -> OUT region.
 */
export function VideoSampler({ track, toNewKit }: { track: Track; toNewKit: boolean }) {
  const { project, edit, mpc, ready } = useStudio()
  const source = project.jamSource
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<VideoController | null>(null)
  const [api, setApi] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const cueIn = source?.cueIn ?? source?.start ?? 0
  const cueOut = source?.cueOut ?? cueIn + 4

  useEffect(() => {
    controller.current?.destroy()
    controller.current = null
    setApi('loading')
    if (!source || !host.current) return
    let cancelled = false
    const mount = document.createElement('div')
    host.current.replaceChildren(mount)
    createVideoController(mount, source.videoId, source.start)
      .then(created => {
        if (cancelled) {
          created.destroy()
          return
        }
        controller.current = created
        setApi('ready')
      })
      .catch(() => {
        if (!cancelled) setApi('fallback')
      })
    return () => {
      cancelled = true
      controller.current?.destroy()
      controller.current = null
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only the video identity should rebuild the player
  }, [source?.videoId, source?.start])

  useEffect(() => {
    if (api !== 'ready') return
    const timer = setInterval(() => {
      const video = controller.current
      if (!video) return
      setTime(video.currentTime())
      setDuration(video.duration())
      setPlaying(video.playing())
    }, 200)
    return () => clearInterval(timer)
  }, [api])

  const setCue = (key: 'cueIn' | 'cueOut', value: number) =>
    edit(
      key === 'cueIn' ? 'Cue in' : 'Cue out',
      draft => {
        if (!draft.jamSource) return
        draft.jamSource[key] = Math.max(0, Math.round(value * 10) / 10)
        if (key === 'cueIn' && (draft.jamSource.cueOut ?? 0) <= draft.jamSource.cueIn!)
          draft.jamSource.cueOut = draft.jamSource.cueIn! + 4
      },
      `cue-${key}`,
    )

  if (!source) {
    return (
      <div className="youtube-player">
        <div className="youtube-empty">
          <Link size={30} />
          <span>No backing video</span>
        </div>
      </div>
    )
  }
  const video = controller.current
  const canControl = api === 'ready' && Boolean(video)
  return (
    <div className="youtube-player video-sampler">
      {api === 'fallback' ? (
        <iframe
          key={`${source.videoId}-${source.start}`}
          title="YouTube backing video"
          src={`https://www.youtube-nocookie.com/embed/${source.videoId}?start=${source.start}&playsinline=1&rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div className="yt-host" ref={host} />
      )}
      <div className="video-actions">
        <a
          href={`https://www.youtube.com/watch?v=${source.videoId}&t=${source.start}s`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={12} />
          Open on YouTube
        </a>
        <button
          onClick={() =>
            edit('Remove backing video', draft => {
              delete draft.jamSource
            })
          }
        >
          Remove video
        </button>
      </div>
      <div className="video-sampling">
        <div className="video-transport">
          <button
            aria-label={playing ? 'Pause video' : 'Play video'}
            disabled={!canControl}
            onClick={() => (playing ? video!.pause() : video!.play())}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <strong className="video-clock" aria-label="Video position">
            {canControl ? formatClock(time) : api === 'loading' ? 'loading…' : 'use the player controls'}
          </strong>
          <small>{canControl && duration ? `/ ${formatClock(duration)}` : ''}</small>
          <button
            className={`toggle ${mpc.tabAudio ? 'on' : ''}`}
            aria-pressed={mpc.tabAudio}
            disabled={!ready}
            onClick={() => (mpc.tabAudio ? releaseTabAudio() : void connectTabAudio())}
            title="Share this tab's audio so the video can be sampled"
          >
            {mpc.tabAudio ? <Unplug size={12} /> : <Radio size={12} />}
            {mpc.tabAudio ? 'Tab audio on' : 'Connect tab audio'}
          </button>
        </div>
        <div className="cue-row">
          <label>
            IN
            <input
              aria-label="Cue in seconds"
              type="number"
              min={0}
              step={0.1}
              value={cueIn}
              onChange={event => setCue('cueIn', Number(event.target.value) || 0)}
            />
            <button
              disabled={!canControl}
              onClick={() => setCue('cueIn', video!.currentTime())}
              title="Set IN at the current video time"
            >
              set
            </button>
          </label>
          <label>
            OUT
            <input
              aria-label="Cue out seconds"
              type="number"
              min={0}
              step={0.1}
              value={cueOut}
              onChange={event => setCue('cueOut', Number(event.target.value) || 0)}
            />
            <button
              disabled={!canControl}
              onClick={() => setCue('cueOut', video!.currentTime())}
              title="Set OUT at the current video time"
            >
              set
            </button>
          </label>
          <span className="eyebrow">{Math.max(0, cueOut - cueIn).toFixed(1)} s</span>
          <button
            disabled={!canControl}
            onClick={() => {
              video!.seek(cueIn)
              video!.play()
            }}
            title="Preview from IN"
          >
            <Play size={12} />
            IN
          </button>
        </div>
        <div className="sample-row">
          <button
            className="sample-region-button"
            disabled={!ready || !canControl || mpc.sampling || cueOut <= cueIn}
            onClick={() => void sampleVideoRegion(track, toNewKit, video!, cueIn, cueOut, `${track.name} video`)}
            title={
              mpc.tabAudio
                ? 'Capture exactly IN to OUT onto the kit'
                : 'Connects tab audio first, then captures IN to OUT'
            }
          >
            <Scissors size={13} />
            Sample IN → OUT
          </button>
          <button
            className={`toggle ${mpc.sampling && mpc.sampleSource === 'tab' ? 'on' : ''}`}
            disabled={!ready}
            onClick={() =>
              mpc.sampling ? void stopSampling(track, toNewKit, `${track.name} video`) : void startSampling('tab')
            }
            title="Record whatever the video plays until you stop"
          >
            {mpc.sampling && mpc.sampleSource === 'tab' ? 'Stop video sampling' : 'Sample video live'}
          </button>
          {mpc.tabAudio && !mpc.sampling && (
            <button className="link-button" onClick={() => setMpc({ sampleSource: 'mic' })} hidden>
              mic
            </button>
          )}
        </div>
        <small className="video-hint">
          {mpc.sampling && mpc.sampleSource === 'tab'
            ? 'Capturing the video… your pads are muted until you stop.'
            : 'Chrome asks once to share this tab with audio. The sample is auto-chopped onto the pads; fine-tune with Chop.'}
        </small>
      </div>
    </div>
  )
}
