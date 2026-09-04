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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onCreate({
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: '',
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
        <p>Сервер создаст аккаунт и персональную ссылку — она сразу попадёт в буфер обмена.</p>
        <label className="form-field">
          <span className="field-label">Имя</span>
          <input required className="form-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Иван Петров" />
        </label>
        <button className="modal-primary" type="submit">Создать ссылку</button>
      </form>
    </div>
  )
}
