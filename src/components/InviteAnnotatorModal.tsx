import { useState, type FormEvent } from 'react'
import { UserPlus, X } from 'lucide-react'
import type { AppUser } from '../types'

interface InviteAnnotatorModalProps {
  onClose: () => void
  onCreate: (user: AppUser) => void
}

const colors = ['#6558dc', '#2f9a6b', '#e7795d', '#4388c9', '#b45bad', '#d09737']

export function InviteAnnotatorModal({ onClose, onCreate }: InviteAnnotatorModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onCreate({
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      role: 'annotator',
      status: 'active',
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal invite-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        <span className="modal-icon"><UserPlus size={23} /></span>
        <h2>Добавить разметчика</h2>
        <p>Создаём заготовку аккаунта. Подключение почтовых приглашений появится вместе с backend.</p>
        <label className="form-field">
          <span className="field-label">Имя</span>
          <input required className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Иван Петров" />
        </label>
        <label className="form-field">
          <span className="field-label">Email</span>
          <input required type="email" className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ivan@example.com" />
        </label>
        <button className="modal-primary" type="submit">Добавить пользователя</button>
      </form>
    </div>
  )
}
