export type PairwiseChoice = 'a' | 'b' | 'tie'
export type BooleanChoice = 'yes' | 'no' | 'unsure'
export type AnswerValue = PairwiseChoice | BooleanChoice
export type UserRole = 'admin' | 'annotator'
export type UserStatus = 'active' | 'paused'

export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  color: string
}

export interface AudioSource {
  src: string
  label?: string
}

interface BaseTask {
  id: string
  text: string
  hint?: string
  requiredAnnotations?: number
  assigneeIds?: string[]
  createdAt?: string
  /** Honeypot flag and reference answer. Sent to the admin only. */
  isControl?: boolean
  controlAnswer?: AnswerValue | null
  controlActive?: boolean
  controlGroup?: string | null
  /** Opaque short code: the raw id would reveal which batch a clip came from. */
  code?: string
  meta?: Record<string, unknown>
}

export interface PairwiseTask extends BaseTask {
  type: 'pairwise'
  question?: string
  audioA: AudioSource
  audioB: AudioSource
}

export interface BooleanTask extends BaseTask {
  type: 'boolean'
  question: string
  audio: AudioSource
}

export type LabelingTask = PairwiseTask | BooleanTask

export interface TaskAnswer {
  taskId: string
  taskType: LabelingTask['type']
  value: AnswerValue
  answeredAt: string
  userId?: string
}

export interface Annotation extends TaskAnswer {
  userId: string
}

export interface TaskBundle {
  project?: string
  defaultOverlap?: number
  tasks: LabelingTask[]
}

export type AdminSection = 'overview' | 'tasks' | 'control' | 'annotators' | 'settings'

export interface QualityUser {
  checked: number
  correct: number
  accuracy: number | null
  misses: Array<{ taskId: string; expected: AnswerValue; got: AnswerValue }>
}

export interface QualityReport {
  controlsTotal: number
  controlsActive: number
  controlsLabeled: number
  perUser: Record<string, QualityUser>
}
