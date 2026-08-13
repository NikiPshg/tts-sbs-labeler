import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public/audio')
mkdirSync(output, { recursive: true })

const sampleRate = 22050

function createWave(filename, frequencies, length = 2.8) {
  const frames = Math.floor(sampleRate * length)
  const dataSize = frames * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / sampleRate
    const segment = Math.min(frequencies.length - 1, Math.floor(time / (length / frequencies.length)))
    const envelope = Math.min(1, time * 8, (length - time) * 6)
    const pulse = 0.65 + 0.35 * Math.sin(time * Math.PI * 3.2)
    const fundamental = Math.sin(2 * Math.PI * frequencies[segment] * time)
    const harmonic = Math.sin(2 * Math.PI * frequencies[segment] * 2.02 * time) * 0.22
    const sample = Math.max(-1, Math.min(1, (fundamental + harmonic) * envelope * pulse * 0.24))
    buffer.writeInt16LE(Math.floor(sample * 32767), 44 + frame * 2)
  }

  writeFileSync(resolve(output, filename), buffer)
}

createWave('sample-a.wav', [178, 202, 190, 215, 184])
createWave('sample-b.wav', [184, 196, 224, 205, 192])
createWave('sample-question.wav', [175, 186, 201, 224, 268])
