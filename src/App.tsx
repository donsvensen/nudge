import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './supabase'
import { autodeleteLabel, isAdmin, type Channel, type Message, type Profile } from './types'
import { validPin } from './phone'
import { disablePush, enablePush, pushState, syncPush, type PushState } from './push'
import Login from './Login'
import Chat from './Chat'
import Admin from './Admin'

type View = { name: 'list' } | { name: 'chat'; id: string } | { name: 'admin' }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [people, setPeople] = useState<Profile[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [view, setView] = useState<View>({ name: 'list' })
  const [loaded, setLoaded] = useState(false)
  const [unread, setUnread] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!configured) return setSession(null)
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const load = useCallback(async () => {
    const [p, c0] = await Promise.all([
      supabase.from('profiles').select('*').order('display_name'),
      supabase.from('channels').select('*').order('position').order('name'),
    ])
    // Fallback so the app still works before migration 0008 (position/archived columns) has been run.
    const c = c0.error ? await supabase.from('channels').select('*').order('name') : c0
    setPeople((p.data ?? []) as Profile[])
    setChannels(((c.data ?? []) as Channel[]).map((ch, i) => ({ ...ch, position: ch.position ?? i, archived: ch.archived ?? false })))
    setLoaded(true)
  }, [])

  async function changePin() {
    const pin = prompt('Choose a new PIN (6–12 digits)')
    if (pin === null) return
    if (!validPin(pin)) return alert('The PIN must be 6–12 digits.')
    const { error } = await supabase.auth.updateUser({ password: pin })
    alert(error ? error.message : 'PIN changed.')
  }

  useEffect(() => {
    if (session) {
      setLoaded(false)
      load()
    }
  }, [session, load])

  // ───── unread counts ─────
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  const refreshUnread = useCallback(async () => {
    const { data } = await supabase.rpc('unread_counts')
    const next: Record<string, number> = {}
    for (const r of (data ?? []) as { channel_id: string; unread: number }[]) next[r.channel_id] = Number(r.unread)
    setUnread(next)
  }, [])

  const markRead = useCallback(async (id: string) => {
    setUnread((u) => (u[id] ? { ...u, [id]: 0 } : u))
    await supabase.rpc('mark_read', { cid: id })
  }, [])

  useEffect(() => {
    if (!session) return
    refreshUnread()
    const sub = supabase
      .channel('unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new as Message
        if (m.user_id === session.user.id) return
        const v = viewRef.current
        if (v.name === 'chat' && v.id === m.channel_id) markRead(m.channel_id)
        else setUnread((u) => ({ ...u, [m.channel_id]: (u[m.channel_id] ?? 0) + 1 }))
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [session, refreshUnread, markRead])

  useEffect(() => { if (view.name === 'list' && session) refreshUnread() }, [view.name, session, refreshUnread])

  // Pick up changes made by others (new/renamed/archived channels, new friends) when the app comes back to the front.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && session) {
        load()
        refreshUnread()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [session, load, refreshUnread])

  const total = channels.filter((c) => !c.archived).reduce((a, c) => a + (unread[c.id] ?? 0), 0)
  useEffect(() => {
    document.title = total ? `(${total}) Nudge` : 'Nudge'
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    try {
      if (total) nav.setAppBadge?.(total)?.catch(() => {})
      else nav.clearAppBadge?.()?.catch(() => {})
    } catch { /* badges are optional */ }
  }, [total])

  // ───── push notifications ─────
  const [push, setPush] = useState<PushState>(pushState())
  useEffect(() => { if (session) syncPush(session.user.id) }, [session])

  async function turnOnPush() {
    if (session) setPush(await enablePush(session.user.id))
  }
  async function signOut() {
    await disablePush()
    await supabase.auth.signOut()
  }

  // Open a channel from a notification tap: cold start via ?channel=…, or a message to the running app.
  const pendingChannel = useRef<string | null>(new URLSearchParams(location.search).get('channel'))
  useEffect(() => {
    const id = pendingChannel.current
    if (!loaded || !id) return
    pendingChannel.current = null
    history.replaceState(null, '', location.pathname)
    if (channels.some((c) => c.id === id)) {
      markRead(id)
      setView({ name: 'chat', id })
    }
  }, [loaded, channels, markRead])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== 'open-url') return
      const id = new URL(e.data.url, location.origin).searchParams.get('channel')
      if (id) {
        markRead(id)
        setView({ name: 'chat', id })
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [markRead])

  function openChat(id: string) {
    markRead(id)
    setView({ name: 'chat', id })
  }
  function leaveChat(id: string) {
    markRead(id)
    setView({ name: 'list' })
  }

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
  if (!me && !loaded) return <div className="center muted">Loading…</div>
  if (!me)
    return (
      <div className="center">
        <h1>Account not found</h1>
        <p className="muted">Your account may have been removed. Ask an admin.</p>
        <button className="primary" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    )

  if (view.name === 'admin')
    return <Admin me={me} people={people} channels={channels} onChanged={load} onBack={() => setView({ name: 'list' })} />

  if (view.name === 'chat') {
    const ch = channels.find((c) => c.id === view.id)
    if (ch) return <Chat me={me} channel={ch} people={map} onBack={() => leaveChat(ch.id)} />
  }

  const activeChannels = channels.filter((c) => !c.archived)
  const archivedChannels = channels.filter((c) => c.archived)

  return (
    <div className="screen">
      <header>
        <b className="grow">Nudge</b>
        {isAdmin(me) && <button onClick={() => setView({ name: 'admin' })}>Admin</button>}
        <button onClick={changePin}>PIN</button>
        <button onClick={signOut}>Sign out</button>
      </header>
      <div className="scroll">
        {push === 'default' && (
          <div className="cta">
            <span className="grow">🔔 Get a ping when friends write</span>
            <button className="primary" onClick={turnOnPush}>Turn on</button>
          </div>
        )}
        {push === 'needs-install' && (
          <div className="cta">
            <span className="grow">🔔 For notifications: Share → Add to Home Screen, then open Nudge from the icon.</span>
          </div>
        )}
        {activeChannels.map((c) => (
          <button key={c.id} className={`channel ${unread[c.id] ? 'unread' : ''}`} onClick={() => openChat(c.id)}>
            <span># {c.name}</span>
            <span className="tiny muted row" style={{ padding: 0 }}>
              {c.is_private && '🔒 '}
              {c.autodelete_hours ? `⏳ ${autodeleteLabel(c.autodelete_hours)}` : ''}
              {unread[c.id] > 0 && <span className="badge">{unread[c.id] > 99 ? '99+' : unread[c.id]}</span>}
            </span>
          </button>
        ))}
        {archivedChannels.length > 0 && (
          <details className="archive">
            <summary>🗄 Archive ({archivedChannels.length})</summary>
            {archivedChannels.map((c) => (
              <button key={c.id} className="channel" onClick={() => openChat(c.id)}>
                <span className="muted"># {c.name}</span>
              </button>
            ))}
          </details>
        )}
        <p className="tiny muted pad">
          Signed in as {me.display_name}{me.role !== 'member' ? ` (${me.role})` : ''} · {people.length} friends
        </p>
      </div>
    </div>
  )
}
