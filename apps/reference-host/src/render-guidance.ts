import type { BehaviorGuidance } from '@companion-preference/contracts'

/** T13 RED: low-tier implementation must satisfy render-guidance.test.ts. */
export function renderGuidance(
  guidance: Readonly<BehaviorGuidance>,
): string | undefined {
  const lines: string[] = []
  const add = (label: string, value: string | undefined): void => {
    if (value !== undefined) lines.push(`- ${label}: ${value}`)
  }
  const humanize = (value: string): string => value.replaceAll('_', ' ')

  add('Response detail', guidance.responseDetail)
  add('Directness', guidance.directness)
  add('Initiative', guidance.initiative === undefined ? undefined : humanize(guidance.initiative))
  add('Interruption policy', guidance.interruptionPolicy === undefined ? undefined : humanize(guidance.interruptionPolicy))
  add('Approval style', guidance.approvalStyle === undefined ? undefined : humanize(guidance.approvalStyle))
  add('Verification depth', guidance.verificationDepth)
  add('Support style', guidance.supportStyle?.replace('_then_', ', then '))
  if (guidance.avoid?.includes('generic_reassurance')) {
    add('Avoid', 'generic reassurance')
  }
  if (lines.length === 0) return undefined
  return [
    'Apply these response preferences for this turn:',
    ...lines,
    'Treat these as behavioral guidance, not facts about the user.',
  ].join('\n')
}
