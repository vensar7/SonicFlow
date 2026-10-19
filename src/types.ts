export type SoundPad = {
  id: string
  title: string
  key: string
  tint: string
  volume: number
  audioData?: string
}

export type VoiceSettings = {
  pitch: number
  drive: number
  echo: number
  space: number
  tone: number
  volume: number
  character: string
}

export const defaultVoiceSettings: VoiceSettings = {
  pitch: 0,
  drive: 0,
  echo: 0,
  space: 10,
  tone: 12000,
  volume: 80,
  character: 'Natural',
}