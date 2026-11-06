// Supabase Edge Function: admin-users
// Lets owners/admins create friends (phone + PIN), reset a PIN, or remove a user.
// Runs with the service_role key (injected by Supabase as an env var, never shipped to the browser).
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

    // 1. Who is calling, and are they an admin?
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '')
    const { data: caller } = await admin.auth.getUser(jwt)
    if (!caller.user) return json({ error: 'Not signed in' }, 401)
    const { data: me } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
    if (!me || !['owner', 'admin'].includes(me.role)) return json({ error: 'Admins only' }, 403)

    const body = await req.json()
    const pinOk = (p: unknown) => typeof p === 'string' && /^\d{6,12}$/.test(p)

    // Admins may manage members; only the owner may manage admins; nobody manages the owner here.
    const canManage = async (targetId: string) => {
      const { data: t } = await admin.from('profiles').select('role').eq('id', targetId).single()
      if (!t || t.role === 'owner' || targetId === caller.user!.id) return false
      return me.role === 'owner' || t.role === 'member'
    }

    if (body.action === 'create') {
      const phone = String(body.phone ?? '')
      const name = String(body.name ?? '').trim()
      if (!/^\+\d{8,15}$/.test(phone)) return json({ error: 'Phone must look like +4512345678' }, 400)
      if (!name || name.length > 40) return json({ error: 'Name is required (max 40 characters)' }, 400)
      if (!pinOk(body.pin)) return json({ error: 'PIN must be 6–12 digits' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        phone,
        password: body.pin,
        phone_confirm: true,
        user_metadata: { display_name: name },
        app_metadata: { nudge_admin_created: true },
      })
      if (error) return json({ error: /already|registered|exists/i.test(error.message) ? 'That number already has an account' : error.message }, 400)
      return json({ ok: true, id: data.user?.id })
    }

    if (body.action === 'reset_pin') {
      if (!pinOk(body.pin)) return json({ error: 'PIN must be 6–12 digits' }, 400)
      if (!(await canManage(body.user_id))) return json({ error: 'You cannot change this user' }, 403)
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.pin })
      return error ? json({ error: error.message }, 400) : json({ ok: true })
    }

    if (body.action === 'delete') {
      if (!(await canManage(body.user_id))) return json({ error: 'You cannot remove this user' }, 403)
      const { error } = await admin.auth.admin.deleteUser(body.user_id) // cascades to profile + messages
      return error ? json({ error: error.message }, 400) : json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500)
  }
})
