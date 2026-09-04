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
  const active = controls.filter((task) => task.controlActive).length

  return (
    <>
      <section className="admin-card control-intro">
        <header className="admin-card-header">
          <div>
            <h3>Контрольные задания (ханипоты)</h3>
            <p>
              Калибровочный набор: эти клипы разметчики не видят. Прослушайте каждый и поставьте
              эталонный ответ. Потом из размеченных отбираются ханипоты — их подмешивают
              разметчикам в очередь, и платформа считает, как часто человек совпал с вашим эталоном.
            </p>
            <p className="control-note">
              Оценивайте каждую запись отдельно, не сравнивая с соседними: один и тот же текст
              встречается дважды, порядок перемешан намеренно.
            </p>
          </div>
          <div className="control-counters">
            <span className={`status-chip ${labeled === controls.length && controls.length ? 'status-chip--done' : 'status-chip--work'}`}>
              <ShieldCheck size={15} /> {labeled} / {controls.length} с эталоном
            </span>
            {active > 0 && (
              <span className="status-chip status-chip--done">{active} в очереди разметчиков</span>
            )}
          </div>
        </header>
      </section>

      {!controls.length && (
        <section className="admin-card">
          <p className="control-empty">
            Контрольных заданий пока нет. Загрузите калибровочный набор командой
            <code> cli.py import ... --control</code> — или включите список ниже и выберите вручную.
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
              <strong>
                Клип {task.code ?? task.id}
                {task.controlActive && <em className="control-live"> · в очереди разметчиков</em>}
              </strong>
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
                  <div className="activity-copy"><strong>Клип {task.code ?? task.id}</strong><span>{task.text}</span></div>
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
