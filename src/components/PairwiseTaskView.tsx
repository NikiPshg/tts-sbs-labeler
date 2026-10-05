import { Check, Equal } from 'lucide-react'
import type { PairwiseChoice, PairwiseTask } from '../types'
import { AudioPlayer } from './AudioPlayer'

interface PairwiseTaskViewProps {
  task: PairwiseTask
  answer?: PairwiseChoice
  onAnswer: (answer: PairwiseChoice) => void
}

export function PairwiseTaskView({ task, answer, onAnswer }: PairwiseTaskViewProps) {
  return (
    <div className="task-view">
      <div className="task-heading">
        <span className="task-type">A/B сравнение</span>
        <h1>{task.question ?? 'Какой вариант звучит лучше?'}</h1>
        {task.hint && <p>{task.hint}</p>}
      </div>

      <blockquote className="prompt-text">«{task.text}»</blockquote>

      <div className="comparison-grid">
        <section className={`candidate candidate--a ${answer === 'a' ? 'is-selected' : ''}`}>
          <div className="candidate-topline">
            <span className="candidate-letter">A</span>
            <span>Вариант A</span>
            {answer === 'a' && <Check size={18} />}
          </div>
          <AudioPlayer audio={task.audioA} tone="violet" />
          <button className="choice-button" onClick={() => onAnswer('a')}>
            {answer === 'a' ? 'Выбрано: A лучше' : 'A лучше'}
            <kbd>1</kbd>
          </button>
        </section>

        <div className="versus" aria-hidden="true">или</div>

        <section className={`candidate candidate--b ${answer === 'b' ? 'is-selected' : ''}`}>
          <div className="candidate-topline">
            <span className="candidate-letter">B</span>
            <span>Вариант B</span>
            {answer === 'b' && <Check size={18} />}
          </div>
          <AudioPlayer audio={task.audioB} tone="coral" />
          <button className="choice-button" onClick={() => onAnswer('b')}>
            {answer === 'b' ? 'Выбрано: B лучше' : 'B лучше'}
            <kbd>2</kbd>
          </button>
        </section>
      </div>

      <button
        className={`tie-button ${answer === 'tie' ? 'is-selected' : ''}`}
        onClick={() => onAnswer('tie')}
      >
        <Equal size={18} />
        {answer === 'tie' ? 'Отмечено: не знаю / не слышу разницы' : 'Не знаю / не слышу разницы'}
        <kbd>0</kbd>
      </button>
    </div>
  )
}
