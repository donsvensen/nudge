import { useState } from 'react'
import { supabase } from './supabase'

// Numbers typed without a country code are assumed to be Danish. Change if needed.
const DEFAULT_PREFIX = '+45'

function normalizePhone(raw: string) {
  let p = raw.replace(/[\s().-]/g, '')
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (!p.startsWith('+')) p = DEFAULT_PREFIX + p
  return p
}

export default function Login() {
  const params = new URLSearchParams(location.search)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [invite, setInvite] = useState(params.get('invite') ?? '')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'details' | 'code'>('details')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const e164 = normalizePhone(phone)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164,
      options: { data: { invite: invite.trim(), display_name: name.trim() } },
    })
    setBusy(false)
    if (error) {
      // Supabase reports any signup-trigger failure (e.g. a bad invite) as "Database error saving new user".
      setError(
        /database error|invite/i.test(error.message)
          ? `Could not sign you up: ${error.message}. If you are new, check your invite code is valid and not expired.`
          : error.message,
      )
    } else setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'sms' })
    setBusy(false)
    if (error) setError('That code did not work. Check it and try again, or request a new one.')
    else history.replaceState(null, '', location.pathname) // drop ?invite= from the URL
  }

  if (step === 'code')
    return (
      <form className="center" onSubmit={verify}>
        <div className="logo">◎</div>
        <h1>Enter your code</h1>
        <p className="muted">
          We texted a code to <b>{e164}</b>. You stay signed in on this device.
        </p>
        <input
          className="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          maxLength={10}
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || code.length < 6}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        <button type="button" onClick={() => { setStep('details'); setCode(''); setError('') }}>
          Use a different number
        </button>
      </form>
    )

  return (
    <form className="center" onSubmit={sendCode}>
      <div className="logo">◎</div>
      <h1>Nudge</h1>
      <p className="muted">Private chat for friends. Invite only.</p>
      <input type="tel" required placeholder={`Mobile number (${DEFAULT_PREFIX} …)`} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      <input placeholder="Your name (first time only)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      <input placeholder="Invite code (first time only)" value={invite} onChange={(e) => setInvite(e.target.value)} autoCapitalize="none" />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? 'Sending…' : 'Text me a sign-in code'}
      </button>
    </form>
  )
}
