import { useEffect, useState } from 'react'
import { GIPHY_KEY } from './supabase'

interface Gif {
  id: string
  images: { fixed_height_small: { url: string }; downsized: { url: string } }
}

export default function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState<Gif[]>([])

  useEffect(() => {
    const t = setTimeout(async () => {
      const base = 'https://api.giphy.com/v1/gifs'
      const url = q.trim()
        ? `${base}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
        : `${base}/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`
      try {
        const r = await fetch(url)
        const j = await r.json()
        setGifs(j.data ?? [])
      } catch {
        setGifs([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="sheet">
      <div className="sheet-head">
        <input autoFocus placeholder="Search GIFs…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="gif-grid">
        {gifs.map((g) => (
          <img key={g.id} src={g.images.fixed_height_small.url} loading="lazy" onClick={() => onPick(g.images.downsized.url)} />
        ))}
      </div>
      <div className="muted tiny">Powered by GIPHY</div>
    </div>
  )
}
