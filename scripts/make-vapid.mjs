// Generates a VAPID key pair for web push, without printing the private key.
// - private key + subject -> vapid.local.json (git-ignored); paste into Supabase Edge Function secrets
// - public key           -> appended to .env as VITE_VAPID_PUBLIC_KEY, and printed (it is public by design)
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'

if (existsSync('vapid.local.json')) {
  console.log('vapid.local.json already exists, not overwriting. Delete it first to rotate keys.')
  process.exit(1)
}
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = privateKey.export({ format: 'jwk' })
const b64 = (s) => Buffer.from(s, 'base64url')
const publicKey = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]).toString('base64url')

const subject = process.argv[2] || 'https://example.com'
writeFileSync(
  'vapid.local.json',
  JSON.stringify({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: subject }, null, 2) + '\n',
)

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
if (!/^VITE_VAPID_PUBLIC_KEY=/m.test(env)) {
  appendFileSync('.env', `${env.endsWith('\n') || env === '' ? '' : '\n'}VITE_VAPID_PUBLIC_KEY=${publicKey}\n`)
}
console.log('Public key (safe to share):', publicKey)
console.log('Private key written to vapid.local.json (do not commit or share it).')
