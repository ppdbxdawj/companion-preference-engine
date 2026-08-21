import { describe, expect, it } from 'vitest'

import { explainResolution } from './explain.js'
import { resolveEffectiveProfile, type EffectiveProfileResolution } from './resolver.js'
import { resolverQueryFixture, resolverRecordFixture } from './resolver.fixtures.js'

describe('explainResolution', () => {
  it('returns stable content-free applied, excluded, and conflict explanations', () => {
    const records = [
      resolverRecordFixture({ id: 'applied', preference: { key: 'interaction.directness', value: 'direct' } }),
      resolverRecordFixture({ id: 'expired', expiresAt: resolverQueryFixture.now }),
      resolverRecordFixture({ id: 'conflict-b', preference: { key: 'work.verification_depth', value: 'minimal' } }),
      resolverRecordFixture({ id: 'conflict-a', preference: { key: 'work.verification_depth', value: 'exhaustive' } }),
    ]
    const explanation = explainResolution(resolveEffectiveProfile(records, resolverQueryFixture))
    expect(explanation).toEqual([
      { kind: 'applied', key: 'interaction.directness', recordIds: ['applied'], reason: 'highest-priority-applicable' },
      { kind: 'excluded', key: 'interaction.response_detail', recordIds: ['expired'], reason: 'expired' },
      { kind: 'conflict', key: 'work.verification_depth', recordIds: ['conflict-a', 'conflict-b'], reason: 'equal-priority-different-values' },
    ])
    const serialized = JSON.stringify(explanation)
    expect(serialized).not.toMatch(/"(?:concise|direct|minimal|exhaustive)"/)
    expect(serialized).not.toMatch(/"(?:preference|value|evidenceIds|createdAt|updatedAt|expiresAt|content|text)"\s*:/)
  })

  it('orders entries by plain lexical comparison rather than locale', () => {
    const result: EffectiveProfileResolution = {
      guidance: {},
      applied: [],
      excluded: [
        { recordId: 'a', key: 'interaction.response_detail', reason: 'expired' },
        { recordId: 'Z', key: 'interaction.response_detail', reason: 'expired' },
      ],
      conflicts: [],
    }
    expect(explainResolution(result).map(({ recordIds }) => recordIds[0])).toEqual(['Z', 'a'])
  })
})
