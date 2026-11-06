export type Role = 'owner' | 'admin' | 'member'

export interface Profile {
  id: string
  display_name: string
  avatar_color: string
  role: Role
}

export interface Channel {
  id: string
  name: string
  is_private: boolean
  autodelete_hours: number | null
  position: number
  archived: boolean
}

export interface Message {
  id: string
  channel_id: string
  user_id: string
  body: string
  gif_url: string | null
  image_path: string | null
  reply_to: string | null
  created_at: string
  edited_at: string | null
}

export const isAdmin = (p: Profile | null) => p?.role === 'owner' || p?.role === 'admin'

export function autodeleteLabel(h: number | null) {
  if (!h) return ''
  if (h % 24 === 0) return `${h / 24}d`
  return `${h}h`
}
