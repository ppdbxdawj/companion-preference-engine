import { describe, expect, it } from 'vitest'

import { createRuntimeAuthPolicy, MIN_RUNTIME_TOKEN_BYTES } from './auth.js'

const token = 't'.repeat(32)
const allowedOrigin = 'http://127.0.0.1:5173'

const request = (headers: HeadersInit = {}): Request => new Request(
  'http://127.0.0.1:43120/health',
  { headers },
)

describe('T10 loopback bearer and browser-origin policy', () => {
  it('requires an explicit high-entropy token and rejects wildcard origins', () => {
    expect(MIN_RUNTIME_TOKEN_BYTES).toBe(32)
    expect(() => createRuntimeAuthPolicy({ token: 'short', allowedOrigins: [] })).toThrow()
    expect(() => createRuntimeAuthPolicy({ token, allowedOrigins: ['*'] })).toThrow()
    expect(() => createRuntimeAuthPolicy({ token, allowedOrigins: ['null'] })).toThrow()
  })

  it('accepts only the exact Bearer grammar and token', () => {
    const policy = createRuntimeAuthPolicy({ token, allowedOrigins: [] })

    expect(policy.authorize(request({ authorization: `Bearer ${token}` }))).toEqual({ ok: true })
    for (const authorization of [
      undefined,
      `Bearer ${'x'.repeat(32)}`,
      `bearer ${token}`,
      `Bearer  ${token}`,
      `Bearer ${token} trailing`,
      `Basic ${token}`,
    ]) {
      const headers = authorization === undefined ? {} : { authorization }
      expect(policy.authorize(request(headers))).toEqual({
        ok: false,
        status: 401,
        code: 'unauthorized',
      })
    }
  })

  it('allows native clients without Origin and exact allowlisted browser origins only', () => {
    const policy = createRuntimeAuthPolicy({ token, allowedOrigins: [allowedOrigin] })
    const authorization = `Bearer ${token}`

    expect(policy.authorize(request({ authorization }))).toEqual({ ok: true })
    expect(policy.authorize(request({ authorization, origin: allowedOrigin }))).toEqual({ ok: true })
    for (const origin of [
      'null',
      'http://localhost:5173',
      'http://127.0.0.1:5174',
      `${allowedOrigin}.attacker.invalid`,
      'https://127.0.0.1:5173',
    ]) {
      expect(policy.authorize(request({ authorization, origin }))).toEqual({
        ok: false,
        status: 403,
        code: 'forbidden',
      })
    }
  })
})
