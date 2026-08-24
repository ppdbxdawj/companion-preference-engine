import type {
  BehaviorGuidance,
  InteractionEvidence,
  PendingCandidateProposal,
  PreferenceCandidate,
  PreferenceRecord,
} from '@companion-preference/contracts'
import type {
  EffectiveProfileResolution,
  ResolutionExplanation,
} from '@companion-preference/preference-core'

export type TerminalDomain = 'work' | 'companion'

export type TerminalScenario = Readonly<{
  id: string
  evidence: Readonly<InteractionEvidence>
  proposal: Readonly<PendingCandidateProposal>
}>

export type Preview = Readonly<{
  mode: 'baseline' | 'concise'
  label: 'Deterministic preview'
  text: string
}>

/** A terminal-only read model composed from the governed Core ports. */
export type ExperienceSnapshot = Readonly<{
  domain: TerminalDomain
  pending: readonly PreferenceCandidate[]
  activePreferences: readonly PreferenceRecord[]
  resolution: EffectiveProfileResolution
  explanations: readonly ResolutionExplanation[]
  guidance: Readonly<BehaviorGuidance>
  preview: Preview
}>

export type TerminalCommand =
  | Readonly<{ type: 'help' }>
  | Readonly<{ type: 'show' }>
  | Readonly<{ type: 'next' }>
  | Readonly<{ type: 'confirm'; candidateId: string }>
  | Readonly<{ type: 'reject'; candidateId: string }>
  | Readonly<{ type: 'revoke'; preferenceId: string }>
  | Readonly<{ type: 'domain'; domain: TerminalDomain }>
  | Readonly<{ type: 'reset' }>
  | Readonly<{ type: 'exit' }>

export type TerminalParseErrorCode =
  | 'empty-command'
  | 'unknown-command'
  | 'missing-argument'
  | 'unexpected-argument'
  | 'invalid-domain'

export type ParseResult =
  | Readonly<{ kind: 'command'; command: TerminalCommand }>
  | Readonly<{
      kind: 'parse-error'
      code: TerminalParseErrorCode
      message: string
    }>
