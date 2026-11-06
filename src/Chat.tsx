import { useEffect, useRef, useState } from 'react'
import { GIPHY_KEY, callFunction, supabase } from './supabase'
import { autodeleteLabel, isAdmin, type Channel, type Message, type Profile } from './types'
import GifPicker from './GifPicker'
import { prepareImage } from './image'
import { alertDialog, confirmDialog } from './dialog'

interface Props {
  me: Profile
  channel: Channel
  people: Map<string, Profile>
  onBack: () => void
}

type Likes = Map<string, Set<string>> // message id -> ids of people who liked it

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function Chat({ me, channel, people, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [likes, setLikes] = useState<Likes>(new Map())
  const [selected, setSelected] = useState<string | null>(null) // message whose action row is open
  const [text, setText] = useState('')
  const [gifOpen, setGifOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  // ───── photos ─────
  const [urls, setUrls] = useState<Record<string, string>>({}) // storage path -> temporary signed URL
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const retried = useRef(new Set<string>())

  // The bucket is private, so every photo is shown through a short-lived signed URL.
  useEffect(() => {
    const missing = messages.map((m) => m.image_path).filter((p): p is string => !!p && !urls[p])
    if (!missing.length) return
    supabase.storage
      .from('chat-images')
      .createSignedUrls(missing, 3600)
      .then(({ data }) => {
        if (!data) return
        setUrls((cur) => {
          const n = { ...cur }
          for (const d of data) if (d.path && d.signedUrl) n[d.path] = d.signedUrl
          return n
        })
      })
  }, [messages, urls])

  // A URL may have expired in a long-open app: ask for a fresh one, once.
  function reloadUrl(path: string) {
    if (retried.current.has(path)) return
    retried.current.add(path)
    setUrls((cur) => {
      const n = { ...cur }
      delete n[path]
      return n
    })
  }

  async function sendImage(file: File) {
    setUploading(true)
    try {
      const blob = await prepareImage(file)
      const path = `${channel.id}/${crypto.randomUUID()}.${blob.type === 'image/gif' ? 'gif' : 'jpg'}`
      const up = await supabase.storage.from('chat-images').upload(path, blob, { contentType: blob.type })
      if (up.error) throw up.error
      const body = text.trim()
      const reply_to = replyTo?.id ?? null
      const { data, error } = await supabase
        .from('messages')
        .insert({ channel_id: channel.id, user_id: me.id, body, image_path: path, reply_to })
        .select('id')
        .single()
      if (error) {
        await supabase.storage.from('chat-images').remove([path]) // don't leave an orphan file behind
        throw error
      }
      setText('')
      setReplyTo(null)
      if (data) callFunction('notify', { message_id: data.id }).catch(() => {})
    } catch (e) {
      alertDialog((e as { message?: string }).message ?? 'Could not send the photo.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const addLike = (mid: string, uid: string) =>
    setLikes((cur) => {
      const n = new Map(cur)
      n.set(mid, new Set(n.get(mid)).add(uid))
      return n
    })
  const dropLike = (mid: string, uid: string) =>
    setLikes((cur) => {
      const s = cur.get(mid)
      if (!s?.has(uid)) return cur
      const n = new Map(cur)
      const s2 = new Set(s)
      s2.delete(uid)
      n.set(mid, s2)
      return n
    })

  useEffect(() => {
    let live = true
    setMessages([])
    setLikes(new Map())
    setSelected(null)

    supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel.id)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => live && setMessages(((data ?? []) as Message[]).reverse()))

    supabase
      .from('message_likes')
      .select('message_id, user_id')
      .eq('channel_id', channel.id)
      .limit(5000)
      .then(({ data }) => {
        if (!live) return
        const m: Likes = new Map()
        for (const r of (data ?? []) as { message_id: string; user_id: string }[]) {
          m.set(r.message_id, (m.get(r.message_id) ?? new Set()).add(r.user_id))
        }
        setLikes(m)
      })

    const sub = supabase
      .channel(`msgs-${channel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => {
        if (p.eventType === 'INSERT') {
          const m = p.new as Message
          if (m.channel_id === channel.id) setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]))
        } else if (p.eventType === 'UPDATE') {
          const m = p.new as Message
          setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)))
        } else if (p.eventType === 'DELETE') {
          const id = (p.old as { id: string }).id
          setMessages((cur) => cur.filter((x) => x.id !== id))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_likes' }, (p) => {
        if (p.eventType === 'INSERT') {
          const r = p.new as { message_id: string; user_id: string; channel_id: string }
          if (r.channel_id === channel.id) addLike(r.message_id, r.user_id)
        } else if (p.eventType === 'DELETE') {
          const r = p.old as { message_id?: string; user_id?: string }
          if (r.message_id && r.user_id) dropLike(r.message_id, r.user_id)
        }
      })
      .subscribe()
    return () => {
      live = false
      supabase.removeChannel(sub)
    }
  }, [channel.id])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function send(gif?: string) {
    const body = text.trim()
    if (!body && !gif) return
    if (editing) {
      await supabase.from('messages').update({ body, edited_at: new Date().toISOString() }).eq('id', editing.id)
      setEditing(null)
      setText('')
      return
    }
    setText('')
    setGifOpen(false)
    const reply_to = replyTo?.id ?? null
    setReplyTo(null)
    const { data } = await supabase
      .from('messages')
      .insert({ channel_id: channel.id, user_id: me.id, body, gif_url: gif ?? null, reply_to })
      .select('id')
      .single()
    // Fire-and-forget: ask the server to push-notify everyone else. Failures must never block chatting.
    if (data) callFunction('notify', { message_id: data.id }).catch(() => {})
  }

  async function remove(m: Message) {
    if (!(await confirmDialog('Delete this message?'))) return
    // Delete the message first; .select() lets us notice a refusal that would otherwise be silent.
    const { data, error } = await supabase.from('messages').delete().eq('id', m.id).select('id')
    if (error) return alertDialog(`Could not delete the message: ${error.message}`)
    if (!data?.length) return alertDialog('The message was not deleted. You can only delete your own messages.')
    setMessages((cur) => cur.filter((x) => x.id !== m.id))
    // Then remove the photo file (best effort: the message is already gone either way).
    if (m.image_path) await supabase.storage.from('chat-images').remove([m.image_path])
  }

  async function toggleLike(m: Message) {
    if (channel.archived) return
    if (likes.get(m.id)?.has(me.id)) {
      dropLike(m.id, me.id) // optimistic; undo if the server refuses
      const { error } = await supabase.from('message_likes').delete().eq('message_id', m.id).eq('user_id', me.id)
      if (error) addLike(m.id, me.id)
    } else {
      addLike(m.id, me.id)
      const { error } = await supabase
        .from('message_likes')
        .insert({ message_id: m.id, user_id: me.id, channel_id: channel.id })
      if (error) dropLike(m.id, me.id)
    }
  }

  const byId = new Map(messages.map((m) => [m.id, m]))

  return (
    <div className="screen">
      <header>
        <button onClick={onBack} aria-label="Back">‹</button>
        <div className="grow">
          <b># {channel.name}</b>
          {channel.autodelete_hours && (
            <div className="tiny muted">⏳ messages vanish after {autodeleteLabel(channel.autodelete_hours)}</div>
          )}
        </div>
      </header>

      <div className="messages">
        {messages.map((m, i) => {
          const mine = m.user_id === me.id
          const author = people.get(m.user_id)
          const prev = messages[i - 1]
          const grouped = prev && prev.user_id === m.user_id && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60e3
          const parent = m.reply_to ? byId.get(m.reply_to) : undefined
          const likers = likes.get(m.id)
          const count = likers?.size ?? 0
          const iLike = likers?.has(me.id) ?? false
          const names = [...(likers ?? [])].map((id) => people.get(id)?.display_name ?? 'Someone').join(', ')
          const open = selected === m.id
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''} ${open ? 'open' : ''}`}>
              {!mine && !grouped && (
                <div className="author" style={{ color: author?.avatar_color }}>
                  {author?.display_name ?? 'Someone'}
                </div>
              )}
              <div
                className="bubble"
                onClick={() => setSelected(open ? null : m.id)}
                onDoubleClick={() => toggleLike(m)}
                onMouseDown={(e) => { if (e.detail > 1) e.preventDefault() }} // no text selection on double-click
              >
                {parent && (
                  <div className="quote">
                    {people.get(parent.user_id)?.display_name}: {parent.body || (parent.image_path ? '📷 Photo' : 'GIF')}
                  </div>
                )}
                {m.image_path &&
                  (urls[m.image_path] ? (
                    <img
                      className="gif photo"
                      src={urls[m.image_path]}
                      loading="lazy"
                      onClick={(e) => { e.stopPropagation(); setViewer(urls[m.image_path!]) }}
                      onError={() => reloadUrl(m.image_path!)}
                    />
                  ) : (
                    <div className="photo-ph">📷</div>
                  ))}
                {m.gif_url && <img className="gif" src={m.gif_url} loading="lazy" />}
                {m.body && <span>{m.body}</span>}
                <span className="meta">
                  {m.edited_at && 'edited · '}
                  {time(m.created_at)}
                  {m.image_path && (
                    <button className="more" aria-label="Message options" onClick={(e) => { e.stopPropagation(); setSelected(open ? null : m.id) }}>⋯</button>
                  )}
                </span>
              </div>
              {count > 0 && (
                <button className={`like ${iLike ? 'on' : ''}`} title={names} disabled={channel.archived} onClick={() => toggleLike(m)}>
                  {iLike ? '❤️' : '🤍'} {count}
                </button>
              )}
              {open && count > 0 && <div className="tiny muted likers">❤️ {names}</div>}
              <div className="actions">
                {!channel.archived && <button onClick={() => toggleLike(m)}>{iLike ? 'Unlike' : 'Like'}</button>}
                <button onClick={() => { setReplyTo(m); setSelected(null) }}>Reply</button>
                {mine && m.body && (
                  <button onClick={() => { setEditing(m); setText(m.body); setSelected(null) }}>Edit</button>
                )}
                {(mine || isAdmin(me)) && <button onClick={() => remove(m)}>Delete</button>}
              </div>
            </div>
          )
        })}
        {messages.length === 0 && <p className="muted center-text">No messages yet. Say hi 👋</p>}
        <div ref={bottom} />
      </div>

      {gifOpen && <GifPicker onPick={(u) => send(u)} onClose={() => setGifOpen(false)} />}

      {(replyTo || editing) && (
        <div className="banner">
          <span className="grow">
            {editing ? 'Editing message' : `Replying to ${people.get(replyTo!.user_id)?.display_name}`}
          </span>
          <button onClick={() => { setReplyTo(null); setEditing(null); setText('') }}>✕</button>
        </div>
      )}

      {channel.archived ? (
        <div className="banner" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)', paddingTop: 12 }}>
          🗄 This channel is archived and read-only.
        </div>
      ) : (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send() }}>
          {!editing && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f) }}
              />
              <button type="button" className="cam-btn" disabled={uploading} onClick={() => fileRef.current?.click()} aria-label="Send a photo">
                {uploading ? '…' : '📷'}
              </button>
            </>
          )}
          {GIPHY_KEY && !editing && (
            <button type="button" className="gif-btn" onClick={() => setGifOpen((o) => !o)}>GIF</button>
          )}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={4000} />
          <button className="primary send" disabled={!text.trim()}>↑</button>
        </form>
      )}

      {viewer && (
        <div className="viewer" onClick={() => setViewer(null)}>
          <img src={viewer} />
        </div>
      )}
    </div>
  )
}
