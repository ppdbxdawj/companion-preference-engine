import { describe, expect, it } from 'vitest'

import { createM0ExperienceSession } from './create-session.js'

describe('M0ExperienceSession', () => {
  it('keeps an unconfirmed candidate out of guidance, then activates and revokes it through Core commands', async () => {
    const session = createM0ExperienceSession()

    expect((await session.show()).guidance).toEqual({})
    expect((await session.show()).preview.mode).toBe('baseline')

    const pending = await session.next()
    expect(pending.pending).toContainEqual(expect.objectContaining({
      id: 'm0-candidate-work-concise', status: 'pending_confirmation',
    }))
    expect(pending.guidance).toEqual({})

    const confirmed = await session.confirm('m0-candidate-work-concise')
    expect(confirmed.guidance).toEqual({ responseDetail: 'concise' })
    expect(confirmed.preview.mode).toBe('concise')
    expect(confirmed.activePreferences).toContainEqual(expect.objectContaining({
      id: 'm0-preference-work-concise', status: 'active', authority: 'user-confirmed',
    }))

    const revoked = await session.revoke('m0-preference-work-concise')
    expect(revoked.guidance).toEqual({})
    expect(revoked.preview.mode).toBe('baseline')
  })

  it('keeps a companion-only preference out of work guidance and exposes the Core exclusion reason', async () => {
    const session = createM0ExperienceSession()
    await session.setDomain('companion')
    const pending = await session.next()
    const candidate = pending.pending.find((item) => item.id === 'm0-candidate-companion-listen-first')
    expect(candidate).toBeDefined()
    await session.confirm('m0-candidate-companion-listen-first')

    const work = await session.setDomain('work')
    expect(work.guidance.supportStyle).toBeUndefined()
    expect(work.resolution.excluded).toContainEqual(expect.objectContaining({
      recordId: 'm0-preference-companion-listen-first', reason: 'privacy-domain-mismatch',
    }))
  })

  it('surfaces typed Core failures without changing the prior read model', async () => {
    const session = createM0ExperienceSession()
    const before = await session.show()
    await expect(session.confirm('missing-candidate')).rejects.toMatchObject({ name: 'InvalidTransitionError' })
    expect(await session.show()).toEqual(before)

    const pending = await session.next()
    await session.reject(pending.pending[0]!.id)
    const afterReject = await session.show()
    await expect(session.confirm('m0-candidate-work-concise')).rejects.toMatchObject({ name: 'InvalidTransitionError' })
    expect(await session.show()).toEqual(afterReject)
  })
})
