import { useState, type FormEvent } from 'react'
import { Headphones, KeyRound } from 'lucide-react'
import { Logo } from './Logo'

interface LoginScreenProps {
  error?: string | null
  busy?: boolean
  onSubmit: (token: string) => void
}

export function LoginScreen({ error, busy, onSubmit }: LoginScreenProps) {
  const [token, setToken] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = token.trim()
    if (value) onSubmit(value)
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <Logo />
        <span className="modal-icon"><KeyRound size={23} /></span>
        <h1>Вход в разметку</h1>
        <p>
          Вставьте персональный код доступа из вашей ссылки-приглашения.
          Обычно достаточно просто открыть присланную ссылку — тогда код подставится сам.
        </p>
        <label className="form-field">
          <span className="field-label">Код доступа</span>
          <input
            autoFocus
            className="form-input"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="например, 8Fk2pQ7x-Lm"
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="modal-primary" type="submit" disabled={busy}>
          <Headphones size={18} /> {busy ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
