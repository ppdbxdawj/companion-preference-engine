import { timingSafeEqual } from 'node:crypto'

export const MIN_RUNTIME_TOKEN_BYTES = 32

export type RuntimeAuthDecision =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false
      status: 401 | 403
      code: 'unauthorized' | 'forbidden'
    }>

export type RuntimeAuthPolicy = Readonly<{
  authorize: (request: Request) => RuntimeAuthDecision
}>

export type RuntimeAuthPolicyOptions = Readonly<{
  token: string
  allowedOrigins: readonly string[]
}>

const encoder = new TextEncoder()

const tokenBytes = (token: string): Uint8Array => encoder.encode(token)

const assertAllowedOrigin = (origin: string): string => {
  if (origin === '*' || origin === 'null') {
    throw new Error('Runtime browser origins must be explicit')
  }

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error('Runtime browser origins must be valid origins')
  }

  if (
    parsed.origin !== origin
    || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username !== ''
    || parsed.password !== ''
  ) {
    throw new Error('Runtime browser origins must be exact HTTP(S) origins')
  }
  return origin
}

const matchesToken = (provided: string, expected: Uint8Array): boolean => {
  const providedBytes = tokenBytes(provided)
  if (providedBytes.byteLength !== expected.byteLength) return false
  return timingSafeEqual(providedBytes, expected)
}

export const createRuntimeAuthPolicy = (
  options: RuntimeAuthPolicyOptions,
): RuntimeAuthPolicy => {
  const expectedToken = tokenBytes(options.token)
  if (expectedToken.byteLength < MIN_RUNTIME_TOKEN_BYTES) {
    throw new Error(`Runtime token must contain at least ${MIN_RUNTIME_TOKEN_BYTES} UTF-8 bytes`)
  }

  const allowedOrigins = new Set(options.allowedOrigins.map(assertAllowedOrigin))

  return Object.freeze({
    authorize(request: Request): RuntimeAuthDecision {
      const authorization = request.headers.get('authorization')
      const match = authorization === null ? null : /^Bearer ([^\s]+)$/.exec(authorization)
      if (!match?.[1] || !matchesToken(match[1], expectedToken)) {
        return { ok: false, status: 401, code: 'unauthorized' }
      }

      const origin = request.headers.get('origin')
      if (origin !== null && !allowedOrigins.has(origin)) {
        return { ok: false, status: 403, code: 'forbidden' }
      }
      return { ok: true }
    },
  })
}
