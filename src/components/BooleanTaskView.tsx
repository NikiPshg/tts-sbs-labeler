import { Check, HelpCircle, X } from 'lucide-react'
import type { BooleanChoice, BooleanTask } from '../types'
import { AudioPlayer } from './AudioPlayer'

interface BooleanTaskViewProps {
  task: BooleanTask
  answer?: BooleanChoice
  onAnswer: (answer: BooleanChoice) => void
}

const options: Array<{
  value: BooleanChoice
  label: string
  shortcut: string
  icon: typeof Check
}> = [
  { value: 'yes', label: 'Да', shortcut: '1', icon: Check },
  { value: 'no', label: 'Нет', shortcut: '2', icon: X },
  { value: 'unsure', label: 'Не разобрать', shortcut: '0', icon: HelpCircle },
]

export function BooleanTaskView({ task, answer, onAnswer }: BooleanTaskViewProps) {
  return (
    <div className="task-view boolean-view">
      <div className="task-heading">
        <span className="task-type task-type--boolean">Аудио-вопрос</span>
        <h1>{task.question}</h1>
        {task.hint && <p>{task.hint}</p>}
      </div>

      <blockquote className="prompt-text">«{task.text}»</blockquote>

      <div className="single-audio">
        <div className="single-audio-label">Прослушайте запись</div>
        <AudioPlayer audio={task.audio} tone="neutral" />
      </div>

      <div className="boolean-options">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.value}
              className={`boolean-button boolean-button--${option.value} ${answer === option.value ? 'is-selected' : ''}`}
              onClick={() => onAnswer(option.value)}
            >
              <span><Icon size={21} /></span>
              {option.label}
              <kbd>{option.shortcut}</kbd>
            </button>
          )
        })}
      </div>
    </div>
  )
}
