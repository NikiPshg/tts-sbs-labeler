import { ArrowRight, BarChart3, Check, Clock3, Headphones, Sparkles, Target } from 'lucide-react'
import { getConsensus, labelerStats } from '../analytics'
import type { Annotation, AppUser, LabelingTask } from '../types'
import { Avatar } from './Avatar'

interface AnnotatorHomeProps {
  user: AppUser
  tasks: LabelingTask[]
  annotations: Annotation[]
  onStart: () => void
}

export function AnnotatorHome({ user, tasks, annotations, onStart }: AnnotatorHomeProps) {
  const stats = labelerStats(user, tasks, annotations)
  const assigned = tasks.filter((task) => task.assigneeIds?.includes(user.id))
  const userAnswers = new Map(
    annotations.filter((annotation) => annotation.userId === user.id).map((annotation) => [annotation.taskId, annotation]),
  )
  const remaining = assigned.filter((task) => !userAnswers.has(task.id))
  const estimatedMinutes = Math.max(1, Math.ceil(remaining.length * 0.6))

  return (
    <main className="annotator-home">
      <section className="annotator-welcome">
        <div className="welcome-copy">
          <span className="welcome-avatar"><Avatar user={user} size="lg" /><i><Sparkles size={14} /></i></span>
          <div><span className="eyebrow">Личный кабинет</span><h1>Привет, {user.name.split(' ')[0]}!</h1><p>{remaining.length ? 'У вас есть свежие задания для разметки.' : 'Все назначенные задания уже размечены.'}</p></div>
        </div>
        <button className="start-labeling-button" onClick={onStart} disabled={!assigned.length}>
          <Headphones size={20} />
          <span><strong>{remaining.length ? 'Продолжить разметку' : 'Проверить ответы'}</strong><small>{remaining.length ? `${remaining.length} заданий · ~${estimatedMinutes} мин` : `${assigned.length} выполнено`}</small></span>
          <ArrowRight size={19} />
        </button>
      </section>

      <section className="personal-metrics">
        <article>
          <span className="metric-icon metric-icon--violet"><Target size={20} /></span>
          <div><small>Мой прогресс</small><strong>{stats.progress}%</strong><p>{stats.completed} из {stats.assigned} заданий</p></div>
          <div className="personal-ring" style={{ '--ring-progress': `${stats.progress * 3.6}deg` } as React.CSSProperties}><i /></div>
        </article>
        <article>
          <span className="metric-icon metric-icon--green"><BarChart3 size={20} /></span>
          <div><small>Совпадение с остальными</small><strong>{stats.agreement.value === null ? '—' : `${stats.agreement.value}%`}</strong><p>{stats.agreement.comparable ? `Сравнено заданий: ${stats.agreement.comparable}` : 'Пока недостаточно общих ответов'}</p></div>
        </article>
        <article>
          <span className="metric-icon metric-icon--orange"><Clock3 size={20} /></span>
          <div><small>Осталось</small><strong>{stats.remaining}</strong><p>примерно {estimatedMinutes} минут работы</p></div>
        </article>
      </section>

      <section className="annotator-history admin-card">
        <header className="admin-card-header">
          <div><h3>Мои задания</h3><p>Вам показываются только назначенные аудио</p></div>
          <span className="assignment-rule"><span>×</span> Перекрытие ограничивает выдачу</span>
        </header>
        <div className="annotator-task-list">
          {assigned.map((task, index) => {
            const answer = userAnswers.get(task.id)
            const result = getConsensus(task, annotations)
            return (
              <div key={task.id}>
                <span className={`task-index ${answer ? 'is-done' : ''}`}>{answer ? <Check size={14} /> : index + 1}</span>
                <div className="activity-copy"><strong>{task.text}</strong><span>{task.type === 'pairwise' ? 'A/B сравнение' : task.question}</span></div>
                <div className="my-task-status">
                  {answer ? <span className="status-chip status-chip--done">Готово</span> : <span className="status-chip status-chip--work">Ожидает вас</span>}
                  <small>{result.count}/{result.required} ответов собрано</small>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
