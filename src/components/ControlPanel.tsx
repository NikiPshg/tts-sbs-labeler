import { useMemo, useState } from 'react'
import { Check, HelpCircle, ShieldCheck, Star, X } from 'lucide-react'
import type { AnswerValue, BooleanTask, LabelingTask } from '../types'
import { AudioPlayer } from './AudioPlayer'

interface ControlPanelProps {
  tasks: LabelingTask[]
  onSetControl: (taskId: string, value: AnswerValue | null) => void
  onFlag: (taskId: string, isControl: boolean) => void
}

const options: Array<{ value: AnswerValue; label: string; icon: typeof Check }> = [
  { value: 'yes', label: 'Да', icon: Check },
  { value: 'no', label: 'Нет', icon: X },
  { value: 'unsure', label: 'Не разобрать', icon: HelpCircle },
]

function isBoolean(task: LabelingTask): task is BooleanTask {
  return task.type === 'boolean'
}

export function ControlPanel({ tasks, onSetControl, onFlag }: ControlPanelProps) {
  const [showPool, setShowPool] = useState(false)
  const controls = useMemo(() => tasks.filter((task) => task.isControl), [tasks])
  const pool = useMemo(() => tasks.filter((task) => !task.isControl), [tasks])
  const labeled = controls.filter((task) => task.controlAnswer).length

  return (
    <>
      <section className="admin-card control-intro">
        <header className="admin-card-header">
          <div>
            <h3>Контрольные задания (ханипоты)</h3>
            <p>
              Разметьте каждое эталонным ответом. Контрольные показываются всем разметчикам
              вперемешку с обычными, а платформа считает, как часто человек совпал с вашим эталоном.
            </p>
          </div>
          <span className={`status-chip ${labeled === controls.length && controls.length ? 'status-chip--done' : 'status-chip--work'}`}>
            <ShieldCheck size={15} /> {labeled} / {controls.length} с эталоном
          </span>
        </header>
      </section>

      {!controls.length && (
        <section className="admin-card">
          <p className="control-empty">
            Контрольных заданий пока нет. Пометьте их на сервере командой
            <code> cli.py pick-honeypots --count 15</code> — или включите список ниже и выберите вручную.
          </p>
          <button className="text-action" onClick={() => setShowPool((value) => !value)}>
            {showPool ? 'Скрыть список заданий' : 'Выбрать вручную'}
          </button>
        </section>
      )}

      {controls.map((task, index) => (
        <section className="admin-card control-card" key={task.id}>
          <header className="control-card-header">
            <span className="control-index">{index + 1}</span>
            <div>
              <strong>{task.id}</strong>
              <span>«{task.text}»</span>
            </div>
            <button className="text-action" onClick={() => onFlag(task.id, false)}>
              Убрать из контрольных
            </button>
          </header>

          {isBoolean(task) ? <AudioPlayer audio={task.audio} tone="neutral" /> : null}

          <div className="control-options">
            {options.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  className={`boolean-button boolean-button--${option.value} ${task.controlAnswer === option.value ? 'is-selected' : ''}`}
                  onClick={() => onSetControl(task.id, option.value)}
                >
                  <span><Icon size={19} /></span>
                  {option.label}
                </button>
              )
            })}
            {task.controlAnswer && (
              <button className="text-action" onClick={() => onSetControl(task.id, null)}>
                Сбросить
              </button>
            )}
          </div>
        </section>
      ))}

      {(showPool || controls.length > 0) && (
        <section className="admin-card">
          <header className="admin-card-header">
            <div><h3>Остальные задания</h3><p>Можно добавить в контрольные</p></div>
            <button className="text-action" onClick={() => setShowPool((value) => !value)}>
              {showPool ? 'Свернуть' : `Показать (${pool.length})`}
            </button>
          </header>
          {showPool && (
            <div className="activity-list">
              {pool.slice(0, 200).map((task) => (
                <div className="activity-row" key={task.id}>
                  <span className="task-kind task-kind--boolean">Да/Нет</span>
                  <div className="activity-copy"><strong>{task.id}</strong><span>{task.text}</span></div>
                  <button className="text-action" onClick={() => onFlag(task.id, true)}>
                    <Star size={15} /> В контрольные
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}
