import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Download,
  FileJson,
  Keyboard,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { BooleanTaskView } from './components/BooleanTaskView'
import { Logo } from './components/Logo'
import { PairwiseTaskView } from './components/PairwiseTaskView'
import { demoProject, demoTasks } from './data'
import type {
  AnswerValue,
  BooleanChoice,
  LabelingTask,
  PairwiseChoice,
  TaskAnswer,
  TaskBundle,
} from './types'

const ANSWERS_KEY = 'sbs-lab:answers'
const DATASET_KEY = 'sbs-lab:dataset'

function readStoredAnswers() {
  try {
    return JSON.parse(localStorage.getItem(ANSWERS_KEY) ?? '{}') as Record<string, TaskAnswer>
  } catch {
    return {}
  }
}

function readStoredDataset(): TaskBundle {
  try {
    const stored = localStorage.getItem(DATASET_KEY)
    if (stored) return JSON.parse(stored) as TaskBundle
  } catch {
    // A broken local dataset should never block the demo.
  }
  return { project: demoProject, tasks: demoTasks }
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

  const rawProject = !Array.isArray(value) && value && typeof value === 'object'
    ? (value as Record<string, unknown>).project
    : undefined

  return {
    project: typeof rawProject === 'string' ? rawProject : 'Импортированный проект',
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

function App() {
  const initialDataset = useMemo(readStoredDataset, [])
  const [tasks, setTasks] = useState(initialDataset.tasks)
  const [project, setProject] = useState(initialDataset.project ?? demoProject)
  const [answers, setAnswers] = useState<Record<string, TaskAnswer>>(readStoredAnswers)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const advanceTimer = useRef<number | undefined>(undefined)

  const currentTask = tasks[currentIndex]
  const answeredCount = useMemo(
    () => tasks.filter((task) => answers[task.id]).length,
    [answers, tasks],
  )
  const progress = tasks.length ? (answeredCount / tasks.length) * 100 : 0

  useEffect(() => {
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(answers))
  }, [answers])

  useEffect(() => () => window.clearTimeout(advanceTimer.current), [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  const goTo = useCallback((index: number) => {
    window.clearTimeout(advanceTimer.current)
    setCurrentIndex(Math.min(Math.max(index, 0), tasks.length - 1))
  }, [tasks.length])

  const recordAnswer = useCallback((value: AnswerValue) => {
    if (!currentTask) return

    const wasAnswered = Boolean(answers[currentTask.id])
    setAnswers((previous) => ({
      ...previous,
      [currentTask.id]: {
        taskId: currentTask.id,
        taskType: currentTask.type,
        value,
        answeredAt: new Date().toISOString(),
      },
    }))

    window.clearTimeout(advanceTimer.current)
    advanceTimer.current = window.setTimeout(() => {
      if (currentIndex < tasks.length - 1) {
        setCurrentIndex((index) => index + 1)
      } else if (!wasAnswered || answeredCount === tasks.length - 1) {
        setCompleteOpen(true)
      }
    }, 420)
  }, [answeredCount, answers, currentIndex, currentTask, tasks.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || helpOpen) return

      if (event.key === 'ArrowLeft') goTo(currentIndex - 1)
      if (event.key === 'ArrowRight') goTo(currentIndex + 1)
      if (event.key === '1') recordAnswer(currentTask.type === 'pairwise' ? 'a' : 'yes')
      if (event.key === '2') recordAnswer(currentTask.type === 'pairwise' ? 'b' : 'no')
      if (event.key === '0') recordAnswer(currentTask.type === 'pairwise' ? 'tie' : 'unsure')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentIndex, currentTask, goTo, helpOpen, recordAnswer])

  const importDataset = async (file: File) => {
    try {
      const bundle = parseBundle(JSON.parse(await file.text()))
      localStorage.setItem(DATASET_KEY, JSON.stringify(bundle))
      setTasks(bundle.tasks)
      setProject(bundle.project ?? 'Импортированный проект')
      setAnswers({})
      setCurrentIndex(0)
      setMenuOpen(false)
      setToast(`Загружено задач: ${bundle.tasks.length}`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Не удалось прочитать JSON')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const exportResults = () => {
    downloadJson('sbs-results.json', {
      project,
      exportedAt: new Date().toISOString(),
      total: tasks.length,
      completed: answeredCount,
      answers: tasks.flatMap((task) => answers[task.id] ? [answers[task.id]] : []),
    })
    setMenuOpen(false)
    setToast('Ответы экспортированы')
  }

  const downloadExample = () => {
    downloadJson('sbs-tasks-example.json', { project: 'Мой TTS эксперимент', tasks: demoTasks.slice(0, 2) })
    setMenuOpen(false)
  }

  const resetDemo = () => {
    localStorage.removeItem(DATASET_KEY)
    setTasks(demoTasks)
    setProject(demoProject)
    setAnswers({})
    setCurrentIndex(0)
    setMenuOpen(false)
    setToast('Демо восстановлено')
  }

  if (!currentTask) return null

  const currentAnswer = answers[currentTask.id]?.value

  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo />

        <div className="project-pill">
          <span className="project-dot" />
          <span>{project}</span>
        </div>

        <div className="topbar-actions">
          <button className="icon-text-button" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={18} />
            <span>Помощь</span>
          </button>
          <div className="menu-wrap">
            <button
              className="icon-button"
              aria-label="Меню проекта"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreHorizontal size={21} />
            </button>
            {menuOpen && (
              <div className="project-menu">
                <button onClick={() => fileInput.current?.click()}><Upload size={17} /> Импорт задач</button>
                <button onClick={exportResults}><Download size={17} /> Экспорт ответов</button>
                <button onClick={downloadExample}><FileJson size={17} /> Пример JSON</button>
                <div className="menu-divider" />
                <button onClick={resetDemo}><RotateCcw size={17} /> Вернуть демо</button>
              </div>
            )}
            <input
              ref={fileInput}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(event) => event.target.files?.[0] && void importDataset(event.target.files[0])}
            />
          </div>
        </div>
      </header>

      <div className="progress-strip" aria-label={`Выполнено ${answeredCount} из ${tasks.length}`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <main className="workspace">
        <aside className="session-panel">
          <div>
            <span className="eyebrow">Сессия</span>
            <h2>{answeredCount}<small> / {tasks.length}</small></h2>
            <p>заданий размечено</p>
          </div>

          <div className="task-map" aria-label="Карта заданий">
            {tasks.map((task, index) => (
              <button
                key={task.id}
                aria-label={`Задание ${index + 1}${answers[task.id] ? ', выполнено' : ''}`}
                className={`${index === currentIndex ? 'is-current' : ''} ${answers[task.id] ? 'is-done' : ''}`}
                onClick={() => goTo(index)}
              >
                {answers[task.id] ? <Check size={12} /> : index + 1}
              </button>
            ))}
          </div>

          <div className="session-note">
            <Sparkles size={17} />
            Ответы сохраняются автоматически
          </div>
        </aside>

        <section className="task-card">
          <div className="task-number">
            Задание {currentIndex + 1} из {tasks.length}
            {currentAnswer && <span><Check size={13} /> Ответ сохранён</span>}
          </div>

          {currentTask.type === 'pairwise' ? (
            <PairwiseTaskView
              task={currentTask}
              answer={currentAnswer as PairwiseChoice | undefined}
              onAnswer={recordAnswer}
            />
          ) : (
            <BooleanTaskView
              task={currentTask}
              answer={currentAnswer as BooleanChoice | undefined}
              onAnswer={recordAnswer}
            />
          )}
        </section>
      </main>

      <footer className="bottom-nav">
        <button disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>
          <ArrowLeft size={19} /> Назад
        </button>

        <button className="keyboard-hint" onClick={() => setHelpOpen(true)}>
          <Keyboard size={17} /> Горячие клавиши
        </button>

        <button disabled={currentIndex === tasks.length - 1} onClick={() => goTo(currentIndex + 1)}>
          Вперёд <ArrowRight size={19} />
        </button>
      </footer>

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setHelpOpen(false)} aria-label="Закрыть"><X size={20} /></button>
            <span className="modal-icon"><Keyboard size={24} /></span>
            <h2 id="help-title">Работайте быстрее</h2>
            <p>Для всей разметки достаточно пяти клавиш.</p>
            <div className="shortcut-list">
              <div><kbd>1</kbd><span>Вариант A / Да</span></div>
              <div><kbd>2</kbd><span>Вариант B / Нет</span></div>
              <div><kbd>0</kbd><span>Равно / Не уверен</span></div>
              <div><span><kbd>←</kbd> <kbd>→</kbd></span><span>Назад / вперёд</span></div>
            </div>
            <button className="modal-primary" onClick={() => setHelpOpen(false)}>Понятно</button>
          </section>
        </div>
      )}

      {completeOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal complete-modal" role="dialog" aria-modal="true" aria-labelledby="complete-title">
            <span className="complete-check"><Check size={30} /></span>
            <h2 id="complete-title">Сессия завершена</h2>
            <p>Размечено {answeredCount} из {tasks.length}. Можно выгрузить результаты или вернуться к ответам.</p>
            <button className="modal-primary" onClick={exportResults}><Download size={18} /> Скачать JSON</button>
            <button className="modal-secondary" onClick={() => setCompleteOpen(false)}>Проверить ответы</button>
          </section>
        </div>
      )}

      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
    </div>
  )
}

export default App
