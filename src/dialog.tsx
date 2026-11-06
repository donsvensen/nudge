// In-app replacements for window.confirm / prompt / alert.
// Native dialogs don't work in every embedded browser (and look out of place in the installed app).
import { useEffect, useState } from 'react'

type Req =
  | { kind: 'confirm'; text: string; resolve: (v: boolean) => void }
  | { kind: 'prompt'; text: string; initial: string; secret: boolean; resolve: (v: string | null) => void }
  | { kind: 'alert'; text: string; resolve: () => void }

let show: ((r: Req) => void) | null = null

export const confirmDialog = (text: string) =>
  new Promise<boolean>((resolve) => (show ? show({ kind: 'confirm', text, resolve }) : resolve(window.confirm(text))))

export const promptDialog = (text: string, initial = '', secret = false) =>
  new Promise<string | null>((resolve) =>
    show ? show({ kind: 'prompt', text, initial, secret, resolve }) : resolve(window.prompt(text, initial)),
  )

export const alertDialog = (text: string) =>
  new Promise<void>((resolve) => {
    if (show) show({ kind: 'alert', text, resolve })
    else {
      window.alert(text)
      resolve()
    }
  })

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    show = (r) => {
      setReq(r)
      setValue(r.kind === 'prompt' ? r.initial : '')
    }
    return () => { show = null }
  }, [])

  if (!req) return null

  const done = (ok: boolean) => {
    if (req.kind === 'confirm') req.resolve(ok)
    else if (req.kind === 'prompt') req.resolve(ok ? value : null)
    else req.resolve()
    setReq(null)
  }

  return (
    <div className="dialog-back" onClick={() => done(false)}>
      <form className="dialog" role="dialog" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); done(true) }}>
        <p>{req.text}</p>
        {req.kind === 'prompt' && (
          <input
            autoFocus
            type={req.secret ? 'password' : 'text'}
            inputMode={req.secret ? 'numeric' : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="dialog-actions">
          {req.kind !== 'alert' && <button type="button" onClick={() => done(false)}>Cancel</button>}
          <button className="primary" autoFocus={req.kind !== 'prompt'}>OK</button>
        </div>
      </form>
    </div>
  )
}
