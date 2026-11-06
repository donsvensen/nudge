// Numbers typed without a country code are assumed to be Danish. Change if needed.
export const DEFAULT_PREFIX = '+45'

export function normalizePhone(raw: string) {
  let p = raw.replace(/[\s().-]/g, '')
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (!p.startsWith('+')) p = DEFAULT_PREFIX + p
  return p
}

export const validPin = (p: string) => /^\d{6,12}$/.test(p)

export const randomPin = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')
