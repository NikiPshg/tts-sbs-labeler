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

const UNGROUPED = 'Контрольные задания'

function isBoolean(task: LabelingTask): task is BooleanTask {
  return task.type === 'boolean'
}

function questionOf(task: LabelingTask) {
  return isBoolean(task) ? task.question : undefined
}

function ControlCard({ task, index, onSetControl, onFlag }: {
  task: LabelingTask
  index: number
  onSetControl: ControlPanelProps['onSetControl']
  onFlag: ControlPanelProps['onFlag']
}) {
  return (
    <section className="admin-card control-card">
      <header className="control-card-header">
        <span className="control-index">{index}</span>
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
  )
}

export function ControlPanel({ tasks, onSetControl, onFlag }: ControlPanelProps) {
  const [showPool, setShowPool] = useState(false)
  const [hideAnswered, setHideAnswered] = useState(true)

  const controls = useMemo(() => tasks.filter((task) => task.isControl), [tasks])
  const pool = useMemo(() => tasks.filter((task) => !task.isControl), [tasks])
  const labeled = controls.filter((task) => task.controlAnswer).length
  const active = controls.filter((task) => task.controlActive).length

  // Groups keep the server order; each is a separately loaded set with its own
  // question, so the admin can tell them apart without seeing the batch names.
  const groups = useMemo(() => {
    const map = new Map<string, LabelingTask[]>()
    controls.forEach((task) => {
      const key = task.controlGroup ?? UNGROUPED
      const bucket = map.get(key)
      if (bucket) bucket.push(task)
      else map.set(key, [task])
    })
    return [...map.entries()]
  }, [controls])

  const remaining = controls.length - labeled

  return (
    <>
      <section className="admin-card control-intro">
        <header className="admin-card-header">
          <div>
            <h3>Контрольные задания</h3>
            <p>
              Эти клипы разметчики не видят. Прослушайте каждый и поставьте ответ.
              Оценивайте запись саму по себе, а не в сравнении с соседними.
            </p>
          </div>
          <div className="control-counters">
            <span className={`status-chip ${remaining === 0 && controls.length ? 'status-chip--done' : 'status-chip--work'}`}>
              <ShieldCheck size={15} /> {labeled} / {controls.length} с ответом
            </span>
            {active > 0 && (
              <span className="status-chip status-chip--done">{active} в очереди разметчиков</span>
            )}
          </div>
        </header>
        {labeled > 0 && (
          <label className="control-filter">
            <input
              type="checkbox"
              checked={hideAnswered}
              onChange={(event) => setHideAnswered(event.target.checked)}
            />
            Скрыть уже отвеченные ({labeled})
          </label>
        )}
      </section>

      {!controls.length && (
        <section className="admin-card">
          <p className="control-empty">
            Контрольных заданий пока нет. Загрузите набор командой
            <code> cli.py import ... --control</code> — или включите список ниже и выберите вручную.
          </p>
          <button className="text-action" onClick={() => setShowPool((value) => !value)}>
            {showPool ? 'Скрыть список заданий' : 'Выбрать вручную'}
          </button>
        </section>
      )}

      {groups.map(([name, items]) => {
        const visible = hideAnswered ? items.filter((task) => !task.controlAnswer) : items
        const done = items.filter((task) => task.controlAnswer).length
        const question = questionOf(items[0])
        return (
          <div className="control-group" key={name}>
            <header className="control-group-header">
              <div>
                <h3>{name}</h3>
                {question && <p>Вопрос: «{question}»</p>}
              </div>
              <span className={`status-chip ${done === items.length ? 'status-chip--done' : 'status-chip--work'}`}>
                {done} / {items.length}
              </span>
            </header>
            {visible.length
              ? visible.map((task) => (
                <ControlCard
                  key={task.id}
                  task={task}
                  index={items.indexOf(task) + 1}
                  onSetControl={onSetControl}
                  onFlag={onFlag}
                />
              ))
              : <p className="control-empty control-group-done">Все клипы этой группы отвечены.</p>}
          </div>
        )
      })}

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
