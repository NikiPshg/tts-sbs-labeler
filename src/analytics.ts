import type { Annotation, AnswerValue, AppUser, LabelingTask } from './types'

export interface ConsensusResult {
  value?: AnswerValue
  confidence: number
  isTie: boolean
  count: number
  required: number
  complete: boolean
}

export function taskAnnotations(taskId: string, annotations: Annotation[]) {
  return annotations.filter((annotation) => annotation.taskId === taskId)
}

export function getConsensus(task: LabelingTask, annotations: Annotation[]): ConsensusResult {
  const votes = taskAnnotations(task.id, annotations)
  const required = task.requiredAnnotations ?? 1
  const counts = new Map<AnswerValue, number>()
  votes.forEach(({ value }) => counts.set(value, (counts.get(value) ?? 0) + 1))
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const topCount = ranked[0]?.[1] ?? 0
  const isTie = ranked.length > 1 && ranked[1][1] === topCount

  return {
    value: isTie ? undefined : ranked[0]?.[0],
    confidence: votes.length ? Math.round((topCount / votes.length) * 100) : 0,
    isTie,
    count: votes.length,
    required,
    complete: votes.length >= required,
  }
}

export function userAgreement(userId: string, annotations: Annotation[]) {
  const userVotes = annotations.filter((annotation) => annotation.userId === userId)
  let comparable = 0
  let matches = 0

  userVotes.forEach((vote) => {
    const otherVotes = annotations.filter(
      (annotation) => annotation.taskId === vote.taskId && annotation.userId !== userId,
    )
    if (!otherVotes.length) return

    const counts = new Map<AnswerValue, number>()
    otherVotes.forEach(({ value }) => counts.set(value, (counts.get(value) ?? 0) + 1))
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return

    comparable += 1
    if (ranked[0][0] === vote.value) matches += 1
  })

  return {
    value: comparable ? Math.round((matches / comparable) * 100) : null,
    comparable,
    matches,
  }
}

export function labelerStats(user: AppUser, tasks: LabelingTask[], annotations: Annotation[]) {
  const assigned = tasks.filter((task) => task.assigneeIds?.includes(user.id))
  const completed = annotations.filter((annotation) => annotation.userId === user.id).length
  return {
    assigned: assigned.length,
    completed,
    remaining: Math.max(0, assigned.length - completed),
    progress: assigned.length ? Math.round((completed / assigned.length) * 100) : 0,
    agreement: userAgreement(user.id, annotations),
  }
}

export function assignAnnotators(
  users: AppUser[],
  tasks: LabelingTask[],
  annotations: Annotation[],
  count: number,
) {
  const active = users.filter((user) => user.role === 'annotator' && user.status === 'active')
  const loads = new Map(active.map((user) => [user.id, 0]))

  tasks.forEach((task) => task.assigneeIds?.forEach((id) => loads.set(id, (loads.get(id) ?? 0) + 1)))
  annotations.forEach((annotation) => loads.set(annotation.userId, Math.max(0, (loads.get(annotation.userId) ?? 0) - 0.25)))

  return [...active]
    .sort((a, b) => (loads.get(a.id) ?? 0) - (loads.get(b.id) ?? 0))
    .slice(0, Math.min(count, active.length))
    .map((user) => user.id)
}

export function rebalanceTask(
  task: LabelingTask,
  count: number,
  users: AppUser[],
  tasks: LabelingTask[],
  annotations: Annotation[],
) {
  const answeredIds = taskAnnotations(task.id, annotations).map((annotation) => annotation.userId)
  const activeIds = new Set(users.filter((user) => user.role === 'annotator' && user.status === 'active').map((user) => user.id))
  const currentActive = (task.assigneeIds ?? []).filter((id) => activeIds.has(id) && !answeredIds.includes(id))
  const retained = [...new Set([...answeredIds, ...currentActive])].slice(0, count)
  const needed = Math.max(0, count - retained.length)
  const candidates = assignAnnotators(
    users.filter((user) => !retained.includes(user.id)),
    tasks,
    annotations,
    needed,
  )
  return { ...task, requiredAnnotations: count, assigneeIds: [...retained, ...candidates] }
}

export const answerLabels: Record<AnswerValue, string> = {
  a: 'Вариант A',
  b: 'Вариант B',
  tie: 'Равноценны',
  yes: 'Да',
  no: 'Нет',
  unsure: 'Не разобрать',
}
