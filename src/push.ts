import { supabase } from './supabase'

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || ''

export type PushState = 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied'

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function pushState(): PushState {
  if (!VAPID_PUBLIC) return 'unsupported'
  // iPhones only allow web push for apps added to the Home Screen.
  if (isIos && !isStandalone) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return Notification.permission as PushState
}

function keyBytes(b64url: string) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function save(sub: PushSubscription, userId: string) {
  const j = sub.toJSON()
  await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' },
    { onConflict: 'endpoint' },
  )
}

/** Must be called from a tap (browsers require a user gesture to ask for permission). */
export async function enablePush(userId: string): Promise<PushState> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm as PushState
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }))
  await save(sub, userId)
  return 'granted'
}

/** Quietly re-save this device's subscription on each launch (it can change or be pruned). */
export async function syncPush(userId: string) {
  if (pushState() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await save(sub, userId)
  } catch { /* push is optional */ }
}

/** Stop notifications on this device (used on sign out, so a shared phone stops pinging the old user). */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch { /* ignore */ }
}
