// Pull-to-refresh for touch screens. The installed iPhone app has no browser chrome, so there is no built-in one.
import { useEffect, useRef, useState, type RefObject } from 'react'

const THRESHOLD = 70 // pixels of (damped) pull needed to trigger a refresh
const MAX = 110

export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  enabled = true,
) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const cb = useRef(onRefresh)
  cb.current = onRefresh

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    let startY = 0
    let active = false
    let dist = 0

    const start = (e: TouchEvent) => {
      if (el.scrollTop <= 0 && !busyRef.current) {
        startY = e.touches[0].clientY
        active = true
        dist = 0
      }
    }
    const move = (e: TouchEvent) => {
      if (!active) return
      const dy = e.touches[0].clientY - startY
      if (dy > 0 && el.scrollTop <= 0) {
        dist = Math.min(dy * 0.5, MAX)
        setPull(dist)
        if (dy > 10 && e.cancelable) e.preventDefault() // stop the page itself from bouncing
      } else {
        active = false
        setPull(0)
      }
    }
    const end = async () => {
      if (!active) return
      active = false
      if (dist >= THRESHOLD) {
        busyRef.current = true
        setBusy(true)
        setPull(48)
        try {
          await cb.current()
        } finally {
          busyRef.current = false
          setBusy(false)
          setPull(0)
        }
      } else setPull(0)
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref, enabled])

  return { pull, busy }
}

export function PullIndicator({ pull, busy }: { pull: number; busy: boolean }) {
  if (!pull && !busy) return null
  return (
    <div className="pull" style={{ height: pull }}>
      <span className={busy ? 'spin' : ''} style={busy ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / 50) }}>↻</span>
    </div>
  )
}
