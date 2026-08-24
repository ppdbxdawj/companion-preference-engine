import { describe, expect, it } from 'vitest'

import { renderGuidance } from './render-guidance.js'

describe('reference-host guidance renderer', () => {
  it('returns no developer message for an empty profile', () => {
    expect(renderGuidance({})).toBeUndefined()
  })

  it('renders only the closed BehaviorGuidance vocabulary in stable order', () => {
    expect(renderGuidance({
      supportStyle: 'acknowledge_then_act',
      responseDetail: 'concise',
      directness: 'direct',
      initiative: 'ask_first',
      interruptionPolicy: 'important_only',
      approvalStyle: 'risk_based',
      verificationDepth: 'targeted',
      avoid: ['generic_reassurance'],
    })).toBe([
      'Apply these response preferences for this turn:',
      '- Response detail: concise',
      '- Directness: direct',
      '- Initiative: ask first',
      '- Interruption policy: important only',
      '- Approval style: risk based',
      '- Verification depth: targeted',
      '- Support style: acknowledge, then act',
      '- Avoid: generic reassurance',
      'Treat these as behavioral guidance, not facts about the user.',
    ].join('\n'))
  })
})
