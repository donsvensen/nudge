import { useState } from 'react'
import { supabase } from './supabase'
import { DEFAULT_PREFIX, normalizePhone, randomPin } from './phone'
import { autodeleteLabel, type Channel, type Profile, type Role } from './types'

interface Props {
  me: Profile
  people: Profile[]
  channels: Channel[]
  onChanged: () => void
  onBack: () => void
}

async function adminCall(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (data?.error) return data.error as string
  return error ? error.message : null
}

export default function Admin({ me, people, channels, onChanged, onBack }: Props) {
  const [fName, setFName] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fPin, setFPin] = useState(randomPin())
  const [name, setName] = useState('')
  const [priv, setPriv] = useState(false)
  const [auto, setAuto] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')
  const [share, setShare] = useState('')

  async function copy(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); setMsg(ok) } catch { setMsg('Copy this manually:') }
    setShare(text)
  }

  const invitation = (n: string, phone: string, pin: string) =>
    `Hi ${n}! Join our chat Nudge: ${location.origin}\nNumber: ${phone}\nPIN: ${pin}\n(Open it in Safari or Chrome, then Share → Add to Home Screen.)`

  async function addFriend(e: React.FormEvent) {
    e.preventDefault()
    const phone = normalizePhone(fPhone)
    const err = await adminCall({ action: 'create', name: fName.trim(), phone, pin: fPin })
    if (err) return setMsg(err)
    await copy(invitation(fName.trim(), phone, fPin), `${fName.trim()} added. Message copied, send it to them.`)
    setFName(''); setFPhone(''); setFPin(randomPin())
    onChanged()
  }

  async function resetPin(p: Profile) {
    const pin = randomPin()
    const err = await adminCall({ action: 'reset_pin', user_id: p.id, pin })
    if (err) return setMsg(err)
    await copy(`New Nudge PIN for ${p.display_name}: ${pin}`, `New PIN for ${p.display_name} copied.`)
  }

  async function removeMember(p: Profile) {
    if (!confirm(`Remove ${p.display_name}? Their messages are deleted too.`)) return
    const err = await adminCall({ action: 'delete', user_id: p.id })
    setMsg(err ?? `${p.display_name} removed`)
    onChanged()
  }

  async function setRole(id: string, role: Role) {
    const { error } = await supabase.rpc('set_role', { target: id, new_role: role })
    setMsg(error ? error.message : 'Role updated')
    onChanged()
  }

  async function addChannel(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('channels')
      .insert({ name: name.trim(), is_private: priv, autodelete_hours: auto ? Number(auto) : null, created_by: me.id })
      .select()
      .single()
    if (error) return setMsg(error.message)
    if (priv && data) {
      const ids = new Set([...picked, me.id])
      await supabase.from('channel_members').insert([...ids].map((user_id) => ({ channel_id: data.id, user_id })))
    }
    setName(''); setPriv(false); setAuto(''); setPicked(new Set())
    setMsg('Channel created')
    onChanged()
  }

  async function setAutodelete(c: Channel, v: string) {
    await supabase.from('channels').update({ autodelete_hours: v ? Number(v) : null }).eq('id', c.id)
    onChanged()
  }

  const isOwner = me.role === 'owner'
  const canManage = (p: Profile) => p.role !== 'owner' && p.id !== me.id && (isOwner || p.role === 'member')

  return (
    <div className="screen">
      <header>
        <button onClick={onBack} aria-label="Back">‹</button>
        <b className="grow">Admin</b>
      </header>
      <div className="scroll pad">
        {msg && <p className="notice">{msg}</p>}
        {share && <pre className="share">{share}</pre>}

        <h3>Add a friend</h3>
        <button type="button" className="linkbtn" onClick={() => copy(location.origin, 'App link copied')}>
          📋 Copy app link <span className="muted tiny">{location.origin.replace(/^https?:\/\//, '')}</span>
        </button>
        <form onSubmit={addFriend} className="stack" style={{ marginTop: 0 }}>
          <input required placeholder="Name" value={fName} onChange={(e) => setFName(e.target.value)} maxLength={40} />
          <input required type="tel" placeholder={`Mobile number (${DEFAULT_PREFIX} …)`} value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
          <div className="row">
            <input className="grow" inputMode="numeric" placeholder="PIN (6–12 digits)" value={fPin} onChange={(e) => setFPin(e.target.value.replace(/\D/g, ''))} maxLength={12} />
            <button type="button" onClick={() => setFPin(randomPin())}>New</button>
          </div>
          <button className="primary" disabled={fPin.length < 6}>Add friend</button>
        </form>

        <h3>Members</h3>
        {people.map((p) => (
          <div key={p.id} className="row">
            <span className="dot" style={{ background: p.avatar_color }} />
            <span className="grow">{p.display_name}</span>
            {p.role === 'owner' ? (
              <span className="tag">owner</span>
            ) : isOwner ? (
              <select value={p.role} onChange={(e) => setRole(p.id, e.target.value as Role)}>
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            ) : (
              <span className="tag">{p.role}</span>
            )}
            {canManage(p) && <button onClick={() => resetPin(p)}>New PIN</button>}
            {canManage(p) && <button className="danger" onClick={() => removeMember(p)}>Remove</button>}
          </div>
        ))}

        <h3>Channels</h3>
        {channels.map((c) => (
          <div key={c.id} className="row">
            <span className="grow"># {c.name} {c.is_private && '🔒'}</span>
            <select value={c.autodelete_hours ?? ''} onChange={(e) => setAutodelete(c, e.target.value)}>
              <option value="">keep forever</option>
              <option value="24">delete after 1d</option>
              <option value="168">delete after 7d</option>
              <option value="720">delete after 30d</option>
            </select>
          </div>
        ))}

        <form onSubmit={addChannel} className="stack">
          <h4>New channel</h4>
          <input required placeholder="channel-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <select value={auto} onChange={(e) => setAuto(e.target.value)}>
            <option value="">Keep messages forever</option>
            <option value="24">Auto-delete after 1 day</option>
            <option value="168">Auto-delete after 7 days</option>
            <option value="720">Auto-delete after 30 days</option>
          </select>
          <label className="row"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private (invite-only members)</label>
          {priv && people.filter((p) => p.id !== me.id).map((p) => (
            <label key={p.id} className="row">
              <input type="checkbox" checked={picked.has(p.id)} onChange={(e) => {
                const n = new Set(picked); e.target.checked ? n.add(p.id) : n.delete(p.id); setPicked(n)
              }} /> {p.display_name}
            </label>
          ))}
          <button className="primary">Create channel</button>
        </form>
        <p className="tiny muted">Auto-delete runs every 15 minutes. In use: {channels.map((c) => autodeleteLabel(c.autodelete_hours)).filter(Boolean).join(', ') || 'none'}.</p>
      </div>
    </div>
  )
}
