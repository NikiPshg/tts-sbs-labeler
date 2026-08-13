import { useState, type FormEvent } from 'react'
import { FileAudio, Minus, Plus, Upload, X } from 'lucide-react'
import type { LabelingTask } from '../types'

interface CreateTaskModalProps {
  defaultOverlap: number
  activeAnnotators: number
  onClose: () => void
  onCreate: (task: LabelingTask) => void
}

function readAudio(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface AudioFieldProps {
  label: string
  value: string
  fileName?: string
  onChange: (value: string, fileName?: string) => void
}

function AudioField({ label, value, fileName, onChange }: AudioFieldProps) {
  return (
    <div className="audio-upload-field">
      <div className="field-label">{label}</div>
      <div className="audio-upload-row">
        <span className="audio-file-icon"><FileAudio size={19} /></span>
        <div>
          <strong>{fileName ?? (value ? 'Аудио по ссылке' : 'Добавьте аудио')}</strong>
          <span>{fileName ? 'Файл сохранится в демо локально' : 'WAV, MP3 или URL'}</span>
        </div>
        <label className="file-button">
          <Upload size={16} /> Файл
          <input
            type="file"
            accept="audio/*"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) onChange(await readAudio(file), file.name)
            }}
          />
        </label>
      </div>
      <input
        className="form-input audio-url-input"
        type="url"
        value={value.startsWith('data:') ? '' : value}
        placeholder="или вставьте https://.../audio.wav"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

export function CreateTaskModal({ defaultOverlap, activeAnnotators, onClose, onCreate }: CreateTaskModalProps) {
  const [type, setType] = useState<LabelingTask['type']>('pairwise')
  const [text, setText] = useState('')
  const [question, setQuestion] = useState('Какой вариант звучит естественнее?')
  const [hint, setHint] = useState('Оценивайте интонацию, произношение и отсутствие артефактов.')
  const [audioA, setAudioA] = useState('')
  const [audioAName, setAudioAName] = useState<string>()
  const [audioB, setAudioB] = useState('')
  const [audioBName, setAudioBName] = useState<string>()
  const [overlap, setOverlap] = useState(defaultOverlap)

  const changeType = (nextType: LabelingTask['type']) => {
    setType(nextType)
    setQuestion(nextType === 'pairwise'
      ? 'Какой вариант звучит естественнее?'
      : 'Есть ли здесь вопросительная интонация?')
    setHint(nextType === 'pairwise'
      ? 'Оценивайте интонацию, произношение и отсутствие артефактов.'
      : 'Оценивайте только интонацию, не содержание текста.')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const base = {
      id: `${type === 'pairwise' ? 'sbs' : 'bool'}-${Date.now()}`,
      text: text.trim(),
      question: question.trim(),
      hint: hint.trim() || undefined,
      requiredAnnotations: overlap,
      createdAt: new Date().toISOString(),
    }

    if (type === 'pairwise') {
      onCreate({
        ...base,
        type,
        audioA: { src: audioA || './audio/sample-a.wav', label: 'Модель A' },
        audioB: { src: audioB || './audio/sample-b.wav', label: 'Модель B' },
      })
    } else {
      onCreate({
        ...base,
        type,
        audio: { src: audioA || './audio/sample-question.wav', label: 'Аудио' },
      })
    }
  }

  const maxOverlap = 7

  return (
    <div className="modal-backdrop create-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="create-task-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header className="create-modal-header">
          <div>
            <span className="eyebrow">Новое задание</span>
            <h2>Создать за пару минут</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        </header>

        <div className="form-section">
          <div className="field-label">Тип задания</div>
          <div className="task-type-tabs">
            <button type="button" className={type === 'pairwise' ? 'is-active' : ''} onClick={() => changeType('pairwise')}>
              <span>A/B</span><div><strong>Сравнение</strong><small>Выбрать лучшее аудио</small></div>
            </button>
            <button type="button" className={type === 'boolean' ? 'is-active' : ''} onClick={() => changeType('boolean')}>
              <span>Да</span><div><strong>Аудио-вопрос</strong><small>Да, нет или не уверен</small></div>
            </button>
          </div>
        </div>

        <div className="form-section form-grid-two">
          <label className="form-field form-field--wide">
            <span className="field-label">Текст для разметки</span>
            <textarea required value={text} onChange={(event) => setText(event.target.value)} placeholder="Введите текст, который должен звучать в аудио…" />
          </label>
          <label className="form-field">
            <span className="field-label">Вопрос разметчику</span>
            <input required className="form-input" value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="field-label">Подсказка <small>необязательно</small></span>
            <input className="form-input" value={hint} onChange={(event) => setHint(event.target.value)} />
          </label>
        </div>

        <div className={`form-section audio-fields ${type === 'boolean' ? 'audio-fields--single' : ''}`}>
          <AudioField
            label={type === 'pairwise' ? 'Аудио A' : 'Аудио'}
            value={audioA}
            fileName={audioAName}
            onChange={(value, name) => { setAudioA(value); setAudioAName(name) }}
          />
          {type === 'pairwise' && (
            <AudioField
              label="Аудио B"
              value={audioB}
              fileName={audioBName}
              onChange={(value, name) => { setAudioB(value); setAudioBName(name) }}
            />
          )}
        </div>

        <div className="overlap-picker">
          <div>
            <span className="field-label">Перекрытие</span>
            <strong>{overlap} {overlap === 1 ? 'разметчик' : overlap < 5 ? 'разметчика' : 'разметчиков'}</strong>
            <p>Задание увидят ровно {overlap}. После их ответов оно закроется.</p>
          </div>
          <div className="overlap-stepper">
            <button type="button" disabled={overlap <= 1} onClick={() => setOverlap((value) => value - 1)}><Minus size={17} /></button>
            <output>{overlap}</output>
            <button type="button" disabled={overlap >= maxOverlap} onClick={() => setOverlap((value) => value + 1)}><Plus size={17} /></button>
          </div>
        </div>
        {overlap > activeAnnotators && <p className="form-note">Сейчас активно {activeAnnotators}: свободные слоты будут заполнены после добавления новых разметчиков.</p>}

        <footer className="create-modal-footer">
          <button type="button" className="secondary-action" onClick={onClose}>Отмена</button>
          <button type="submit" className="primary-action">Создать и назначить</button>
        </footer>
      </form>
    </div>
  )
}
