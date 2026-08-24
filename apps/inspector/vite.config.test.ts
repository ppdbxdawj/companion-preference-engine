import { describe, expect, it } from 'vitest'

import { parseDevelopmentRuntimeOrigin } from './vite.config.js'

describe('Inspector development proxy target', () => {
  it('accepts only a literal IPv4 loopback HTTP origin with an explicit valid port', () => {
    expect(parseDevelopmentRuntimeOrigin(undefined)).toBe('http://127.0.0.1:43120')
    expect(parseDevelopmentRuntimeOrigin('http://127.0.0.1:43121')).toBe('http://127.0.0.1:43121')

    for (const origin of [
      'http://localhost:43120',
      'http://[::1]:43120',
      'https://127.0.0.1:43120',
      'http://127.0.0.1',
      'http://127.0.0.1:0',
      'http://127.0.0.1:65536',
      'http://127.0.0.1:43120/path',
      'http://user:password@127.0.0.1:43120',
      'http://192.168.1.2:43120',
    ]) {
      expect(() => parseDevelopmentRuntimeOrigin(origin)).toThrow(
        'COMPANION_PREFERENCE_DEV_RUNTIME_ORIGIN must be literal http://127.0.0.1:<valid port>',
      )
    }
  })
})
