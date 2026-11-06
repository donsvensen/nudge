import { useState } from 'react'
import { supabase } from './supabase'
import { DEFAULT_PREFIX, normalizePhone } from './phone'

export default function Login() {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ phone: normalizePhone(phone), password: pin })
    setBusy(false)
    if (error) {
      setError(
        /invalid login|credentials/i.test(error.message)
          ? 'Wrong number or PIN. Ask an admin if you need a new PIN.'
          : error.message,
      )
    }
  }

  return (
    <form className="center" onSubmit={submit}>
      <div className="logo">◎</div>
      <h1>Nudge</h1>
      <p className="muted">Private chat for friends. Ask an admin to add you.</p>
      <input type="tel" required placeholder={`Mobile number (${DEFAULT_PREFIX} …)`} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="username" />
      <input
        type="password"
        inputMode="numeric"
        required
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        autoComplete="current-password"
        maxLength={12}
      />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || pin.length < 6}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
