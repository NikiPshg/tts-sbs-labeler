export type PairwiseChoice = 'a' | 'b' | 'tie'
export type BooleanChoice = 'yes' | 'no' | 'unsure'
export type AnswerValue = PairwiseChoice | BooleanChoice

export interface AudioSource {
  src: string
  label?: string
}

interface BaseTask {
  id: string
  text: string
  hint?: string
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
}

export interface TaskBundle {
  project?: string
  tasks: LabelingTask[]
}
