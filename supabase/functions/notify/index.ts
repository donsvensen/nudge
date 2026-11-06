// Supabase Edge Function: notify
// The sender's app calls this right after posting a message. We verify the caller really wrote that
// message, then send a web push to everyone else who can see the channel.
// Secrets required (Edge Functions -> Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '')
    const { data: caller } = await admin.auth.getUser(jwt)
    if (!caller.user) return json({ error: 'Not signed in' }, 401)

    const { message_id } = await req.json()
    const { data: msg } = await admin.from('messages').select('*').eq('id', message_id).single()
    if (!msg || msg.user_id !== caller.user.id) return json({ error: 'Not your message' }, 403)
    // Ignore old messages so an id cannot be replayed to re-notify everyone.
    if (Date.now() - new Date(msg.created_at).getTime() > 2 * 60_000) return json({ ok: true, skipped: 'too old' })

    const [{ data: channel }, { data: sender }] = await Promise.all([
      admin.from('channels').select('id, name, is_private').eq('id', msg.channel_id).single(),
      admin.from('profiles').select('display_name').eq('id', msg.user_id).single(),
    ])
    if (!channel) return json({ ok: true })

    // Who can see this channel? Private: its members. Public: everyone. Never the sender.
    let recipients: string[]
    if (channel.is_private) {
      const { data } = await admin.from('channel_members').select('user_id').eq('channel_id', channel.id)
      recipients = (data ?? []).map((r) => r.user_id)
    } else {
      const { data } = await admin.from('profiles').select('id')
      recipients = (data ?? []).map((r) => r.id)
    }
    recipients = recipients.filter((id) => id !== msg.user_id)
    if (!recipients.length) return json({ ok: true, sent: 0 })

    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', recipients)
    if (!subs?.length) return json({ ok: true, sent: 0 })

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )

    const body = msg.body ? String(msg.body).slice(0, 140) : msg.image_path ? '📷 Sent a photo' : msg.gif_url ? 'Sent a GIF' : 'New message'
    const payload = JSON.stringify({
      title: `${sender?.display_name ?? 'Someone'} · #${channel.name}`,
      body,
      url: `/?channel=${channel.id}`,
      tag: channel.id,
    })

    let sent = 0
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 })
          sent++
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          // 404/410 = the device unsubscribed or the app was removed: forget it.
          if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
        }
      }),
    )
    return json({ ok: true, sent })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
})
