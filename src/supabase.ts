import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
})
/** Calls an Edge Function with the signed-in user's token attached explicitly (so the function can tell who is calling). */
export async function callFunction<T = unknown>(name: string, body: unknown) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return supabase.functions.invoke<T>(name, {
    body: body as Record<string, unknown>,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

export const GIPHY_KEY = (import.meta.env.VITE_GIPHY_KEY as string | undefined) || ''
