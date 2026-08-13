import {
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  Gauge,
  Layers3,
  Plus,
  Settings,
  SlidersHorizontal,
  UserPlus,
  Users,
  AudioWaveform,
} from 'lucide-react'
import { answerLabels, getConsensus, labelerStats } from '../analytics'
import type { AdminSection, Annotation, AppUser, LabelingTask } from '../types'
import { Avatar } from './Avatar'

interface AdminDashboardProps {
  project: string
  section: AdminSection
  tasks: LabelingTask[]
  annotations: Annotation[]
  users: AppUser[]
  defaultOverlap: number
  onSectionChange: (section: AdminSection) => void
  onCreateTask: () => void
  onInvite: () => void
  onExport: () => void
  onTaskOverlap: (taskId: string, overlap: number) => void
  onDefaultOverlap: (overlap: number) => void
  onApplyDefault: () => void
  onToggleUser: (userId: string) => void
}

const sectionMeta: Record<AdminSection, { title: string; description: string }> = {
  overview: { title: 'Обзор проекта', description: 'Прогресс, качество и состояние разметки' },
  tasks: { title: 'Задания', description: 'Создавайте задания и управляйте перекрытием' },
  annotators: { title: 'Разметчики', description: 'Нагрузка, прогресс и согласие с остальными' },
  settings: { title: 'Настройки', description: 'Правила назначения и консенсуса проекта' },
}

function agreementTone(value: number | null) {
  if (value === null) return 'neutral'
  if (value >= 80) return 'good'
  if (value >= 60) return 'medium'
  return 'low'
}

function Overview({ tasks, annotations, users, onSectionChange }: Pick<AdminDashboardProps, 'tasks' | 'annotations' | 'users' | 'onSectionChange'>) {
  const labelers = users.filter((user) => user.role === 'annotator')
  const activeLabelers = labelers.filter((user) => user.status === 'active')
  const consensus = tasks.map((task) => getConsensus(task, annotations))
  const completed = consensus.filter((result) => result.complete).length
  const requiredAnswers = tasks.reduce((sum, task) => sum + (task.requiredAnnotations ?? 1), 0)
  const progress = requiredAnswers ? Math.round((annotations.length / requiredAnswers) * 100) : 0
  const agreementValues = labelers
    .map((user) => labelerStats(user, tasks, annotations).agreement.value)
    .filter((value): value is number => value !== null)
  const averageAgreement = agreementValues.length
    ? Math.round(agreementValues.reduce((sum, value) => sum + value, 0) / agreementValues.length)
    : 0

  return (
    <>
      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-icon metric-icon--violet"><Gauge size={20} /></span>
          <div><small>Общий прогресс</small><strong>{progress}%</strong></div>
          <div className="metric-progress"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          <p>{annotations.length} из {requiredAnswers} ответов собрано</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon--green"><CheckCircle2 size={20} /></span>
          <div><small>Готовые задания</small><strong>{completed}</strong></div>
          <p>из {tasks.length} имеют нужное перекрытие</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon--blue"><BarChart3 size={20} /></span>
          <div><small>Среднее согласие</small><strong>{averageAgreement}%</strong></div>
          <p>с большинством остальных разметчиков</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon--orange"><Users size={20} /></span>
          <div><small>Активная команда</small><strong>{activeLabelers.length}</strong></div>
          <p>разметчиков из {labelers.length}</p>
        </article>
      </div>

      <div className="admin-grid-main">
        <section className="admin-card task-activity-card">
          <header className="admin-card-header">
            <div><h3>Последние задания</h3><p>Наполнение и итоговый консенсус</p></div>
            <button className="text-action" onClick={() => onSectionChange('tasks')}>Все задания <ChevronRight size={16} /></button>
          </header>
          <div className="activity-list">
            {tasks.slice().reverse().slice(0, 5).map((task) => {
              const result = getConsensus(task, annotations)
              return (
                <div className="activity-row" key={task.id}>
                  <span className={`task-kind task-kind--${task.type}`}>{task.type === 'pairwise' ? 'A/B' : 'Да'}</span>
                  <div className="activity-copy"><strong>{task.text}</strong><span>{task.question}</span></div>
                  <div className="coverage-mini">
                    <span>{result.count}/{result.required}</span>
                    <i><b style={{ width: `${Math.min(100, (result.count / result.required) * 100)}%` }} /></i>
                  </div>
                  <span className={`status-chip ${result.complete ? 'status-chip--done' : 'status-chip--work'}`}>
                    {result.complete ? (result.isTie ? 'Спорно' : answerLabels[result.value!]) : 'В работе'}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="admin-card team-glance-card">
          <header className="admin-card-header">
            <div><h3>Команда</h3><p>Agreement с остальными</p></div>
            <button className="icon-subtle" onClick={() => onSectionChange('annotators')}><ChevronRight size={18} /></button>
          </header>
          <div className="team-glance-list">
            {labelers.slice(0, 5).map((user) => {
              const stats = labelerStats(user, tasks, annotations)
              return (
                <div key={user.id}>
                  <Avatar user={user} size="sm" />
                  <span><strong>{user.name}</strong><small>{stats.completed} ответов</small></span>
                  <b className={`agreement agreement--${agreementTone(stats.agreement.value)}`}>
                    {stats.agreement.value === null ? '—' : `${stats.agreement.value}%`}
                  </b>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </>
  )
}

function TasksView({ tasks, annotations, onCreateTask, onTaskOverlap }: Pick<AdminDashboardProps, 'tasks' | 'annotations' | 'onCreateTask' | 'onTaskOverlap'>) {
  return (
    <section className="admin-card table-card">
      <header className="admin-card-header admin-card-header--toolbar">
        <div><h3>Все задания</h3><p>{tasks.length} заданий в проекте</p></div>
        <button className="primary-action" onClick={onCreateTask}><Plus size={17} /> Создать задание</button>
      </header>
      <div className="admin-table-scroll">
        <table className="admin-table task-table">
          <thead><tr><th>Задание</th><th>Тип</th><th>Перекрытие</th><th>Консенсус</th><th>Статус</th></tr></thead>
          <tbody>
            {tasks.map((task) => {
              const result = getConsensus(task, annotations)
              return (
                <tr key={task.id}>
                  <td><div className="table-task-copy"><strong>{task.text}</strong><span>{task.question}</span></div></td>
                  <td><span className={`task-kind task-kind--${task.type}`}>{task.type === 'pairwise' ? 'A/B' : 'Да/Нет'}</span></td>
                  <td>
                    <div className="inline-overlap">
                      <span>{result.count}</span>
                      <span>/</span>
                      <select aria-label={`Перекрытие для ${task.id}`} value={result.required} onChange={(event) => onTaskOverlap(task.id, Number(event.target.value))}>
                        {[1,2,3,4,5,6,7].map((value) => <option key={value} value={value} disabled={value < result.count}>{value}</option>)}
                      </select>
                    </div>
                  </td>
                  <td>
                    {result.count ? (
                      <div className="consensus-cell">
                        <strong>{result.isTie ? 'Нет большинства' : answerLabels[result.value!]}</strong>
                        <span>{result.confidence}% голосов</span>
                      </div>
                    ) : <span className="muted-dash">—</span>}
                  </td>
                  <td><span className={`status-chip ${result.complete ? 'status-chip--done' : 'status-chip--work'}`}>{result.complete ? 'Готово' : 'В работе'}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AnnotatorsView({ tasks, annotations, users, onInvite, onToggleUser }: Pick<AdminDashboardProps, 'tasks' | 'annotations' | 'users' | 'onInvite' | 'onToggleUser'>) {
  const labelers = users.filter((user) => user.role === 'annotator')
  return (
    <section className="admin-card table-card">
      <header className="admin-card-header admin-card-header--toolbar">
        <div><h3>Команда разметки</h3><p>Agreement считается по совпадению с большинством остальных</p></div>
        <button className="primary-action" onClick={onInvite}><UserPlus size={17} /> Добавить</button>
      </header>
      <div className="admin-table-scroll">
        <table className="admin-table labeler-table">
          <thead><tr><th>Разметчик</th><th>Прогресс</th><th>Ответов</th><th>Совпадение</th><th>Статус</th></tr></thead>
          <tbody>
            {labelers.map((user) => {
              const stats = labelerStats(user, tasks, annotations)
              return (
                <tr key={user.id}>
                  <td><div className="user-cell"><Avatar user={user} /><span><strong>{user.name}</strong><small>{user.email}</small></span></div></td>
                  <td><div className="table-progress"><span><b>{stats.progress}%</b><small>{stats.completed} из {stats.assigned}</small></span><i><b style={{ width: `${stats.progress}%` }} /></i></div></td>
                  <td><strong className="response-count">{stats.completed}</strong></td>
                  <td>
                    <div className="agreement-cell">
                      <b className={`agreement agreement--${agreementTone(stats.agreement.value)}`}>{stats.agreement.value === null ? '—' : `${stats.agreement.value}%`}</b>
                      <span>{stats.agreement.comparable ? `по ${stats.agreement.comparable} заданиям` : 'мало данных'}</span>
                    </div>
                  </td>
                  <td><button className={`user-status user-status--${user.status}`} onClick={() => onToggleUser(user.id)}><i />{user.status === 'active' ? 'Активен' : 'На паузе'}</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SettingsView({ defaultOverlap, onDefaultOverlap, onApplyDefault }: Pick<AdminDashboardProps, 'defaultOverlap' | 'onDefaultOverlap' | 'onApplyDefault'>) {
  return (
    <div className="settings-layout">
      <section className="admin-card settings-card">
        <header><span className="settings-icon"><Layers3 size={20} /></span><div><h3>Перекрытие по умолчанию</h3><p>Сколько уникальных разметчиков увидят каждое новое задание</p></div></header>
        <div className="settings-overlap-value"><strong>{defaultOverlap}</strong><span>{defaultOverlap === 1 ? 'разметчик' : defaultOverlap < 5 ? 'разметчика' : 'разметчиков'}</span></div>
        <input
          className="overlap-range"
          type="range"
          min="1"
          max="7"
          value={defaultOverlap}
          onChange={(event) => onDefaultOverlap(Number(event.target.value))}
          style={{ '--range-progress': `${((defaultOverlap - 1) / 6) * 100}%` } as React.CSSProperties}
        />
        <div className="range-labels">{[1,2,3,4,5,6,7].map((value) => <span key={value}>{value}</span>)}</div>
        <div className="settings-explain">
          <Check size={17} />
          <p>После {defaultOverlap} уникальных ответов задание автоматически закрывается. Итог выбирается простым большинством голосов.</p>
        </div>
        <button className="secondary-action apply-button" onClick={onApplyDefault}>Применить к незавершённым заданиям</button>
      </section>
      <aside className="settings-side-note">
        <SlidersHorizontal size={20} />
        <h4>Можно настроить точечно</h4>
        <p>В разделе «Задания» перекрытие меняется отдельно для каждой строки от 1 до 7.</p>
      </aside>
    </div>
  )
}

export function AdminDashboard(props: AdminDashboardProps) {
  const meta = sectionMeta[props.section]

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-project-label"><span className="project-dot" /><div><small>Проект</small><strong>{props.project}</strong></div></div>
        <nav>
          <button className={props.section === 'overview' ? 'is-active' : ''} onClick={() => props.onSectionChange('overview')}><Gauge size={18} /> Обзор</button>
          <button className={props.section === 'tasks' ? 'is-active' : ''} onClick={() => props.onSectionChange('tasks')}><ClipboardList size={18} /> Задания <span>{props.tasks.length}</span></button>
          <button className={props.section === 'annotators' ? 'is-active' : ''} onClick={() => props.onSectionChange('annotators')}><Users size={18} /> Разметчики <span>{props.users.filter((user) => user.role === 'annotator').length}</span></button>
          <button className={props.section === 'settings' ? 'is-active' : ''} onClick={() => props.onSectionChange('settings')}><Settings size={18} /> Настройки</button>
        </nav>
        <div className="sidebar-rule" />
        <button className="sidebar-export" onClick={props.onExport}><Download size={17} /> Экспорт результатов</button>
        <div className="sidebar-info"><AudioWaveform size={17} /><span><strong>Локальный MVP</strong><small>Данные сохраняются в этом браузере</small></span></div>
      </aside>

      <main className="admin-content">
        <header className="admin-page-heading">
          <div><h1>{meta.title}</h1><p>{meta.description}</p></div>
          {props.section === 'overview' && <button className="primary-action" onClick={props.onCreateTask}><Plus size={17} /> Создать задание</button>}
        </header>

        {props.section === 'overview' && <Overview {...props} />}
        {props.section === 'tasks' && <TasksView {...props} />}
        {props.section === 'annotators' && <AnnotatorsView {...props} />}
        {props.section === 'settings' && <SettingsView {...props} />}
      </main>
    </div>
  )
}
