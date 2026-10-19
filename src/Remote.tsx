import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { Headphones, Radio, Signal, Volume2 } from 'lucide-react'
import type { SoundPad } from './types'

export default function Remote() {
  const [pads, setPads] = useState<SoundPad[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket: Socket = io(`${window.location.protocol}//${window.location.hostname}:4317`)
    socketRef.current = socket
    socket.on('connect', () => {
      setConnected(true)
      socket.emit('controller:join')
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('pads:update', setPads)
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const play = (id: string) => {
    socketRef.current?.emit('pad:play', id)
    if ('vibrate' in navigator) navigator.vibrate(18)
  }

  return (
    <main className="remote-shell">
      <header className="remote-header">
        <div className="remote-brand"><span className="brand-mark"><Radio size={19} /></span><span>SONICFLOW</span></div>
        <div className={`remote-status ${connected ? 'is-connected' : ''}`}><span />{connected ? 'НА СВЯЗИ' : 'ПОИСК СТУДИИ'}</div>
      </header>
      <section className="remote-content">
        <div className="remote-heading"><p className="eyebrow">МОБИЛЬНЫЙ ПУЛЬТ</p><h1>Звуки<br />в твоих руках.</h1><p className="remote-subtitle">Нажми, чтобы отправить звук в эфир.</p></div>
        {pads.length ? (
          <div className="remote-grid">
            {pads.map((pad, index) => (
              <button className={`remote-pad tone-${pad.tint}`} key={pad.id} onClick={() => play(pad.id)}>
                <span className="remote-pad-index">{String(index + 1).padStart(2, '0')}</span>
                <Volume2 size={20} strokeWidth={1.7} />
                <span className="remote-pad-label">{pad.title}</span>
              </button>
            ))}
          </div>
        ) : <div className="remote-empty"><Headphones size={22} /><span>Открой SonicFlow Studio на компьютере</span></div>}
        <div className="remote-footer"><Signal size={14} /><span>Локальное подключение</span><span className="remote-footer-dot">•</span><span>Без задержки облака</span></div>
      </section>
    </main>
  )
}