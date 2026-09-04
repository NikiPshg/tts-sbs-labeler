import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Keyboard,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { AdminDashboard } from './components/AdminDashboard'
import { AnnotatorHome } from './components/AnnotatorHome'
import { Avatar } from './components/Avatar'
import { BooleanTaskView } from './components/BooleanTaskView'
import { InviteAnnotatorModal } from './components/InviteAnnotatorModal'
import { LoginScreen } from './components/LoginScreen'
import { Logo } from './components/Logo'
import { PairwiseTaskView } from './components/PairwiseTaskView'
import { api, clearToken, exportUrl, readToken, storeToken, type Bootstrap } from './api'
import type {
  AdminSection,
  Annotation,
  AnswerValue,
  AppUser,
  BooleanChoice,
  PairwiseChoice,
} from './types'

interface AppHeaderProps {
  project: string
  currentUser: AppUser
  token: string
  projectMenuOpen: boolean
  accountOpen: boolean
  onProjectMenuOpen: () => void
  onAccountOpen: () => void
  onHelp: () => void
  onRefresh: () => void
  onLogout: () => void
}

function AppHeader(props: AppHeaderProps) {
  const isAdmin = props.currentUser.role === 'admin'
  return (
    <header className="topbar app-topbar">
      <Logo />
      <div className="project-pill"><span className="project-dot" /><span>{props.project}</span></div>
      <div className="topbar-actions">
        <button className="icon-text-button header-help" onClick={props.onHelp}><CircleHelp size={18} /><span>Помощь</span></button>
        {isAdmin && (
          <div className="menu-wrap">
            <button className="icon-button" aria-label="Меню проекта" onClick={props.onProjectMenuOpen}><MoreHorizontal size={21} /></button>
            {props.projectMenuOpen && (
              <div className="project-menu">
                <a href={exportUrl(props.token, 'json')}><Download size={17} /> Экспорт JSON</a>
                <a href={exportUrl(props.token, 'csv')}><Download size={17} /> Экспорт CSV</a>
                <div className="menu-divider" />
                <button onClick={props.onRefresh}><RefreshCw size={17} /> Обновить данные</button>
              </div>
            )}
          </div>
        )}
        <div className="account-menu-wrap">
          <button className="account-switcher" onClick={props.onAccountOpen} aria-expanded={props.accountOpen}>
            <Avatar user={props.currentUser} size="sm" />
            <span><strong>{props.currentUser.name}</strong><small>{isAdmin ? 'Администратор' : 'Разметчик'}</small></span>
            <ChevronDown size={15} />
          </button>
          {props.accountOpen && (
            <div className="account-menu">
              <div className="account-menu-label">{props.currentUser.name}</div>
              <button onClick={props.onRefresh}><RefreshCw size={16} /> Обновить данные</button>
              <button onClick={props.onLogout}><LogOut size={16} /> Выйти</button>
              <div className="account-menu-note"><ShieldCheck size={15} /> Ответы сохраняются на сервере</div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function App() {
  const [token, setToken] = useState(readToken)
  const [state, setState] = useState<Bootstrap | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(token))
  const [inviteLinks, setInviteLinks] = useState<Array<{ id: string; name: string; link: string }>>([])

  const [adminSection, setAdminSection] = useState<AdminSection>('overview')
  const [labelingMode, setLabelingMode] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [accountOpen, setAccountOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const advanceTimer = useRef<number | undefined>(undefined)
  const shownAt = useRef<number>(Date.now())

  const load = useCallback(async (value: string) => {
    setLoading(true)
    try {
      const data = await api.bootstrap(value)
      setState(data)
      setAuthError(null)
      storeToken(value)
      if (data.user.role === 'admin') {
        try {
          const { users } = await api.listUsers(value)
          setInviteLinks(users
            .filter((user) => user.role === 'annotator')
            .map((user) => ({ id: user.id, name: user.name, link: `${window.location.origin}${user.link}` })))
        } catch {
          // Invite links are a convenience; a failure here must not block the dashboard.
        }
      }
    } catch (error) {
      setState(null)
      setAuthError(error instanceof Error ? error.message : 'Не удалось войти')
      clearToken()
      setToken('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) void load(token)
  }, [token, load])

  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const refresh = useCallback(() => {
    setProjectMenuOpen(false)
    setAccountOpen(false)
    if (token) void load(token)
  }, [token, load])

  const tasks = state?.tasks ?? []
  const users = state?.users ?? []
  const annotations = state?.annotations ?? []
  const currentUser = state?.user

  const assignedTasks = useMemo(
    () => currentUser?.role === 'annotator'
      ? tasks.filter((task) => task.assigneeIds?.includes(currentUser.id))
      : [],
    [currentUser, tasks],
  )
  const userAnswers = useMemo(() => new Map(
    annotations
      .filter((annotation) => annotation.userId === currentUser?.id)
      .map((annotation) => [annotation.taskId, annotation]),
  ), [annotations, currentUser?.id])

  const currentTask = assignedTasks[currentIndex]
  const answeredCount = assignedTasks.filter((task) => userAnswers.has(task.id)).length
  const progress = assignedTasks.length ? (answeredCount / assignedTasks.length) * 100 : 0

  useEffect(() => {
    shownAt.current = Date.now()
  }, [currentIndex, currentTask?.id])

  const goTo = useCallback((index: number) => {
    window.clearTimeout(advanceTimer.current)
    setCurrentIndex(Math.min(Math.max(index, 0), Math.max(0, assignedTasks.length - 1)))
  }, [assignedTasks.length])

  const recordAnswer = useCallback((value: AnswerValue) => {
    if (!currentTask || !currentUser || currentUser.role !== 'annotator') return
    const answer: Annotation = {
      taskId: currentTask.id,
      taskType: currentTask.type,
      userId: currentUser.id,
      value,
      answeredAt: new Date().toISOString(),
    }

    // Optimistic update: the annotator should never wait for the round-trip.
    setState((previous) => {
      if (!previous) return previous
      const index = previous.annotations.findIndex(
        (item) => item.taskId === currentTask.id && item.userId === currentUser.id,
      )
      const next = index < 0
        ? [...previous.annotations, answer]
        : previous.annotations.map((item, i) => (i === index ? answer : item))
      return { ...previous, annotations: next }
    })

    void api.answer(token, currentTask.id, value, Date.now() - shownAt.current)
      .catch((error: Error) => setToast(`Ответ не сохранён: ${error.message}`))

    const wasAnswered = userAnswers.has(currentTask.id)
    window.clearTimeout(advanceTimer.current)
    advanceTimer.current = window.setTimeout(() => {
      if (currentIndex < assignedTasks.length - 1) {
        setCurrentIndex((index) => index + 1)
      } else if (!wasAnswered || answeredCount === assignedTasks.length - 1) {
        setCompleteOpen(true)
      }
    }, 420)
  }, [answeredCount, assignedTasks.length, currentIndex, currentTask, currentUser, token, userAnswers])

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

  const startLabeling = () => {
    const firstUnanswered = assignedTasks.findIndex((task) => !userAnswers.has(task.id))
    setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0)
    setLabelingMode(true)
  }

  const setControl = (taskId: string, value: AnswerValue | null) => {
    setState((previous) => previous && {
      ...previous,
      tasks: previous.tasks.map((task) => task.id === taskId ? { ...task, controlAnswer: value } : task),
    })
    void api.setControl(token, taskId, value)
      .then(() => setToast(value ? 'Эталон сохранён' : 'Эталон сброшен'))
      .catch((error: Error) => { setToast(error.message); refresh() })
  }

  const flagControl = (taskId: string, isControl: boolean) => {
    setState((previous) => previous && {
      ...previous,
      tasks: previous.tasks.map((task) => task.id === taskId
        ? { ...task, isControl, controlAnswer: isControl ? task.controlAnswer : null }
        : task),
    })
    void api.flagControl(token, taskId, isControl)
      .then(() => setToast(isControl ? 'Задание стало контрольным' : 'Задание убрано из контрольных'))
      .catch((error: Error) => { setToast(error.message); refresh() })
  }

  const addUser = (user: AppUser) => {
    void api.addUser(token, user.name)
      .then((created) => {
        const link = `${window.location.origin}/?t=${created.token}`
        void navigator.clipboard?.writeText(link).catch(() => undefined)
        setToast(`${created.user.name}: ссылка скопирована в буфер`)
        setInviteOpen(false)
        refresh()
      })
      .catch((error: Error) => setToast(error.message))
  }

  const toggleUser = (userId: string) => {
    void api.toggleUser(token, userId).then(refresh).catch((error: Error) => setToast(error.message))
  }

  const setDefaultOverlap = (overlap: number) => {
    setState((previous) => previous && { ...previous, defaultOverlap: overlap })
  }

  const applyDefaultOverlap = () => {
    void api.settings(token, { defaultOverlap: state?.defaultOverlap ?? 3 })
      .then(() => { setToast(`Перекрытие ${state?.defaultOverlap} применено`); refresh() })
      .catch((error: Error) => setToast(error.message))
  }

  const copyLink = (link: string) => {
    void navigator.clipboard?.writeText(link)
      .then(() => setToast('Ссылка скопирована'))
      .catch(() => setToast(link))
  }

  const logout = () => {
    clearToken()
    setToken('')
    setState(null)
    setAccountOpen(false)
  }

  if (!state || !currentUser) {
    return <LoginScreen error={authError} busy={loading} onSubmit={(value) => setToken(value)} />
  }

  const currentAnswer = currentTask ? userAnswers.get(currentTask.id)?.value : undefined

  return (
    <div className={`app-shell ${currentUser.role === 'admin' ? 'app-shell--admin' : ''}`}>
      <AppHeader
        project={state.project}
        currentUser={currentUser}
        token={token}
        projectMenuOpen={projectMenuOpen}
        accountOpen={accountOpen}
        onProjectMenuOpen={() => { setProjectMenuOpen((value) => !value); setAccountOpen(false) }}
        onAccountOpen={() => { setAccountOpen((value) => !value); setProjectMenuOpen(false) }}
        onHelp={() => setHelpOpen(true)}
        onRefresh={refresh}
        onLogout={logout}
      />

      {currentUser.role === 'admin' ? (
        <AdminDashboard
          project={state.project}
          section={adminSection}
          tasks={tasks}
          annotations={annotations}
          users={users}
          defaultOverlap={state.defaultOverlap}
          quality={state.quality}
          inviteLinks={inviteLinks}
          onSectionChange={setAdminSection}
          onCreateTask={() => setToast('Задания загружаются с сервера: cli.py import')}
          onInvite={() => setInviteOpen(true)}
          onExport={() => { window.location.href = exportUrl(token, 'json') }}
          onTaskOverlap={() => setToast('Перекрытие меняется общим значением в «Настройках»')}
          onDefaultOverlap={setDefaultOverlap}
          onApplyDefault={applyDefaultOverlap}
          onToggleUser={toggleUser}
          onSetControl={setControl}
          onFlagControl={flagControl}
          onCopyLink={copyLink}
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
              <div className="session-note"><ShieldCheck size={17} />Ответ сразу уходит на сервер</div>
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
      ) : (
        <main className="annotator-home">
          <section className="admin-card"><p className="control-empty">Заданий пока нет — загляните позже.</p></section>
        </main>
      )}

      {inviteOpen && <InviteAnnotatorModal onClose={() => setInviteOpen(false)} onCreate={addUser} />}

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setHelpOpen(false)} aria-label="Закрыть"><X size={20} /></button>
            <span className="modal-icon"><Keyboard size={24} /></span>
            <h2 id="help-title">{currentUser.role === 'admin' ? 'Как устроен проект' : 'Как размечать'}</h2>
            {currentUser.role === 'admin' ? (
              <>
                <p>Задания и ответы лежат в SQLite на сервере. Разметчику выдаётся персональная ссылка — по ней он попадает сразу в свою очередь.</p>
                <div className="admin-help-note"><ShieldCheck size={18} /><span><strong>Контрольные задания</strong>В разделе «Контроль» задайте эталонный ответ каждому ханипоту. Они показываются всем разметчикам вперемешку с обычными.</span></div>
              </>
            ) : (
              <>
                <p>Прослушайте запись и ответьте на вопрос. Ответ сохраняется сразу, вернуться и изменить его можно в любой момент.</p>
                <div className="shortcut-list">
                  <div><kbd>1</kbd><span>Да</span></div>
                  <div><kbd>2</kbd><span>Нет</span></div>
                  <div><kbd>0</kbd><span>Не разобрать</span></div>
                  <div><span><kbd>←</kbd> <kbd>→</kbd></span><span>Назад / вперёд</span></div>
                </div>
              </>
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
            <p>Вы разметили {answeredCount} из {assignedTasks.length} заданий. Спасибо!</p>
            <button className="modal-primary" onClick={() => { setCompleteOpen(false); setLabelingMode(false) }}><LogOut size={18} /> В личный кабинет</button>
            <button className="modal-secondary" onClick={refresh}><RefreshCw size={17} /> Проверить новые задания</button>
          </section>
        </div>
      )}

      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  )
}

export default App
