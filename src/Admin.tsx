import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { autodeleteLabel, type Channel, type Profile, type Role } from './types'

interface Props {
  me: Profile
  people: Profile[]
  channels: Channel[]
  onChanged: () => void
  onBack: () => void
}

interface Invite {
  code: string
  uses: number
  max_uses: number
  expires_at: string
}

const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

export default function Admin({ me, people, channels, onChanged, onBack }: Props) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [name, setName] = useState('')
  const [priv, setPriv] = useState(false)
  const [auto, setAuto] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')

  const loadInvites = () =>
    supabase.from('invites').select('*').order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setInvites((data ?? []) as Invite[]))
  useEffect(() => { loadInvites() }, [])

  async function newInvite() {
    const c = code()
    const { error } = await supabase.from('invites').insert({ code: c, max_uses: 1 })
    if (error) return setMsg(error.message)
    const link = `${location.origin}/?invite=${c}`
    try { await navigator.clipboard.writeText(link); setMsg('Invite link copied') } catch { setMsg(link) }
    loadInvites()
  }

  async function setRole(id: string, role: Role) {
    const { error } = await supabase.rpc('set_role', { target: id, new_role: role })
    setMsg(error ? error.message : 'Role updated')
    onChanged()
  }

  async function removeMember(p: Profile) {
    if (!confirm(`Remove ${p.display_name}? Their messages are deleted too.`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', p.id)
    setMsg(error ? error.message : 'Removed')
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

  return (
    <div className="screen">
      <header>
        <button onClick={onBack} aria-label="Back">‹</button>
        <b className="grow">Admin</b>
      </header>
      <div className="scroll pad">
        {msg && <p className="notice">{msg}</p>}

        <h3>Invite a friend</h3>
        <button className="primary" onClick={newInvite}>Create single-use invite link</button>
        {invites.map((i) => (
          <div key={i.code} className="row tiny muted">
            <span className="grow">{i.code}</span>
            <span>{i.uses}/{i.max_uses} used · expires {new Date(i.expires_at).toLocaleDateString()}</span>
          </div>
        ))}

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
            {p.role === 'member' && <button className="danger" onClick={() => removeMember(p)}>Remove</button>}
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
        <p className="tiny muted">Auto-delete runs every 15 minutes. Current options: {channels.map((c) => autodeleteLabel(c.autodelete_hours)).filter(Boolean).join(', ') || 'none in use'}.</p>
      </div>
    </div>
  )
}
