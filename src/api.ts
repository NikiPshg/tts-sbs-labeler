import type { Annotation, AnswerValue, AppUser, LabelingTask, QualityReport } from './types'

const TOKEN_KEY = 'sbs-lab:token'

export function readToken(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('t')
  if (fromUrl) {
    localStorage.setItem(TOKEN_KEY, fromUrl)
    // Keep the token out of the visible address bar so a shared screenshot
    // does not hand someone else the annotator's identity.
    const clean = window.location.pathname + window.location.hash
    window.history.replaceState(null, '', clean)
    return fromUrl
  }
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export interface Bootstrap {
  user: AppUser
  project: string
  defaultOverlap: number
  users: AppUser[]
  tasks: LabelingTask[]
  annotations: Annotation[]
  quality?: QualityReport
  controlPending?: number
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Token': token,
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    let detail = `Ошибка ${response.status}`
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // Non-JSON error bodies are not worth surfacing verbatim.
    }
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export const api = {
  bootstrap: (token: string) => request<Bootstrap>('/api/bootstrap', token),

  answer: (token: string, taskId: string, value: AnswerValue, msSpent?: number) =>
    request<{ ok: boolean }>('/api/answer', token, {
      method: 'POST',
      body: JSON.stringify({ taskId, value, msSpent }),
    }),

  setControl: (token: string, taskId: string, value: AnswerValue | null) =>
    request<{ ok: boolean }>('/api/control', token, {
      method: 'POST',
      body: JSON.stringify({ taskId, value }),
    }),

  flagControl: (token: string, taskId: string, isControl: boolean) =>
    request<{ ok: boolean }>('/api/control/flag', token, {
      method: 'POST',
      body: JSON.stringify({ taskId, isControl }),
    }),

  addUser: (token: string, name: string) =>
    request<{ user: AppUser; token: string }>('/api/users', token, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  listUsers: (token: string) =>
    request<{ users: Array<AppUser & { token: string; link: string }> }>('/api/users', token),

  toggleUser: (token: string, userId: string) =>
    request<{ ok: boolean }>('/api/users/toggle', token, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  settings: (token: string, patch: { defaultOverlap?: number; project?: string }) =>
    request<{ ok: boolean }>('/api/settings', token, {
      method: 'POST',
      body: JSON.stringify(patch),
    }),
}

export function exportUrl(token: string, format: 'json' | 'csv') {
  return `/api/export?format=${format}&t=${encodeURIComponent(token)}`
}
