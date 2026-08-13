import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FileJson,
  Keyboard,
  LogOut,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { answerLabels, assignAnnotators, getConsensus, rebalanceTask } from './analytics'
import { AdminDashboard } from './components/AdminDashboard'
import { AnnotatorHome } from './components/AnnotatorHome'
import { Avatar } from './components/Avatar'
import { BooleanTaskView } from './components/BooleanTaskView'
import { CreateTaskModal } from './components/CreateTaskModal'
import { InviteAnnotatorModal } from './components/InviteAnnotatorModal'
import { Logo } from './components/Logo'
import { PairwiseTaskView } from './components/PairwiseTaskView'
import {
  demoAnnotations,
  demoDefaultOverlap,
  demoProject,
  demoTasks,
  demoUsers,
} from './data'
import type {
  AdminSection,
  Annotation,
  AnswerValue,
  AppUser,
  BooleanChoice,
  LabelingTask,
  PairwiseChoice,
  TaskBundle,
} from './types'

const WORKSPACE_KEY = 'sbs-lab:workspace-v3'
const CURRENT_USER_KEY = 'sbs-lab:current-user'

interface StoredWorkspace {
  project: string
  defaultOverlap: number
  tasks: LabelingTask[]
  users: AppUser[]
  annotations: Annotation[]
}

function demoWorkspace(): StoredWorkspace {
  return {
    project: demoProject,
    defaultOverlap: demoDefaultOverlap,
    tasks: demoTasks,
    users: demoUsers,
    annotations: demoAnnotations,
  }
}

function readWorkspace(): StoredWorkspace {
  try {
    const stored = localStorage.getItem(WORKSPACE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as StoredWorkspace
      if (parsed.tasks?.length && parsed.users?.length && Array.isArray(parsed.annotations)) return parsed
    }
  } catch {
    // A broken local state should never block the demo workspace.
  }
  return demoWorkspace()
}

function isValidTask(task: unknown): task is LabelingTask {
  if (!task || typeof task !== 'object') return false
  const item = task as Record<string, unknown>
  if (typeof item.id !== 'string' || typeof item.text !== 'string') return false

  if (item.type === 'pairwise') {
    const audioA = item.audioA as Record<string, unknown> | undefined
    const audioB = item.audioB as Record<string, unknown> | undefined
    return typeof audioA?.src === 'string' && typeof audioB?.src === 'string'
  }

  if (item.type === 'boolean') {
    const audio = item.audio as Record<string, unknown> | undefined
    return typeof item.question === 'string' && typeof audio?.src === 'string'
  }

  return false
}

function parseBundle(value: unknown): TaskBundle {
  const rawTasks = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' ? (value as Record<string, unknown>).tasks : undefined)
  if (!Array.isArray(rawTasks) || !rawTasks.length || !rawTasks.every(isValidTask)) {
    throw new Error('Ожидался непустой массив корректных задач')
  }
  const object = !Array.isArray(value) && value && typeof value === 'object'
    ? value as Record<string, unknown>
    : undefined
  return {
    project: typeof object?.project === 'string' ? object.project : 'Импортированный проект',
    defaultOverlap: typeof object?.defaultOverlap === 'number' ? object.defaultOverlap : undefined,
    tasks: rawTasks,
  }
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

interface AppHeaderProps {
  project: string
  currentUser: AppUser
  users: AppUser[]
  accountOpen: boolean
  projectMenuOpen: boolean
  onAccountOpen: () => void
  onProjectMenuOpen: () => void
  onSwitchUser: (userId: string) => void
  onHelp: () => void
  onImport: () => void
  onExport: () => void
  onExample: () => void
  onReset: () => void
}

function AppHeader(props: AppHeaderProps) {
  return (
    <header className="topbar app-topbar">
      <Logo />
      <div className="project-pill"><span className="project-dot" /><span>{props.project}</span></div>
      <div className="topbar-actions">
        <button className="icon-text-button header-help" onClick={props.onHelp}><CircleHelp size={18} /><span>Помощь</span></button>
        {props.currentUser.role === 'admin' && (
          <div className="menu-wrap">
            <button className="icon-button" aria-label="Меню проекта" onClick={props.onProjectMenuOpen}><MoreHorizontal size={21} /></button>
            {props.projectMenuOpen && (
              <div className="project-menu">
                <button onClick={props.onImport}><Upload size={17} /> Импорт задач</button>
                <button onClick={props.onExport}><Download size={17} /> Экспорт результатов</button>
                <button onClick={props.onExample}><FileJson size={17} /> Пример JSON</button>
                <div className="menu-divider" />
                <button onClick={props.onReset}><RotateCcw size={17} /> Вернуть демо</button>
              </div>
            )}
          </div>
        )}
        <div className="account-menu-wrap">
          <button className="account-switcher" onClick={props.onAccountOpen} aria-expanded={props.accountOpen}>
            <Avatar user={props.currentUser} size="sm" />
            <span><strong>{props.currentUser.name}</strong><small>{props.currentUser.role === 'admin' ? 'Администратор' : 'Разметчик'}</small></span>
            <ChevronDown size={15} />
          </button>
          {props.accountOpen && (
            <div className="account-menu">
              <div className="account-menu-label">Демо-переключение роли</div>
              {props.users.map((user) => (
                <button key={user.id} className={user.id === props.currentUser.id ? 'is-current' : ''} onClick={() => props.onSwitchUser(user.id)}>
                  <Avatar user={user} size="sm" />
                  <span><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Администратор' : user.status === 'active' ? 'Разметчик' : 'Разметчик · пауза'}</small></span>
                  {user.id === props.currentUser.id && <Check size={16} />}
                </button>
              ))}
              <div className="account-menu-note"><ShieldCheck size={15} /> Реальную авторизацию подключим через backend</div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function App() {
  const initial = useMemo(readWorkspace, [])
  const [project, setProject] = useState(initial.project)
  const [defaultOverlap, setDefaultOverlap] = useState(initial.defaultOverlap)
  const [tasks, setTasks] = useState(initial.tasks)
  const [users, setUsers] = useState(initial.users)
  const [annotations, setAnnotations] = useState(initial.annotations)
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem(CURRENT_USER_KEY) ?? 'admin')
  const [adminSection, setAdminSection] = useState<AdminSection>('overview')
  const [labelingMode, setLabelingMode] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [accountOpen, setAccountOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const advanceTimer = useRef<number | undefined>(undefined)

  const currentUser = users.find((user) => user.id === currentUserId) ?? users[0]
  const assignedTasks = useMemo(
    () => currentUser.role === 'annotator'
      ? tasks.filter((task) => task.assigneeIds?.includes(currentUser.id))
      : [],
    [currentUser, tasks],
  )
  const userAnswers = useMemo(() => new Map(
    annotations.filter((annotation) => annotation.userId === currentUser.id).map((annotation) => [annotation.taskId, annotation]),
  ), [annotations, currentUser.id])
  const currentTask = assignedTasks[currentIndex]
  const answeredCount = assignedTasks.filter((task) => userAnswers.has(task.id)).length
  const progress = assignedTasks.length ? (answeredCount / assignedTasks.length) * 100 : 0

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ project, defaultOverlap, tasks, users, annotations }))
    } catch {
      setToast('Локальное хранилище заполнено — экспортируйте проект')
    }
  }, [annotations, defaultOverlap, project, tasks, users])

  useEffect(() => {
    localStorage.setItem(CURRENT_USER_KEY, currentUser.id)
  }, [currentUser.id])

  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const switchUser = (userId: string) => {
    window.clearTimeout(advanceTimer.current)
    setCurrentUserId(userId)
    setCurrentIndex(0)
    setLabelingMode(false)
    setCompleteOpen(false)
    setAccountOpen(false)
  }

  const startLabeling = () => {
    const firstUnanswered = assignedTasks.findIndex((task) => !userAnswers.has(task.id))
    setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0)
    setLabelingMode(true)
  }

  const goTo = useCallback((index: number) => {
    window.clearTimeout(advanceTimer.current)
    setCurrentIndex(Math.min(Math.max(index, 0), Math.max(0, assignedTasks.length - 1)))
  }, [assignedTasks.length])

  const recordAnswer = useCallback((value: AnswerValue) => {
    if (!currentTask || currentUser.role !== 'annotator') return
    const answer: Annotation = {
      taskId: currentTask.id,
      taskType: currentTask.type,
      userId: currentUser.id,
      value,
      answeredAt: new Date().toISOString(),
    }

    setAnnotations((previous) => {
      const index = previous.findIndex((item) => item.taskId === currentTask.id && item.userId === currentUser.id)
      if (index < 0) return [...previous, answer]
      return previous.map((item, itemIndex) => itemIndex === index ? answer : item)
    })

    const wasAnswered = userAnswers.has(currentTask.id)
    window.clearTimeout(advanceTimer.current)
    advanceTimer.current = window.setTimeout(() => {
      if (currentIndex < assignedTasks.length - 1) {
        setCurrentIndex((index) => index + 1)
      } else if (!wasAnswered || answeredCount === assignedTasks.length - 1) {
        setCompleteOpen(true)
      }
    }, 420)
  }, [answeredCount, assignedTasks.length, currentIndex, currentTask, currentUser, userAnswers])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (!labelingMode || !currentTask || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || helpOpen) return
      if (event.key === 'ArrowLeft') goTo(currentIndex - 1)
      if (event.key === 'ArrowRight') goTo(currentIndex + 1)
      if (event.key === '1') recordAnswer(currentTask.type === 'pairwise' ? 'a' : 'yes')
      if (event.key === '2') recordAnswer(currentTask.type === 'pairwise' ? 'b' : 'no')
      if (event.key === '0') recordAnswer(currentTask.type === 'pairwise' ? 'tie' : 'unsure')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentIndex, currentTask, goTo, helpOpen, labelingMode, recordAnswer])

  const createTask = (task: LabelingTask) => {
    const overlap = Math.max(1, Math.min(7, task.requiredAnnotations ?? defaultOverlap))
    const assigneeIds = assignAnnotators(users, tasks, annotations, overlap)
    setTasks((previous) => [...previous, { ...task, requiredAnnotations: overlap, assigneeIds }])
    setCreateOpen(false)
    setAdminSection('tasks')
    setToast(`Задание создано и назначено: ${assigneeIds.length}/${overlap}`)
  }

  const updateTaskOverlap = (taskId: string, overlap: number) => {
    const collected = annotations.filter((annotation) => annotation.taskId === taskId).length
    const safeOverlap = Math.max(collected, Math.max(1, Math.min(7, overlap)))
    setTasks((previous) => previous.map((task) => task.id === taskId
      ? rebalanceTask(task, safeOverlap, users, previous, annotations)
      : task))
    setToast(`Перекрытие изменено на ${safeOverlap}`)
  }

  const addUser = (user: AppUser) => {
    const nextUsers = [...users, user]
    setUsers(nextUsers)
    setTasks((previous) => previous.map((task) => {
      const required = task.requiredAnnotations ?? defaultOverlap
      return (task.assigneeIds?.length ?? 0) < required
        ? rebalanceTask(task, required, nextUsers, previous, annotations)
        : task
    }))
    setInviteOpen(false)
    setToast(`${user.name} добавлен в команду`)
  }

  const toggleUser = (userId: string) => {
    const nextUsers = users.map((user) => user.id === userId
      ? { ...user, status: user.status === 'active' ? 'paused' as const : 'active' as const }
      : user)
    setUsers(nextUsers)
    setTasks((previous) => previous.map((task) => {
      const result = getConsensus(task, annotations)
      return result.complete ? task : rebalanceTask(task, result.required, nextUsers, previous, annotations)
    }))
  }

  const applyDefaultOverlap = () => {
    setTasks((previous) => previous.map((task) => {
      const result = getConsensus(task, annotations)
      return result.complete ? task : rebalanceTask(task, Math.max(defaultOverlap, result.count), users, previous, annotations)
    }))
    setToast(`Перекрытие ${defaultOverlap} применено к активным заданиям`)
  }

  const importDataset = async (file: File) => {
    try {
      const bundle = parseBundle(JSON.parse(await file.text()))
      const imported: LabelingTask[] = []
      const bundleOverlap = Math.max(1, Math.min(7, bundle.defaultOverlap ?? defaultOverlap))
      bundle.tasks.forEach((task) => {
        const required = Math.max(1, Math.min(7, task.requiredAnnotations ?? bundleOverlap))
        imported.push({
          ...task,
          requiredAnnotations: required,
          assigneeIds: assignAnnotators(users, imported, [], required),
          createdAt: task.createdAt ?? new Date().toISOString(),
        })
      })
      setProject(bundle.project ?? 'Импортированный проект')
      setDefaultOverlap(bundleOverlap)
      setTasks(imported)
      setAnnotations([])
      setCurrentIndex(0)
      setProjectMenuOpen(false)
      setToast(`Загружено задач: ${imported.length}`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось прочитать JSON')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const exportResults = () => {
    downloadJson('sbs-project-results.json', {
      project,
      exportedAt: new Date().toISOString(),
      defaultOverlap,
      users: users.filter((user) => user.role === 'annotator'),
      tasks: tasks.map((task) => ({
        ...task,
        consensus: (() => {
          const result = getConsensus(task, annotations)
          return { ...result, label: result.value ? answerLabels[result.value] : null }
        })(),
      })),
      annotations,
    })
    setProjectMenuOpen(false)
    setToast('Результаты экспортированы')
  }

  const exportPersonal = () => {
    downloadJson(`sbs-results-${currentUser.id}.json`, {
      project,
      user: currentUser,
      annotations: annotations.filter((annotation) => annotation.userId === currentUser.id),
    })
  }

  const downloadExample = () => {
    downloadJson('sbs-tasks-example.json', {
      project: 'Мой TTS эксперимент',
      defaultOverlap: 3,
      tasks: demoTasks.slice(0, 2).map((task) => ({ ...task, assigneeIds: undefined })),
    })
    setProjectMenuOpen(false)
  }

  const resetDemo = () => {
    const demo = demoWorkspace()
    setProject(demo.project)
    setDefaultOverlap(demo.defaultOverlap)
    setTasks(demo.tasks)
    setUsers(demo.users)
    setAnnotations(demo.annotations)
    setCurrentUserId('admin')
    setAdminSection('overview')
    setLabelingMode(false)
    setProjectMenuOpen(false)
    setToast('Демо восстановлено')
  }

  const currentAnswer = currentTask ? userAnswers.get(currentTask.id)?.value : undefined
  const activeAnnotators = users.filter((user) => user.role === 'annotator' && user.status === 'active').length

  return (
    <div className={`app-shell ${currentUser.role === 'admin' ? 'app-shell--admin' : ''}`}>
      <AppHeader
        project={project}
        currentUser={currentUser}
        users={users}
        accountOpen={accountOpen}
        projectMenuOpen={projectMenuOpen}
        onAccountOpen={() => { setAccountOpen((value) => !value); setProjectMenuOpen(false) }}
        onProjectMenuOpen={() => { setProjectMenuOpen((value) => !value); setAccountOpen(false) }}
        onSwitchUser={switchUser}
        onHelp={() => setHelpOpen(true)}
        onImport={() => fileInput.current?.click()}
        onExport={exportResults}
        onExample={downloadExample}
        onReset={resetDemo}
      />
      <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importDataset(event.target.files[0])} />

      {currentUser.role === 'admin' ? (
        <AdminDashboard
          project={project}
          section={adminSection}
          tasks={tasks}
          annotations={annotations}
          users={users}
          defaultOverlap={defaultOverlap}
          onSectionChange={setAdminSection}
          onCreateTask={() => setCreateOpen(true)}
          onInvite={() => setInviteOpen(true)}
          onExport={exportResults}
          onTaskOverlap={updateTaskOverlap}
          onDefaultOverlap={setDefaultOverlap}
          onApplyDefault={applyDefaultOverlap}
          onToggleUser={toggleUser}
        />
      ) : !labelingMode ? (
        <AnnotatorHome user={currentUser} tasks={tasks} annotations={annotations} onStart={startLabeling} />
      ) : currentTask ? (
        <>
          <div className="progress-strip" aria-label={`Выполнено ${answeredCount} из ${assignedTasks.length}`}><span style={{ width: `${progress}%` }} /></div>
          <button className="back-to-cabinet" onClick={() => setLabelingMode(false)}><ArrowLeft size={16} /> В кабинет</button>
          <main className="workspace labeler-workspace">
            <aside className="session-panel">
              <div><span className="eyebrow">Моя очередь</span><h2>{answeredCount}<small> / {assignedTasks.length}</small></h2><p>заданий размечено</p></div>
              <div className="task-map" aria-label="Карта заданий">
                {assignedTasks.map((task, index) => (
                  <button
                    key={task.id}
                    aria-label={`Задание ${index + 1}${userAnswers.has(task.id) ? ', выполнено' : ''}`}
                    className={`${index === currentIndex ? 'is-current' : ''} ${userAnswers.has(task.id) ? 'is-done' : ''}`}
                    onClick={() => goTo(index)}
                  >
                    {userAnswers.has(task.id) ? <Check size={12} /> : index + 1}
                  </button>
                ))}
              </div>
              <div className="session-note"><Sparkles size={17} />Ответ сохраняется автоматически</div>
            </aside>
            <section className="task-card">
              <div className="task-number">Задание {currentIndex + 1} из {assignedTasks.length}{currentAnswer && <span><Check size={13} /> Ответ сохранён</span>}</div>
              {currentTask.type === 'pairwise' ? (
                <PairwiseTaskView task={currentTask} answer={currentAnswer as PairwiseChoice | undefined} onAnswer={recordAnswer} />
              ) : (
                <BooleanTaskView task={currentTask} answer={currentAnswer as BooleanChoice | undefined} onAnswer={recordAnswer} />
              )}
            </section>
          </main>
          <footer className="bottom-nav">
            <button disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}><ArrowLeft size={19} /> Назад</button>
            <button className="keyboard-hint" onClick={() => setHelpOpen(true)}><Keyboard size={17} /> Горячие клавиши</button>
            <button disabled={currentIndex === assignedTasks.length - 1} onClick={() => goTo(currentIndex + 1)}>Вперёд <ArrowRight size={19} /></button>
          </footer>
        </>
      ) : null}

      {createOpen && <CreateTaskModal defaultOverlap={defaultOverlap} activeAnnotators={activeAnnotators} onClose={() => setCreateOpen(false)} onCreate={createTask} />}
      {inviteOpen && <InviteAnnotatorModal onClose={() => setInviteOpen(false)} onCreate={addUser} />}

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setHelpOpen(false)} aria-label="Закрыть"><X size={20} /></button>
            <span className="modal-icon"><Keyboard size={24} /></span>
            <h2 id="help-title">{currentUser.role === 'admin' ? 'Демо двух ролей' : 'Работайте быстрее'}</h2>
            {currentUser.role === 'admin' ? (
              <><p>Переключайте аккаунт справа сверху, чтобы увидеть платформу глазами разметчика.</p><div className="admin-help-note"><ShieldCheck size={18} /><span><strong>Это frontend-заготовка</strong>Роли, назначения и статистика уже работают локально. Для команды потребуется backend и авторизация.</span></div></>
            ) : (
              <><p>Для всей разметки достаточно пяти клавиш.</p><div className="shortcut-list"><div><kbd>1</kbd><span>Вариант A / Да</span></div><div><kbd>2</kbd><span>Вариант B / Нет</span></div><div><kbd>0</kbd><span>Равно / Не уверен</span></div><div><span><kbd>←</kbd> <kbd>→</kbd></span><span>Назад / вперёд</span></div></div></>
            )}
            <button className="modal-primary" onClick={() => setHelpOpen(false)}>Понятно</button>
          </section>
        </div>
      )}

      {completeOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal complete-modal" role="dialog" aria-modal="true" aria-labelledby="complete-title">
            <span className="complete-check"><Check size={30} /></span>
            <h2 id="complete-title">Очередь завершена</h2>
            <p>Вы разметили {answeredCount} из {assignedTasks.length} назначенных заданий.</p>
            <button className="modal-primary" onClick={() => { setCompleteOpen(false); setLabelingMode(false) }}><LogOut size={18} /> В личный кабинет</button>
            <button className="modal-secondary" onClick={exportPersonal}><Download size={17} /> Скачать мои ответы</button>
          </section>
        </div>
      )}

      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  )
}

export default App
