import type { SoundPad, VoiceSettings } from './types'

export class AudioEngine {
  private context = new AudioContext()
  private padGain = this.context.createGain()
  private stream?: MediaStream
  private source?: MediaStreamAudioSourceNode
  private pitchNode?: ScriptProcessorNode
  private lowpass?: BiquadFilterNode
  private shaper?: WaveShaperNode
  private delay?: DelayNode
  private delayFeedback?: GainNode
  private echoGain?: GainNode
  private reverbGain?: GainNode
  private voiceGain = this.context.createGain()
  private voiceDestination = this.context.createMediaStreamDestination()
  private padMonitorDestination = this.context.createMediaStreamDestination()
  private output = new Audio()
  private monitorOutput = new Audio()
  private padMonitorOutput = new Audio()
  private padMonitoringEnabled = true
  private padOutputId = ''
  private padMonitorOutputId = ''
  private pitch = 0
  private activePadStops = new Set<() => void>()

  constructor() {
    this.padGain.connect(this.context.destination)
    this.padGain.connect(this.padMonitorDestination)
    this.voiceGain.connect(this.voiceDestination)
    this.output.srcObject = this.voiceDestination.stream
    this.output.autoplay = true
    this.monitorOutput.srcObject = this.voiceDestination.stream
    this.monitorOutput.autoplay = true
    this.monitorOutput.muted = true
    this.padMonitorOutput.srcObject = this.padMonitorDestination.stream
    this.padMonitorOutput.autoplay = true
    this.padMonitorOutput.muted = true
  }

  async resume() {
    if (this.context.state === 'suspended') await this.context.resume()
  }

  async setOutput(deviceId: string) {
    const output = this.output as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    if (output.setSinkId) await output.setSinkId(deviceId)
  }

  async setMonitorOutput(deviceId: string) {
    const output = this.monitorOutput as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    const padOutput = this.padMonitorOutput as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    await Promise.all([
      output.setSinkId?.(deviceId),
      padOutput.setSinkId?.(deviceId),
    ])
    this.padMonitorOutputId = deviceId
    this.syncPadMonitorOutput()
  }

  async setMonitoring(enabled: boolean) {
    this.monitorOutput.muted = !enabled
    if (enabled) {
      await this.monitorOutput.play()
    } else {
      this.monitorOutput.pause()
    }
  }

  async setPadOutput(deviceId: string) {
    const context = this.context as AudioContext & { setSinkId?: (id: string) => Promise<void> }
    if (context.setSinkId) await context.setSinkId(deviceId)
    this.padOutputId = deviceId
    this.syncPadMonitorOutput()
  }

  async setPadMonitoring(enabled: boolean) {
    this.padMonitoringEnabled = enabled
    if (this.syncPadMonitorOutput()) {
      await this.padMonitorOutput.play()
    }
  }

  private syncPadMonitorOutput() {
    const shouldMirror = this.padMonitoringEnabled && this.padOutputId !== this.padMonitorOutputId
    this.padMonitorOutput.muted = !shouldMirror
    if (!shouldMirror) this.padMonitorOutput.pause()
    return shouldMirror
  }

  async startMicrophone(deviceId: string, settings: VoiceSettings) {
    await this.resume()
    const nextStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    this.stopMicrophone()
    this.stream = nextStream
    this.source = this.context.createMediaStreamSource(nextStream)
    this.pitchNode = this.context.createScriptProcessor(1024, 1, 1)
    this.lowpass = this.context.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.shaper = this.context.createWaveShaper()
    this.voiceGain = this.context.createGain()
    this.delay = this.context.createDelay(1)
    this.delay.delayTime.value = 0.24
    this.delayFeedback = this.context.createGain()
    this.echoGain = this.context.createGain()
    this.delayFeedback.gain.value = 0.32
    this.delay.connect(this.delayFeedback).connect(this.delay)
    this.delay.connect(this.echoGain).connect(this.voiceGain)
    const convolver = this.context.createConvolver()
    const impulseLength = Math.floor(this.context.sampleRate * 1.8)
    const impulse = this.context.createBuffer(2, impulseLength, this.context.sampleRate)
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const samples = impulse.getChannelData(channel)
      for (let index = 0; index < impulseLength; index += 1) {
        samples[index] = (Math.random() * 2 - 1) * (1 - index / impulseLength) ** 3
      }
    }
    convolver.buffer = impulse
    this.reverbGain = this.context.createGain()
    convolver.connect(this.reverbGain).connect(this.voiceGain)
    const compressor = this.context.createDynamicsCompressor()
    const silentMonitor = this.context.createGain()
    silentMonitor.gain.value = 0
    this.pitchNode.onaudioprocess = (event) => this.processPitch(event)
    this.pitchNode.connect(this.lowpass)
    this.lowpass.connect(this.shaper)
    this.shaper.connect(compressor)
    compressor.connect(this.voiceGain)
    compressor.connect(this.delay)
    compressor.connect(convolver)
    this.voiceGain.connect(this.voiceDestination)
    this.pitchNode.connect(silentMonitor)
    silentMonitor.connect(this.context.destination)
    this.source.connect(this.pitchNode)
    this.update(settings)
    void this.output.play()
  }

  stopMicrophone() {
    this.monitorOutput.pause()
    this.monitorOutput.muted = true
    this.stream?.getTracks().forEach((track) => track.stop())
    this.source?.disconnect()
    this.pitchNode?.disconnect()
    this.lowpass?.disconnect()
    this.shaper?.disconnect()
    this.delay?.disconnect()
    this.delayFeedback?.disconnect()
    this.echoGain?.disconnect()
    this.reverbGain?.disconnect()
    this.stream = undefined
    this.source = undefined
    this.pitchNode = undefined
  }

  update(settings: VoiceSettings) {
    this.pitch = settings.pitch
    if (this.lowpass) this.lowpass.frequency.setTargetAtTime(settings.tone, this.context.currentTime, 0.04)
    if (this.voiceGain) this.voiceGain.gain.setTargetAtTime(settings.volume / 100, this.context.currentTime, 0.04)
    if (this.echoGain) this.echoGain.gain.setTargetAtTime(settings.echo / 100 * 0.55, this.context.currentTime, 0.04)
    if (this.reverbGain) this.reverbGain.gain.setTargetAtTime(settings.space / 100 * 0.45, this.context.currentTime, 0.04)
    if (this.shaper) {
      const curve = new Float32Array(44100)
      const amount = settings.drive * 4
      for (let index = 0; index < curve.length; index += 1) {
        const x = (index * 2) / curve.length - 1
        curve[index] = amount === 0 ? x : Math.tanh(x * (1 + amount * 0.12)) / Math.tanh(1 + amount * 0.12)
      }
      this.shaper.curve = curve
      this.shaper.oversample = '4x'
    }
  }

  stopAllPads() {
    for (const stop of [...this.activePadStops]) stop()
  }

  play(pad: SoundPad, masterVolume: number) {
    if (!pad.audioData) return
    void this.resume()
    if (this.syncPadMonitorOutput()) void this.padMonitorOutput.play().catch(() => {})
    const volume = Math.max(0, Math.min(1, masterVolume / 100 * (pad.volume ?? 100) / 100))
    if (volume === 0) return
    const audio = new Audio(pad.audioData)
    audio.volume = 1
    const source = this.context.createMediaElementSource(audio)
    const gain = this.context.createGain()
    gain.gain.value = volume
    source.connect(gain).connect(this.padGain)
    const stop = this.trackPadStop(() => {
      audio.pause()
      audio.currentTime = 0
      source.disconnect()
      gain.disconnect()
    })
    audio.addEventListener('ended', stop, { once: true })
    void audio.play().catch(stop)
  }

  private trackPadStop(stopPlayback: () => void) {
    let active = true
    const stop = () => {
      if (!active) return
      active = false
      this.activePadStops.delete(stop)
      stopPlayback()
    }
    this.activePadStops.add(stop)
    return stop
  }

  private processPitch(event: AudioProcessingEvent) {
    const input = event.inputBuffer.getChannelData(0)
    const output = event.outputBuffer.getChannelData(0)
    if (Math.abs(this.pitch) < 0.05) {
      output.set(input)
      return
    }

    const ratio = 2 ** (this.pitch / 12)
    const span = Math.floor(this.context.sampleRate * 0.09)
    const buffer = this.pitchBuffer ?? new Float32Array(this.context.sampleRate * 0.25)
    this.pitchBuffer = buffer
    const cycleSize = Math.max(1, Math.floor(span / Math.abs(1 - ratio)))
    for (let index = 0; index < input.length; index += 1) {
      buffer[this.writeIndex] = input[index]
      this.phase = (this.phase + 1 / cycleSize) % 1
      const headA = ratio > 1 ? 1 - this.phase : this.phase
      const headB = (headA + 0.5) % 1
      const mixA = 0.5 - Math.cos(headA * Math.PI * 2) * 0.5
      const delayA = Math.max(1, Math.floor(span * (0.18 + headA * 0.7)))
      const delayB = Math.max(1, Math.floor(span * (0.18 + headB * 0.7)))
      const readA = buffer[(this.writeIndex - delayA + buffer.length) % buffer.length]
      const readB = buffer[(this.writeIndex - delayB + buffer.length) % buffer.length]
      output[index] = readA * mixA + readB * (1 - mixA)
      this.writeIndex = (this.writeIndex + 1) % buffer.length
    }
  }

  private pitchBuffer?: Float32Array
  private writeIndex = 0
  private phase = 0
}