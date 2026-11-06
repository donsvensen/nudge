# Nudge

Private, admin-managed PWA messenger for ~20 friends. React + Vite + Supabase.
Friends sign in with **phone number + PIN**. No SMS, no email, no third-party providers.

## Setup
1. Create a Supabase project. Run the migrations in `supabase/migrations/` in order (0001 → 0004) in the SQL editor
   (enable `pg_cron` under Database → Extensions first if 0001 complains).
2. **Edge Function:** Dashboard → Edge Functions → *Deploy a new function* → *Via Editor*, name it `admin-users`,
   paste `supabase/functions/admin-users/index.ts`, deploy. (Or `supabase functions deploy admin-users` with the CLI.)
3. **Close public signups:** Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
   Keep the **Phone** provider enabled (needed for phone+password login) — no SMS provider is required.
4. `cp .env.example .env`, fill in URL + anon key (+ optional GIPHY key). `npm install && npm run dev`.
5. **Owner PIN (one time):** the first account is the owner. Give it a PIN in the SQL editor:
   ```sql
   update auth.users set encrypted_password = extensions.crypt('CHOOSE-A-6-TO-12-DIGIT-PIN', extensions.gen_salt('bf'))
   where phone = '<owner phone without +, e.g. 4512345678>';
   ```
6. Sign in, open **Admin → Add a friend**: enter name, number and PIN, then send the copied message to them.

## How it works
- **Users are created only by admins** through the `admin-users` Edge Function (uses the service-role key server-side).
  A DB trigger also rejects any account not created that way, even if public signups are left on.
- **Roles:** owner → admin → member. Only the owner promotes/demotes (`set_role`); admins add/remove members and reset PINs. Enforced by RLS.
- **Auto-delete:** `channels.autodelete_hours`; a `pg_cron` job purges old messages every 15 minutes.
- **PWA:** on iPhone open in Safari (not an in-app browser) → Share → Add to Home Screen.

## Security notes
- PINs are 6–12 digits and stored as bcrypt hashes by Supabase Auth. Supabase rate-limits sign-in attempts, but a short numeric PIN is weaker than a password; fine for a private friends' app.
- Never put the `service_role` key in the app or `.env`.

## Roadmap
Web push notifications, unread badges, reactions, image uploads, polls, search, in-app-browser banner.
