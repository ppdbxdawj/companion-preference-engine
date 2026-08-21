import { describe, expect, it } from 'vitest'

import {
  authorityPriority,
  matchesIdentity,
  matchesPrivacy,
  matchesScope,
  resolveEffectiveProfile,
  scopeSpecificity,
} from './resolver.js'
import { resolverQueryFixture, resolverRecordFixture } from './resolver.fixtures.js'

describe('resolver primitives', () => {
  it('requires exact stable identity and exact applicable scope fields', () => {
    const record = resolverRecordFixture()
    expect(matchesIdentity(record, resolverQueryFixture)).toBe(true)
    expect(matchesIdentity(record, { ...resolverQueryFixture, relationshipId: 'other' })).toBe(false)
    expect(matchesScope(record, resolverQueryFixture)).toBe(true)
    expect(matchesScope(record, { ...resolverQueryFixture, workspaceId: 'other' })).toBe(false)
    const { taskId: _taskId, ...queryWithoutTask } = resolverQueryFixture
    expect(matchesScope(resolverRecordFixture({ scope: { kind: 'task', taskId: 'task-1' } }), queryWithoutTask)).toBe(false)
  })

  it('requires both projection allowlists and freezes numeric precedence', () => {
    const record = resolverRecordFixture()
    expect(matchesPrivacy(record, resolverQueryFixture)).toBe(true)
    expect(matchesPrivacy(record, { ...resolverQueryFixture, hostId: 'codex' })).toBe(false)
    expect(matchesPrivacy(record, { ...resolverQueryFixture, domain: 'companion' })).toBe(false)
    expect([
      { kind: 'task', taskId: 't' },
      { kind: 'workspace', workspaceId: 'w' },
      { kind: 'host', hostId: 'h' },
      { kind: 'domain', domain: 'work' },
      { kind: 'global' },
    ].map((scope) => scopeSpecificity(scope as Parameters<typeof scopeSpecificity>[0]))).toEqual([5, 4, 3, 2, 1])
    expect(authorityPriority('user-set')).toBeGreaterThan(authorityPriority('user-confirmed'))
  })
})

describe('resolveEffectiveProfile', () => {
  const plainCompare = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0

  it('resolves independently per key by scope before authority', () => {
    const records = [
      resolverRecordFixture({ id: 'global-manual', scope: { kind: 'global' }, authority: 'user-set', preference: { key: 'interaction.response_detail', value: 'detailed' } }),
      resolverRecordFixture({ id: 'domain', scope: { kind: 'domain', domain: 'work' }, preference: { key: 'interaction.response_detail', value: 'balanced' } }),
      resolverRecordFixture({ id: 'workspace', preference: { key: 'interaction.response_detail', value: 'concise' } }),
      resolverRecordFixture({ id: 'manual-direct', authority: 'user-set', preference: { key: 'interaction.directness', value: 'direct' } }),
      resolverRecordFixture({ id: 'confirmed-gentle', preference: { key: 'interaction.directness', value: 'gentle' } }),
    ]
    const result = resolveEffectiveProfile(records, resolverQueryFixture)
    expect(result.guidance).toEqual({ responseDetail: 'concise', directness: 'direct' })
    expect(result.applied.map(({ recordId }) => recordId)).toEqual(['manual-direct', 'workspace'])
  })

  it('allows only a manually set global preference', () => {
    const confirmed = resolverRecordFixture({ id: 'global-confirmed', scope: { kind: 'global' }, authority: 'user-confirmed' })
    const manual = resolverRecordFixture({ id: 'global-manual', scope: { kind: 'global' }, authority: 'user-set' })
    expect(resolveEffectiveProfile([confirmed], resolverQueryFixture)).toMatchObject({
      guidance: {},
      excluded: [{ recordId: 'global-confirmed', reason: 'global-confirmed-not-permitted' }],
    })
    expect(resolveEffectiveProfile([manual], resolverQueryFixture).applied[0]?.recordId).toBe('global-manual')
  })

  it('excludes inactive, expired, identity, scope, host, and domain mismatches', () => {
    const records = [
      resolverRecordFixture({ id: 'inactive', status: 'revoked' }),
      resolverRecordFixture({ id: 'expired', expiresAt: resolverQueryFixture.now }),
      resolverRecordFixture({ id: 'identity', identity: { userId: 'other', companionId: 'companion-airi', relationshipId: 'relationship-1' } }),
      resolverRecordFixture({ id: 'scope', scope: { kind: 'task', taskId: 'other' } }),
      resolverRecordFixture({ id: 'host', projection: { allowedHosts: ['codex'], allowedDomains: ['work'] } }),
      resolverRecordFixture({ id: 'domain', projection: { allowedHosts: ['reference-host'], allowedDomains: ['companion'] } }),
    ]
    expect(resolveEffectiveProfile(records, resolverQueryFixture).excluded.map(({ recordId, reason }) => [recordId, reason])).toEqual([
      ['domain', 'privacy-domain-mismatch'],
      ['expired', 'expired'],
      ['host', 'privacy-host-mismatch'],
      ['identity', 'identity-mismatch'],
      ['inactive', 'inactive-status'],
      ['scope', 'scope-mismatch'],
    ])
  })

  it('deduplicates equal-priority identical values but excludes every conflicting winner', () => {
    const sameA = resolverRecordFixture({ id: 'a' })
    const sameB = resolverRecordFixture({ id: 'b' })
    const deduped = resolveEffectiveProfile([sameB, sameA], resolverQueryFixture)
    expect(deduped.applied[0]?.recordId).toBe('a')
    expect(deduped.excluded).toContainEqual(expect.objectContaining({ recordId: 'b', reason: 'equivalent-duplicate' }))

    const conflict = resolveEffectiveProfile([
      sameA,
      resolverRecordFixture({ id: 'c', preference: { key: 'interaction.response_detail', value: 'detailed' } }),
    ], resolverQueryFixture)
    expect(conflict.guidance).toEqual({})
    expect(conflict.applied).toEqual([])
    expect(conflict.conflicts).toEqual([{ key: 'interaction.response_detail', recordIds: ['a', 'c'], reason: 'equal-priority-different-values' }])
    expect(conflict.excluded.map(({ reason }) => reason)).toEqual(['equal-priority-conflict', 'equal-priority-conflict'])
  })

  it('is stable under every input permutation and never mutates inputs', () => {
    const records = [
      resolverRecordFixture({ id: 'z', preference: { key: 'work.verification_depth', value: 'targeted' } }),
      resolverRecordFixture({ id: 'a' }),
      resolverRecordFixture({ id: 'm', scope: { kind: 'host', hostId: 'reference-host' } }),
    ]
    const before = structuredClone(records)
    const first = resolveEffectiveProfile(records, resolverQueryFixture)
    const second = resolveEffectiveProfile([...records].reverse(), resolverQueryFixture)
    expect(second).toEqual(first)
    expect(records).toEqual(before)
  })

  it('uses plain lexical ordering rather than locale ordering everywhere', () => {
    const duplicate = resolveEffectiveProfile([
      resolverRecordFixture({ id: 'a' }),
      resolverRecordFixture({ id: 'Z' }),
    ], resolverQueryFixture)
    expect(duplicate.applied.map(({ recordId }) => recordId)).toEqual(['Z'])
    expect(duplicate.excluded.map(({ recordId }) => recordId)).toEqual(['a'])

    const excluded = resolveEffectiveProfile([
      resolverRecordFixture({ id: 'a', status: 'revoked' }),
      resolverRecordFixture({ id: 'Z', status: 'revoked' }),
    ], resolverQueryFixture)
    expect(excluded.excluded.map(({ recordId }) => recordId)).toEqual(['Z', 'a'])

    const conflict = resolveEffectiveProfile([
      resolverRecordFixture({ id: 'a', preference: { key: 'interaction.response_detail', value: 'detailed' } }),
      resolverRecordFixture({ id: 'Z', preference: { key: 'interaction.response_detail', value: 'concise' } }),
    ], resolverQueryFixture)
    expect(conflict.conflicts[0]?.recordIds).toEqual(['Z', 'a'])
    expect(conflict.excluded.map(({ recordId }) => recordId)).toEqual(['Z', 'a'])

    const acrossKeys = resolveEffectiveProfile([
      resolverRecordFixture({ id: 'response', preference: { key: 'interaction.response_detail', value: 'concise' } }),
      resolverRecordFixture({ id: 'support', preference: { key: 'companion.support_style', value: 'listen_first' } }),
      resolverRecordFixture({ id: 'verification', preference: { key: 'work.verification_depth', value: 'targeted' } }),
    ], resolverQueryFixture)
    const expectedKeys = [
      'interaction.response_detail',
      'companion.support_style',
      'work.verification_depth',
    ].sort(plainCompare)
    expect(acrossKeys.applied.map(({ key }) => key)).toEqual(expectedKeys)
  })
})
