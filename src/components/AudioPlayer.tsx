import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import type { AudioSource } from '../types'

interface AudioPlayerProps {
  audio: AudioSource
  tone?: 'violet' | 'coral' | 'neutral'
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

export function AudioPlayer({ audio, tone = 'neutral' }: AudioPlayerProps) {
  const element = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setFailed(false)
    element.current?.load()
  }, [audio.src])

  const toggle = async () => {
    const player = element.current
    if (!player) return

    if (!player.paused) {
      player.pause()
      return
    }

    document.querySelectorAll('audio').forEach((item) => {
      if (item !== player) item.pause()
    })

    try {
      await player.play()
    } catch {
      setFailed(true)
    }
  }

  const seek = (value: number) => {
    if (!element.current || !duration) return
    element.current.currentTime = value
    setCurrentTime(value)
  }

  const restart = () => {
    if (!element.current) return
    element.current.currentTime = 0
    setCurrentTime(0)
    void element.current.play()
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className={`audio-player audio-player--${tone}`}>
      <audio
        ref={element}
        src={audio.src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onError={() => setFailed(true)}
      />

      <button className="play-button" onClick={toggle} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
        {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </button>

      <div className="audio-body">
        <div className="audio-meta">
          <span><Volume2 size={15} /> {audio.label ?? 'Аудио'}</span>
          <time>{formatTime(currentTime)} / {formatTime(duration)}</time>
        </div>
        {failed ? (
          <p className="audio-error">Не удалось загрузить аудио</p>
        ) : (
          <input
            className="audio-range"
            type="range"
            min="0"
            max={duration || 1}
            step="0.01"
            value={currentTime}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Позиция аудио"
            style={{ '--audio-progress': `${progress}%` } as React.CSSProperties}
          />
        )}
      </div>

      <button className="restart-button" onClick={restart} aria-label="С начала">
        <RotateCcw size={17} />
      </button>
    </div>
  )
}
