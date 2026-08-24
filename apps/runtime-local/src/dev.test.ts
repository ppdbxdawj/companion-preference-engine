import { describe, expect, it, vi } from 'vitest'

import { stopDevelopmentRuntime } from './dev.js'

describe('T11 development launcher shutdown', () => {
  it('always closes the runtime after a listener stop failure and preserves that failure', async () => {
    const listenerFailure = new Error('listener close failed')
    const server = { stop: vi.fn(async () => { throw listenerFailure }) }
    const runtime = { close: vi.fn(async () => undefined) }

    await expect(stopDevelopmentRuntime(server, runtime)).rejects.toBe(listenerFailure)
    expect(server.stop).toHaveBeenCalledOnce()
    expect(runtime.close).toHaveBeenCalledOnce()
  })

  it('surfaces a runtime close failure when listener shutdown succeeded', async () => {
    const closeFailure = new Error('runtime close failed')
    const server = { stop: vi.fn(async () => undefined) }
    const runtime = { close: vi.fn(async () => { throw closeFailure }) }

    await expect(stopDevelopmentRuntime(server, runtime)).rejects.toBe(closeFailure)
    expect(server.stop).toHaveBeenCalledOnce()
    expect(runtime.close).toHaveBeenCalledOnce()
  })
})
