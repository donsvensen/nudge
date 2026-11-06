# Nudge

Private, invite-only PWA messenger for ~20 friends. React + Vite + Supabase.

## Setup
1. Create a Supabase project. Run `supabase/migrations/0001_init.sql`, then `0002_phone_auth.sql`, in the SQL editor
   (enable the `pg_cron` extension first under Database → Extensions if the script complains).
2. **SMS login:** Authentication → Sign In / Providers → **Phone**: enable it, pick a provider (e.g. Twilio Verify)
   and paste its credentials. Turn off "Confirm email"/Email provider if you don't want email login.
   Numbers typed without a country code are assumed `+45` (see `DEFAULT_PREFIX` in `src/Login.tsx`).
   Optional: Auth → URL Configuration → set the Site URL once deployed.
3. `cp .env.example .env` and fill in URL + anon key (+ optional GIPHY key).
4. `npm install && npm run dev`
5. **The first person to sign in becomes the owner** (no invite needed). Then open Admin → create invite links for friends.

## How it works
- **Invite-only:** a DB trigger on `auth.users` rejects signups without a valid invite code.
- **Roles:** owner → admin → member. Only the owner promotes/demotes (`set_role` RPC); admins manage channels, invites and remove members. Enforced by RLS.
- **Auto-delete:** `channels.autodelete_hours`; a `pg_cron` job purges old messages every 15 minutes. Other channels keep messages forever.
- **PWA:** on iPhone, open in Safari → Share → Add to Home Screen.

## Roadmap
Web push notifications, unread badges, reactions, image uploads, polls, search.
