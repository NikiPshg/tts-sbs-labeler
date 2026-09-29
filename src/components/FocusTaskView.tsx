import { HelpCircle, Minus } from 'lucide-react'
import type { FocusChoice, FocusTask } from '../types'
import { focusWords } from '../focus'
import { AudioPlayer } from './AudioPlayer'

interface FocusTaskViewProps {
  task: FocusTask
  answer?: FocusChoice
  onAnswer: (answer: FocusChoice) => void
}

export function FocusTaskView({ task, answer, onAnswer }: FocusTaskViewProps) {
  const words = focusWords(task.text)
  const selectedIndex = answer?.startsWith('word:') ? Number(answer.split(':')[1]) : -1

  return (
    <div className="task-view boolean-view focus-view">
      <div className="task-heading">
        <span className="task-type task-type--focus">Акцент</span>
        <h1>{task.question}</h1>
        {task.hint && <p>{task.hint}</p>}
      </div>

      <div className="single-audio">
        <div className="single-audio-label">Прослушайте запись</div>
        <AudioPlayer audio={task.audio} tone="neutral" />
      </div>

      <div className="focus-words" role="group" aria-label="Слова текста">
        {words.map((word, index) => (
          <button
            key={`${index}-${word}`}
            className={`focus-word ${selectedIndex === index ? 'is-selected' : ''}`}
            onClick={() => onAnswer(`word:${index}:${word}`)}
          >
            {word}
            {index < 9 && <kbd>{index + 1}</kbd>}
          </button>
        ))}
      </div>

      <div className="focus-extra">
        <button className={`boolean-button boolean-button--no ${answer === 'none' ? 'is-selected' : ''}`} onClick={() => onAnswer('none')}>
          <span><Minus size={21} /></span>
          Нет акцента
        </button>
        <button className={`boolean-button boolean-button--unsure ${answer === 'unsure' ? 'is-selected' : ''}`} onClick={() => onAnswer('unsure')}>
          <span><HelpCircle size={21} /></span>
          Не уверен
          <kbd>0</kbd>
        </button>
      </div>
    </div>
  )
}
