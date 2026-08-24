import type {
  BaselineInput,
  BaselineOutput,
  EvaluationBaseline,
} from './types.js'
import type {
  BehaviorGuidance,
  Preference,
  PreferenceScope,
} from '@companion-preference/contracts'

type Extracted = { preference: Preference; scope: PreferenceScope }

function scopeFor(text: string, fallbackDomain: 'work' | 'companion'): PreferenceScope {
  const normalized = text.toLowerCase()
  if (/\bcompanion(?: mode| conversations?)?\b/.test(normalized)) {
    return { kind: 'domain', domain: 'companion' }
  }
  if (/\bwork(?:ing|space| sessions?| projects?)?\b|\bprojects?\b/.test(normalized)) {
    return { kind: 'domain', domain: 'work' }
  }
  return { kind: 'domain', domain: fallbackDomain }
}

function extract(text: string, fallbackDomain: 'work' | 'companion'): Extracted[] {
  const normalized = text.toLowerCase()
  const scope = scopeFor(normalized, fallbackDomain)
  const found: Extracted[] = []
  const add = (preference: Preference): void => {
    found.push({ preference, scope })
  }

  if (/\bconcise\b|\bbrief\b|\bshort(?: reply| answers?| version)?\b/.test(normalized)) {
    add({ key: 'interaction.response_detail', value: 'concise' })
  } else if (/\bdetailed\b|\bthorough\b|\bfull version\b/.test(normalized)) {
    add({ key: 'interaction.response_detail', value: 'detailed' })
  } else if (/\bbalanced\b/.test(normalized)) {
    add({ key: 'interaction.response_detail', value: 'balanced' })
  }

  if (/\bgentle\b/.test(normalized)) {
    add({ key: 'interaction.directness', value: 'gentle' })
  } else if (/\bdirect\b/.test(normalized)) {
    add({ key: 'interaction.directness', value: 'direct' })
  }

  if (/\bask (?:me )?first\b|\bask (?:me )?before\b|\bbefore every (?:next|step|consequential)\b/.test(normalized)) {
    add({ key: 'interaction.initiative', value: 'ask_first' })
  } else if (/\blow-risk (?:steps? )?automatically\b|\blow risk auto\b/.test(normalized)) {
    add({ key: 'interaction.initiative', value: 'low_risk_auto' })
  } else if (/\bproactive(?:ly)?\b/.test(normalized)) {
    add({ key: 'interaction.initiative', value: 'proactive' })
  }

  if (/\bnever interrupt\b/.test(normalized)) {
    add({ key: 'interaction.interruption_policy', value: 'never_interrupt' })
  } else if (/\binterrupt only (?:for )?(?:something )?(?:important|critical)\b/.test(normalized)) {
    add({ key: 'interaction.interruption_policy', value: 'important_only' })
  } else if (/\binterrupt(?:ions?)? (?:are )?allowed\b/.test(normalized)) {
    add({ key: 'interaction.interruption_policy', value: 'allowed' })
  }

  if (/\bask me before every consequential\b|\balways ask\b/.test(normalized)) {
    add({ key: 'work.approval_style', value: 'always_ask' })
  } else if (/\brisk-based\b|\brisk based\b/.test(normalized)) {
    add({ key: 'work.approval_style', value: 'risk_based' })
  } else if (/\breview (?:work )?(?:changes )?after\b/.test(normalized)) {
    add({ key: 'work.approval_style', value: 'review_after' })
  }

  if (/\bexhaustive\b/.test(normalized)) {
    add({ key: 'work.verification_depth', value: 'exhaustive' })
  } else if (/\btargeted verification\b/.test(normalized)) {
    add({ key: 'work.verification_depth', value: 'targeted' })
  } else if (/\bminimal check\b|\bskip the long verification\b/.test(normalized)) {
    add({ key: 'work.verification_depth', value: 'minimal' })
  }

  if (/\blisten before (?:suggesting|taking) action\b/.test(normalized)) {
    add({ key: 'companion.support_style', value: 'listen_first' })
  } else if (/\backnowledge .* before suggesting action\b/.test(normalized)) {
    add({ key: 'companion.support_style', value: 'acknowledge_then_act' })
  } else if (/\bdirect action\b/.test(normalized)) {
    add({ key: 'companion.support_style', value: 'direct_action' })
  }

  return found
}

function guidanceFor(candidates: readonly Extracted[]): BehaviorGuidance {
  const guidance: BehaviorGuidance = {}
  for (const { preference } of candidates) {
    switch (preference.key) {
      case 'interaction.response_detail': guidance.responseDetail = preference.value; break
      case 'interaction.directness': guidance.directness = preference.value; break
      case 'interaction.initiative': guidance.initiative = preference.value; break
      case 'interaction.interruption_policy': guidance.interruptionPolicy = preference.value; break
      case 'work.approval_style': guidance.approvalStyle = preference.value; break
      case 'work.verification_depth': guidance.verificationDepth = preference.value; break
      case 'companion.support_style': guidance.supportStyle = preference.value; break
    }
  }
  return guidance
}

export class PlainMemoryBaseline implements EvaluationBaseline {
  readonly id = 'plain-memory' as const
  readonly governedCandidateState = false

  async evaluate(
    input: BaselineInput,
    signal?: AbortSignal,
  ): Promise<BaselineOutput> {
    if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError')
    const extracted = input.evaluationCase.turns
      .filter((turn) => turn.role === 'user')
      .flatMap((turn) => extract(turn.text, input.evaluationCase.queryContext.domain))
    return {
      candidates: extracted.map(({ preference, scope }) => ({ preference, scope })),
      guidance: guidanceFor(extracted),
    }
  }
}
