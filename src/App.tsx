import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './supabase'
import { autodeleteLabel, isAdmin, type Channel, type Profile } from './types'
import Login from './Login'
import Chat from './Chat'
import Admin from './Admin'

type View = { name: 'list' } | { name: 'chat'; id: string } | { name: 'admin' }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [people, setPeople] = useState<Profile[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    if (!configured) return setSession(null)
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('channels').select('*').order('name'),
    ])
    setPeople((p.data ?? []) as Profile[])
    setChannels((c.data ?? []) as Channel[])
  }, [])

  useEffect(() => {
    if (session) load()
  }, [session, load])

  const map = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const me = session ? map.get(session.user.id) ?? null : null

  if (!configured)
    return (
      <div className="center">
        <h1>Setup needed</h1>
        <p className="muted">Copy <code>.env.example</code> to <code>.env</code> and add your Supabase URL and anon key, then restart.</p>
      </div>
    )
  if (session === undefined) return <div className="center muted">Loading…</div>
  if (!session) return <Login />
  if (!me) return <div className="center muted">Loading…</div>

  if (view.name === 'admin')
    return <Admin me={me} people={people} channels={channels} onChanged={load} onBack={() => setView({ name: 'list' })} />

  if (view.name === 'chat') {
    const ch = channels.find((c) => c.id === view.id)
    if (ch) return <Chat me={me} channel={ch} people={map} onBack={() => setView({ name: 'list' })} />
  }

  return (
    <div className="screen">
      <header>
        <b className="grow">Nudge</b>
        {isAdmin(me) && <button onClick={() => setView({ name: 'admin' })}>Admin</button>}
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <div className="scroll">
        {channels.map((c) => (
          <button key={c.id} className="channel" onClick={() => setView({ name: 'chat', id: c.id })}>
            <span># {c.name}</span>
            <span className="tiny muted">
              {c.is_private && '🔒 '}
              {c.autodelete_hours ? `⏳ ${autodeleteLabel(c.autodelete_hours)}` : ''}
            </span>
          </button>
        ))}
        <p className="tiny muted pad">
          Signed in as {me.display_name}{me.role !== 'member' ? ` (${me.role})` : ''} · {people.length} friends
        </p>
      </div>
    </div>
  )
}
