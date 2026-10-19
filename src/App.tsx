import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { QRCodeSVG } from 'qrcode.react'
import {
  AudioLines, Check, ChevronDown, CircleHelp, Headphones, Keyboard, Mic,
  MicOff, MoreHorizontal, Plus, Radio, Settings2, Smartphone, Sparkles,
  Square, Upload, Volume2, VolumeX, Waves, X,
} from 'lucide-react'
import { AudioEngine } from './audioEngine'
import Remote from './Remote'
import { defaultVoiceSettings, type SoundPad, type VoiceSettings } from './types'
import './App.css'

const voicePresets = [
  { name: 'Natural', icon: '01', settings: { pitch: 0, drive: 0, echo: 0, space: 10, tone: 12000 } },
  { name: 'Radio', icon: '02', settings: { pitch: 0, drive: 22, echo: 8, space: 0, tone: 2600 } },
  { name: 'Giant', icon: '03', settings: { pitch: -7, drive: 26, echo: 12, space: 26, tone: 5600 } },
  { name: 'Pixel', icon: '04', settings: { pitch: 7, drive: 34, echo: 0, space: 8, tone: 8200 } },
]

const tintCycle = ['lime', 'coral', 'blue', 'violet', 'amber']
const legacyDemoIds = new Set(['horn', 'bruh', 'applause', 'laser', 'siren', 'glitch', 'bubbles', 'custom'])

function App() {
  return window.location.pathname.replace(/\/$/, '') === '/remote' ? <Remote /> : <Studio />
}

function Studio() {
  const [page, setPage] = useState<'pads' | 'voice' | 'settings'>('pads')
  const [pads, setPads] = useState<SoundPad[]>(() => {
    try {
      const saved = localStorage.getItem('sonicflow-pads')
      return saved
        ? (JSON.parse(saved) as Partial<SoundPad>[])
          .filter((pad) => !legacyDemoIds.has(pad.id ?? '') && typeof pad.audioData === 'string')
          .map((pad) => ({
            ...pad,
            key: typeof pad.key === 'string' ? pad.key : '',
            volume: typeof pad.volume === 'number' && Number.isFinite(pad.volume) ? Math.max(0, Math.min(100, pad.volume)) : 100,
          }) as SoundPad)
        : []
    } catch {
      return []
    }
  })
  const [voice, setVoice] = useState<VoiceSettings>(() => {
    try {
      const saved = localStorage.getItem('sonicflow-voice')
      return saved ? { ...defaultVoiceSettings, ...JSON.parse(saved) as Partial<VoiceSettings> } : defaultVoiceSettings
    } catch {
      return defaultVoiceSettings
    }
  })
  const [soundVolume, setSoundVolume] = useState(78)
  const [padMonitorEnabled, setPadMonitorEnabled] = useState(() => localStorage.getItem('sonicflow-pad-monitor') !== 'false')
  const [isMicOn, setIsMicOn] = useState(false)
  const [micStarting, setMicStarting] = useState(false)
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [inputId, setInputId] = useState(() => localStorage.getItem('sonicflow-mic-input') ?? '')
  const [outputId, setOutputId] = useState(() => localStorage.getItem('sonicflow-mic-output') ?? '')
  const [monitorOutputId, setMonitorOutputId] = useState(() => localStorage.getItem('sonicflow-monitor-output') ?? '')
  const [monitorEnabled, setMonitorEnabled] = useState(false)
  const [controllerCount, setControllerCount] = useState(0)
  const [connectionUrl, setConnectionUrl] = useState(() => window.sonicflow ? '' : `${window.location.origin}/remote`)
  const [showPairing, setShowPairing] = useState(false)
  const [bindingId, setBindingId] = useState<string | null>(null)
  const [activePad, setActivePad] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const audioRef = useRef<AudioEngine | null>(null)
  const padsRef = useRef(pads)
  const playPadRef = useRef<(id: string, announce?: boolean) => void>(() => {})
  const socketRef = useRef<Socket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  padsRef.current = pads

  const getAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new AudioEngine()
      if (!padMonitorEnabled) void audioRef.current.setPadMonitoring(false)
    }
    return audioRef.current
  }

  useEffect(() => {
    const socket = io('http://localhost:4317')
    socketRef.current = socket
    socket.on('controller:count', (count: number) => {
      setControllerCount(count)
      if (count > 0) socket.emit('pads:update', padsRef.current.map(({ id, title, tint, key }) => ({ id, title, tint, key })))
    })
    socket.on('pad:play', (id: string) => playPadRef.current(id, false))
    socket.on('connect', () => socket.emit('pads:update', padsRef.current.map(({ id, title, tint, key }) => ({ id, title, tint, key }))))
    if (window.sonicflow) void window.sonicflow.getConnectionUrl().then(setConnectionUrl)
    return () => {
      socket.disconnect()
      audioRef.current?.stopMicrophone()
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('sonicflow-pads', JSON.stringify(pads))
    } catch {
      showMessage('Не удалось сохранить звук: файл слишком большой')
    }
    socketRef.current?.emit('pads:update', pads.map(({ id, title, tint, key }) => ({ id, title, tint, key })))
  }, [pads])

  useEffect(() => {
    localStorage.setItem('sonicflow-voice', JSON.stringify(voice))
    audioRef.current?.update(voice)
  }, [voice])

  useEffect(() => {
    localStorage.setItem('sonicflow-mic-input', inputId)
  }, [inputId])

  useEffect(() => {
    localStorage.setItem('sonicflow-mic-output', outputId)
  }, [outputId])

  useEffect(() => {
    localStorage.setItem('sonicflow-monitor-output', monitorOutputId)
  }, [monitorOutputId])

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const refresh = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputDevices(devices.filter((device) => device.kind === 'audioinput'))
      setOutputDevices(devices.filter((device) => device.kind === 'audiooutput'))
    }
    void refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName ?? '')) return
      if (bindingId) {
        event.preventDefault()
        const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
        setPads((current) => current.map((pad) => pad.id === bindingId ? { ...pad, key } : (pad.key ?? '').toLowerCase() === key.toLowerCase() ? { ...pad, key: '' } : pad))
        setBindingId(null)
        return
      }
      const pad = pads.find((item) => (item.key ?? '').toLowerCase() === event.key.toLowerCase())
      if (pad) {
        event.preventDefault()
        playPadRef.current(pad.id, true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pads, bindingId, soundVolume])

  function showMessage(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  function playPad(id: string, announce = true) {
    const pad = padsRef.current.find((item) => item.id === id)
    if (!pad) return
    getAudio().play(pad, soundVolume)
    setActivePad(id)
    window.setTimeout(() => setActivePad((current) => current === id ? null : current), 240)
    if (announce) socketRef.current?.emit('pad:play', id)
  }

  function stopAllPads() {
    audioRef.current?.stopAllPads()
    setActivePad(null)
  }

  async function togglePadMonitoring() {
    const enabled = !padMonitorEnabled
    try {
      await getAudio().setPadMonitoring(enabled)
      localStorage.setItem('sonicflow-pad-monitor', String(enabled))
      setPadMonitorEnabled(enabled)
    } catch {
      showMessage('Не удалось изменить прослушивание. Проверь устройство вывода.')
    }
  }

  playPadRef.current = playPad

  async function importSound(file?: File) {
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      showMessage('Выбери аудиофайл')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      showMessage('Для локального хранения выбери файл до 3 МБ')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const title = file.name.replace(/\.[^.]+$/, '').slice(0, 22).toUpperCase()
      setPads((current) => [...current, {
        id: `sound-${Date.now()}`, title, key: '', volume: 100,
        tint: tintCycle[current.length % tintCycle.length], audioData: String(reader.result),
      }])
      showMessage('Звук добавлен в пульт')
    }
    reader.readAsDataURL(file)
  }

  async function toggleMicrophone() {
    if (isMicOn) {
      audioRef.current?.stopMicrophone()
      setIsMicOn(false)
      setMonitorEnabled(false)
      return
    }
    setMicStarting(true)
    try {
      const engine = getAudio()
      await engine.startMicrophone(inputId, voice)
      await engine.setOutput(outputId)
      await engine.setMonitorOutput(monitorOutputId)
      await engine.setPadOutput(outputId)
      setIsMicOn(true)
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputDevices(devices.filter((device) => device.kind === 'audioinput'))
      setOutputDevices(devices.filter((device) => device.kind === 'audiooutput'))
      showMessage('Микрофон подключён к эффектам')
    } catch {
      showMessage('Не удалось открыть микрофон. Проверь разрешение и устройство.')
    } finally {
      setMicStarting(false)
    }
  }

  function changeVoice<K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) {
    setVoice((current) => ({ ...current, [key]: value, character: 'Custom' }))
  }

  function selectPreset(preset: typeof voicePresets[number]) {
    setVoice((current) => ({ ...current, ...preset.settings, character: preset.name }))
  }

  function selectOutput(device: string) {
    setOutputId(device)
    if (audioRef.current) {
      void audioRef.current.setOutput(device).catch(() => showMessage('Не удалось переключить голосовой выход'))
      void audioRef.current.setPadOutput(device).catch(() => showMessage('Не удалось переключить звуковой выход'))
    }
  }

  async function selectInput(device: string) {
    setInputId(device)
    if (!isMicOn || micStarting) return
    setMicStarting(true)
    try {
      const engine = getAudio()
      await engine.startMicrophone(device, voice)
      await engine.setOutput(outputId)
      await engine.setMonitorOutput(monitorOutputId)
      await engine.setPadOutput(outputId)
      if (monitorEnabled) await engine.setMonitoring(true)
      showMessage('Входной микрофон переключён')
    } catch {
      showMessage('Не удалось переключить микрофон. Проверь устройство и разрешение.')
    } finally {
      setMicStarting(false)
    }
  }

  function selectMonitorOutput(device: string) {
    setMonitorOutputId(device)
    if (audioRef.current) {
      void audioRef.current.setMonitorOutput(device).catch(() => showMessage('Не удалось переключить устройство самопрослушивания'))
    }
  }

  async function toggleMonitoring() {
    if (!isMicOn || micStarting) return
    const enabled = !monitorEnabled
    try {
      const engine = getAudio()
      await engine.setMonitorOutput(monitorOutputId)
      await engine.setMonitoring(enabled)
      setMonitorEnabled(enabled)
    } catch {
      showMessage('Не удалось включить самопрослушивание. Проверь устройство вывода.')
    }
  }

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar">
        <div className="studio-brand"><span className="brand-mark"><AudioLines size={19} /></span><span className="brand-name">SONIC<span>FLOW</span></span></div>
        <div className="sidebar-label">СТУДИЯ</div>
        <nav className="side-nav" aria-label="Разделы">
          <button className={page === 'pads' ? 'side-link active' : 'side-link'} onClick={() => setPage('pads')}><Waves size={19} /><span>Звуки</span></button>
          <button className={page === 'voice' ? 'side-link active' : 'side-link'} onClick={() => setPage('voice')}><Mic size={19} /><span>Голос</span></button>
          <button className={page === 'settings' ? 'side-link active' : 'side-link'} onClick={() => setPage('settings')}><Settings2 size={19} /><span>Настройки</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-live"><span className="live-dot" /><span>ЛОКАЛЬНАЯ СЕССИЯ</span></div><span className="sidebar-version">STUDIO 01 <span>·</span> v1.0</span></div>
      </aside>

      <div className="studio-main">
        <header className="topbar">
          <div className="breadcrumb"><span>РАБОЧЕЕ ПРОСТРАНСТВО</span><ChevronDown size={14} /><strong>{page === 'pads' ? 'Звуковая панель' : page === 'voice' ? 'Voice changer' : 'Настройки звука'}</strong></div>
          <div className="topbar-actions">
            <span className={`status-pill ${isMicOn ? 'on-air' : ''}`}><span />{isMicOn ? 'В ЭФИРЕ' : 'ГОТОВ К ЭФИРУ'}</span>
            <button className={`controller-button ${controllerCount ? 'controller-online' : ''}`} onClick={() => setShowPairing((current) => !current)} title="Подключить телефон"><Smartphone size={17} /><span>{controllerCount ? `${controllerCount} ПУЛЬТ` : 'ПОДКЛЮЧИТЬ ПУЛЬТ'}</span></button>
            <button className="icon-button help-button" title="Справка" onClick={() => showMessage('Для звонков выбери CABLE Output в настройках микрофона')}><CircleHelp size={17} /></button>
          </div>
        </header>

        {showPairing && <div className="pairing-popover">
          <div className="pairing-top"><div><span className="eyebrow">СВЯЗЬ С ТЕЛЕФОНОМ</span><h3>Пульт на ладони</h3></div><button className="icon-button" onClick={() => setShowPairing(false)} title="Закрыть"><X size={17} /></button></div>
          {connectionUrl ? <QRCodeSVG value={connectionUrl} size={164} level="M" bgColor="#f4f5ed" fgColor="#151a15" /> : <div className="qr-placeholder"><Smartphone size={22} /></div>}
          <p>Подключи оба устройства к одной Wi-Fi сети и отсканируй код.</p><span className="pairing-url">{connectionUrl.replace(/^https?:\/\//, '')}</span>
          <div className="pairing-state"><span className={controllerCount ? 'live-dot' : 'idle-dot'} />{controllerCount ? 'Телефон подключён' : 'Ожидание подключения'}</div>
        </div>}

        <main className="studio-content">
          {page === 'pads' ? <>
            <section className="page-heading"><div><p className="eyebrow">ТВОЯ КНОПОЧНАЯ ПАНЕЛЬ</p><h1>Sound pad<span className="heading-period">.</span></h1><p className="page-subtitle">Только твои звуки. Нажми кнопку или клавишу запуска.</p></div><div className="page-heading-actions"><button className="stop-button" onClick={stopAllPads} disabled={pads.length === 0} title="Остановить все звуки"><Square size={14} fill="currentColor" /><span>ОСТАНОВИТЬ</span></button><button className="primary-button" onClick={() => fileInputRef.current?.click()}><Plus size={17} />Добавить звук</button></div><input ref={fileInputRef} hidden type="file" accept="audio/*" onChange={(event) => { void importSound(event.target.files?.[0]); event.target.value = '' }} /></section>

            <div className="pads-layout">
              <section className="pads-section">
                <div className="section-heading"><div><h2>МОИ ЗВУКИ</h2><span className="subtle-count">{String(pads.length).padStart(2, '0')} ЗВУКОВ</span></div><button className="text-button" onClick={() => fileInputRef.current?.click()}><Upload size={15} />ИМПОРТ</button></div>
                <div className="sound-grid">
                  {pads.map((pad, index) => <article className={`sound-pad tone-${pad.tint} ${activePad === pad.id ? 'pad-playing' : ''}`} key={pad.id}>
                    <button className="pad-trigger" onClick={() => playPad(pad.id)} aria-label={`Воспроизвести ${pad.title}`}>
                      <span className="pad-topline"><span className="pad-number">{String(index + 1).padStart(2, '0')}</span><span className="pad-symbol"><Volume2 size={18} /></span></span>
                      <span className="pad-wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></span>
                      <span className="pad-title">{pad.title}</span><span className="pad-caption">ЗАГРУЖЕННЫЙ СЭМПЛ</span>
                    </button>
                    <label className="pad-volume-control"><Volume2 size={12} /><input type="range" min="0" max="100" value={pad.volume} aria-label={`Громкость ${pad.title}`} onChange={(event) => { const volume = Number(event.target.value); setPads((current) => current.map((item) => item.id === pad.id ? { ...item, volume } : item)) }} /><output>{pad.volume}%</output></label>
                    <div className="pad-actions"><button className={`key-binding ${bindingId === pad.id ? 'binding' : ''}`} onClick={() => setBindingId((current) => current === pad.id ? null : pad.id)} title="Назначить клавишу"><Keyboard size={13} /><span>{bindingId === pad.id ? 'НАЖМИ' : pad.key || '—'}</span></button>{pad.audioData && <button className="remove-pad" title="Удалить звук" onClick={() => setPads((current) => current.filter((item) => item.id !== pad.id))}><X size={14} /></button>}</div>
                  </article>)}
                  <button className="add-pad" onClick={() => fileInputRef.current?.click()}><span className="add-pad-icon"><Plus size={20} /></span><span>Добавить свой звук</span><small>MP3 · WAV · OGG</small></button>
                </div>
                <div className="pads-tip"><Keyboard size={15} /><span>Быстрый запуск</span><span className="keycap">1</span><span className="keycap">–</span><span className="keycap">8</span><span className="tip-muted">или задай клавишу для каждого звука</span></div>
              </section>

              <aside className="mixer-rail">
                <div className="rail-title"><span className="rail-icon"><Radio size={16} /></span><div><b>ВЫХОД ЗВУКА</b><small>МАРШРУТИЗАЦИЯ</small></div><button className="icon-button mini" title="Настройки вывода"><Settings2 size={15} /></button></div>
                <div className="route-display"><span className="route-led" /><div><b>СИСТЕМНЫЙ ВЫХОД</b><small>{outputDevices.find((device) => device.deviceId === outputId)?.label || 'Устройство по умолчанию'}</small></div></div>
                <DeviceSelect label="УСТРОЙСТВО ВЫВОДА" value={outputId} devices={outputDevices} onChange={selectOutput} />
                <button className={`pad-monitor-toggle ${padMonitorEnabled ? 'pad-monitor-on' : ''}`} onClick={() => void togglePadMonitoring()} aria-pressed={padMonitorEnabled}><Headphones size={15} /><span>ПРОСЛУШИВАНИЕ SOUNDPAD</span><b>{padMonitorEnabled ? 'ON' : 'OFF'}</b></button>
                <div className="rail-divider" />
                <SliderControl label="ГРОМКОСТЬ SOUNDPAD" value={soundVolume} min={0} max={100} suffix="%" onChange={setSoundVolume} />
                <div className="sound-meter"><span style={{ width: `${soundVolume}%` }} /></div>
                <div className="rail-note"><Sparkles size={14} /><span>Звук идёт и в выбранный выход, и в устройство самопрослушивания. Выбери <b>CABLE Input</b>, чтобы отправлять его в VB-CABLE и продолжать слышать локально.</span></div>
                <button className="route-action" onClick={() => setPage('voice')}><Mic size={16} /><span>Открыть voice changer</span><span>↗</span></button>
              </aside>
            </div>
          </> : page === 'voice' ? <>
            <section className="page-heading voice-heading"><div><p className="eyebrow">ОБРАБОТКА В РЕАЛЬНОМ ВРЕМЕНИ</p><h1>Voice changer<span className="heading-period">.</span></h1><p className="page-subtitle">Настрой характер голоса и отправь его в любое приложение.</p></div><button className={`mic-toggle ${isMicOn ? 'mic-active' : ''}`} onClick={() => void toggleMicrophone()} disabled={micStarting}>{isMicOn ? <MicOff size={17} /> : <Mic size={17} />}{micStarting ? 'ПОДКЛЮЧАЕМ…' : isMicOn ? 'ОСТАНОВИТЬ МИКРОФОН' : 'ВКЛЮЧИТЬ МИКРОФОН'}</button></section>
            <div className="voice-layout">
              <section className="voice-console">
                <div className="voice-status-bar"><div><span className={isMicOn ? 'live-dot' : 'idle-dot'} /><b>{isMicOn ? 'МИКРОФОН АКТИВЕН' : 'МИКРОФОН В ОЖИДАНИИ'}</b></div><span className="latency-tag">LIVE AUDIO <span>·</span> REALTIME</span></div>
                <div className="device-row"><DeviceSelect label="МИКРОФОН / INPUT" value={inputId} devices={inputDevices} onChange={(device) => void selectInput(device)} /><DeviceSelect label="ГОЛОС / OUTPUT" value={outputId} devices={outputDevices} onChange={selectOutput} /></div>
                <div className="voice-divider" />
                <div className="voice-section-head"><div><p className="eyebrow">ПРЕСЕТЫ ХАРАКТЕРА</p><h2>Отправная точка</h2></div><span className="preset-selected">{voice.character.toUpperCase()}</span></div>
                <div className="preset-row">{voicePresets.map((preset) => <button className={`preset-button ${voice.character === preset.name ? 'preset-active' : ''}`} key={preset.name} onClick={() => selectPreset(preset)}><span className="preset-index">{preset.icon}</span><span>{preset.name}</span>{voice.character === preset.name && <Check size={14} />}</button>)}</div>
                <div className="voice-divider" />
                <div className="voice-section-head effects-title"><div><p className="eyebrow">ТОЧНАЯ НАСТРОЙКА</p><h2>Цепочка эффектов</h2></div><span className="effect-live"><span className="live-dot" />DSP</span></div>
                <div className="effects-grid">
                  <SliderControl label="ВЫСОТА ТОНА" value={voice.pitch} min={-12} max={12} suffix=" st" onChange={(value) => changeVoice('pitch', value)} format={(value) => `${value > 0 ? '+' : ''}${value} st`} />
                  <SliderControl label="ТЁПЛЫЙ DRIVE" value={voice.drive} min={0} max={100} suffix="%" onChange={(value) => changeVoice('drive', value)} />
                  <SliderControl label="ЭХО / DELAY" value={voice.echo} min={0} max={100} suffix="%" onChange={(value) => changeVoice('echo', value)} />
                  <SliderControl label="ПРОСТРАНСТВО" value={voice.space} min={0} max={100} suffix="%" onChange={(value) => changeVoice('space', value)} />
                  <SliderControl label="ТОН / FILTER" value={voice.tone} min={600} max={12000} suffix=" Hz" onChange={(value) => changeVoice('tone', value)} format={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${value} Hz`} />
                  <SliderControl label="ВЫХОДНОЙ УРОВЕНЬ" value={voice.volume} min={0} max={120} suffix="%" onChange={(value) => changeVoice('volume', value)} />
                </div>
                <div className="voice-footer-note"><Volume2 size={15} /><span>Для Discord, OBS и игр выбери <b>CABLE Output</b> в качестве микрофона.</span></div>
              </section>
              <aside className="voice-side-rail">
                <div className="signal-card"><div className="signal-heading"><span>СИГНАЛ</span><MoreHorizontal size={17} /></div><div className={`signal-visual ${isMicOn ? 'signal-moving' : ''}`}><div className="signal-center"><AudioLines size={25} /></div><div className="signal-bars">{Array.from({ length: 20 }, (_, index) => <i key={index} style={{ '--bar': `${18 + ((index * 17 + 13) % 68)}%`, '--delay': `${index * 31}ms` } as React.CSSProperties} />)}</div></div><div className="signal-meter"><span style={{ height: isMicOn ? '62%' : '4%' }} /></div><div className="signal-scale"><span>-48 dB</span><span>-24</span><span>0 dB</span></div><div className="signal-foot"><span>INPUT LEVEL</span><b>{isMicOn ? '−12.4 dB' : '−∞ dB'}</b></div></div>
                <div className="output-card"><div className="output-card-heading"><span className="output-icon"><Headphones size={17} /></span><div><b>ВИРТУАЛЬНЫЙ КАБЕЛЬ</b><small>VB-CABLE ROUTING</small></div></div><div className="cable-flow"><span>MIC</span><i /><span className={isMicOn ? 'flow-on' : ''}>FX</span><i /><span className="cable-target">CABLE<br />INPUT</span></div><p>Обработанный голос появится на виртуальном микрофоне <b>CABLE Output</b>.</p><button onClick={() => showMessage('В Windows: Параметры звука → Ввод → CABLE Output')}>Проверить настройку <span>↗</span></button></div>
                <button className={`monitor-switch ${monitorEnabled ? 'monitor-active' : ''}`} onClick={() => void toggleMonitoring()} disabled={!isMicOn || micStarting} aria-pressed={monitorEnabled}><span className="monitor-icon">{monitorEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</span><span className="monitor-copy"><b>Прослушать свой голос</b><small>{monitorEnabled ? 'Вывод в выбранные наушники' : 'Самопрослушивание выключено'}</small></span><span className={monitorEnabled ? 'monitor-on' : 'monitor-off'}>{monitorEnabled ? 'ON' : 'OFF'}</span></button>
              </aside>
            </div>
          </> : <>
            <section className="page-heading"><div><p className="eyebrow">УСТРОЙСТВА И МАРШРУТИЗАЦИЯ</p><h1>Настройки<span className="heading-period">.</span></h1><p className="page-subtitle">Выбери микрофоны и устройство для самопрослушивания.</p></div></section>
            <section className="settings-console">
              <div className="voice-section-head"><div><p className="eyebrow">АУДИОУСТРОЙСТВА</p><h2>Микрофоны и выходы</h2></div><span className="preset-selected">СОХРАНЯЮТСЯ АВТОМАТИЧЕСКИ</span></div>
              <div className="settings-device-grid">
                <DeviceSelect label="ВХОДНОЙ МИКРОФОН" value={inputId} devices={inputDevices} onChange={(device) => void selectInput(device)} />
                <DeviceSelect label="ВЫХОД ОБРАБОТАННОГО ГОЛОСА" value={outputId} devices={outputDevices} onChange={selectOutput} />
                <DeviceSelect label="УСТРОЙСТВО САМОПРОСЛУШИВАНИЯ" value={monitorOutputId} devices={outputDevices} onChange={selectMonitorOutput} />
              </div>
              <div className="settings-note"><Headphones size={17} /><span>Для звонков выбери <b>CABLE Input</b> как выход голоса, а <b>CABLE Output</b> как микрофон в Discord или OBS. Самопрослушивание направляется в отдельное устройство и не смешивается с виртуальным кабелем.</span></div>
              <div className="settings-actions"><button className={`mic-toggle ${isMicOn ? 'mic-active' : ''}`} onClick={() => void toggleMicrophone()} disabled={micStarting}>{isMicOn ? <MicOff size={16} /> : <Mic size={16} />}{micStarting ? 'ПОДКЛЮЧАЕМ…' : isMicOn ? 'ОСТАНОВИТЬ МИКРОФОН' : 'ВКЛЮЧИТЬ МИКРОФОН'}</button><span className="settings-mic-status"><span className={isMicOn ? 'live-dot' : 'idle-dot'} />{isMicOn ? 'МИКРОФОН АКТИВЕН' : 'МИКРОФОН ВЫКЛЮЧЕН'}</span></div>
            </section>
          </>}
        </main>
        <footer className="statusbar"><div><span className={isMicOn ? 'live-dot' : 'idle-dot'} />{isMicOn ? 'АУДИОПОТОК АКТИВЕН' : 'ГОТОВ К РАБОТЕ'}</div><div><span className="statusbar-spark">◈</span> LOCAL AUDIO ENGINE</div><div>44.1 kHz <span>·</span> STEREO <span>·</span> {controllerCount ? `${controllerCount} REMOTE` : 'REMOTE READY'}</div></footer>
      </div>
      {toast && <div className="toast-message"><Check size={15} />{toast}</div>}
    </div>
  )
}

type DeviceSelectProps = { label: string; value: string; devices: MediaDeviceInfo[]; onChange: (value: string) => void }

function DeviceSelect({ label, value, devices, onChange }: DeviceSelectProps) {
  return <label className="device-select"><span>{label}</span><span className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Системное устройство</option>{devices.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `${label.includes('МИКРОФОН') ? 'Микрофон' : 'Выход'} ${index + 1}`}</option>)}</select><ChevronDown size={14} /></span></label>
}

type SliderControlProps = { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void; format?: (value: number) => string }

function SliderControl({ label, value, min, max, suffix, onChange, format }: SliderControlProps) {
  const progress = ((value - min) / (max - min)) * 100
  return <label className="slider-control"><span className="slider-label"><span>{label}</span><b>{format ? format(value) : `${value}${suffix}`}</b></span><input type="range" min={min} max={max} value={value} style={{ '--range-progress': `${progress}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

export default App
