import type {
  AuditEvent,
  ConfirmCandidateCommand,
  Preference,
  PreferenceAuthority,
  PreferenceCandidate,
  PreferenceRecord,
  PreferenceScope,
  ProjectionPolicy,
  RejectCandidateCommand,
  RevokePreferenceCommand,
} from '@companion-preference/contracts'

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export type ConfirmCandidateAction = Omit<
  ConfirmCandidateCommand,
  'supersedesPreference'
> & {
  supersedesPreference?: never
  actor: 'user'
  auditEventId: string
  type: 'confirm'
}

export type RejectCandidateAction = Omit<RejectCandidateCommand, 'reasonCode'> & {
  reasonCode?: 'not-a-preference' | 'user-requested'
  actor: 'user'
  auditEventId: string
  type: 'reject'
}

export type CandidateAction = ConfirmCandidateAction | RejectCandidateAction

type CandidateConfirmedAuditEvent = Extract<
  AuditEvent,
  { kind: 'candidate-confirmed' }
>
type CandidateRejectedAuditEvent = Extract<
  AuditEvent,
  { kind: 'candidate-rejected' }
>
type PreferenceRevokedAuditEvent = Extract<
  AuditEvent,
  { kind: 'preference-revoked' }
>
type PreferenceRevisedAuditEvent = Extract<
  AuditEvent,
  { kind: 'preference-revised' }
>

export type CandidateConfirmedResult = DeepReadonly<{
  kind: 'confirmed'
  candidate: PreferenceCandidate
  preference: PreferenceRecord
  auditEvent: CandidateConfirmedAuditEvent
}>

export type CandidateRejectedResult = DeepReadonly<{
  kind: 'rejected'
  candidate: PreferenceCandidate
  auditEvent: CandidateRejectedAuditEvent
}>

export type CandidateActionResult =
  | CandidateConfirmedResult
  | CandidateRejectedResult

export type LifecycleReplay<Input, Result> = DeepReadonly<{
  /** Canonical cloned snapshot of every causal input used by the transition. */
  input: Input
  result: Result
}>

export type CandidateActionInput = {
  candidate: PreferenceCandidate
  action: CandidateAction
}

export type CandidateActionReplay = LifecycleReplay<
  CandidateActionInput,
  CandidateActionResult
>

export type CandidateActionExecution = CandidateActionReplay

export type RevokePreferenceAction = Omit<
  RevokePreferenceCommand,
  'reasonCode'
> & {
  reasonCode?: 'user-requested'
  actor: 'user'
  auditEventId: string
  type: 'revoke'
}

export type RevokePreferenceResult = DeepReadonly<{
  preference: PreferenceRecord
  auditEvent: PreferenceRevokedAuditEvent
}>

export type RevokePreferenceInput = {
  preference: PreferenceRecord
  action: RevokePreferenceAction
}

export type RevokePreferenceReplay = LifecycleReplay<
  RevokePreferenceInput,
  RevokePreferenceResult
>

export type RevokePreferenceExecution = RevokePreferenceReplay

/** Caller-supplied content for the new record in a real replacement edge. */
export type PreferenceReplacement = {
  id: string
  preference: Preference
  scope: PreferenceScope
  projection: ProjectionPolicy
  authority: PreferenceAuthority
  evidenceIds: string[]
  expiresAt?: string
}

export type SupersedePreferenceAction = {
  actionId: string
  actor: 'user'
  type: 'supersede'
  expectedPreviousRevision: number
  occurredAt: string
  previousAuditEventId: string
  replacementAuditEventId: string
}

export type SupersedePreferenceResult = DeepReadonly<{
  previous: PreferenceRecord
  replacement: PreferenceRecord
  auditEvents: readonly [
    PreferenceRevisedAuditEvent,
    PreferenceRevisedAuditEvent,
  ]
}>

export type SupersedePreferenceInput = {
  previous: PreferenceRecord
  replacement: PreferenceReplacement
  action: SupersedePreferenceAction
}

export type SupersedePreferenceReplay = LifecycleReplay<
  SupersedePreferenceInput,
  SupersedePreferenceResult
>

export type SupersedePreferenceExecution = SupersedePreferenceReplay

export type InvalidTransitionCode =
  | 'candidate-not-pending'
  | 'candidate-id-mismatch'
  | 'preference-not-active'
  | 'preference-id-mismatch'
  | 'replacement-id-conflict'
  | 'replacement-key-conflict'
  | 'actor-not-authorized'
  | 'audit-event-id-invalid'
  | 'audit-event-id-conflict'

export class InvalidTransitionError extends Error {
  readonly name = 'InvalidTransitionError'

  constructor(
    readonly code: InvalidTransitionCode,
    message: string,
  ) {
    super(message)
  }
}

export class RevisionConflictError extends Error {
  readonly name = 'RevisionConflictError'
  readonly code = 'revision-conflict' as const

  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(`Expected revision ${expectedRevision}, received ${actualRevision}`)
  }
}

export class ActionPayloadConflictError extends Error {
  readonly name = 'ActionPayloadConflictError'
  readonly code = 'action-payload-conflict' as const

  constructor(readonly actionId: string) {
    super(`Action ${actionId} was already used with a different payload`)
  }
}

/** @deprecated Use ActionPayloadConflictError. */
export { ActionPayloadConflictError as ActionReplayConflictError }

// Deterministic lifecycle transitions with cloned, deeply frozen executions.
function clone<T>(value: T): T {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(clone) as T
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value as object)) {
    output[key] = clone((value as Record<string, unknown>)[key])
  }
  return output as T
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as object)) freeze(nested)
    Object.freeze(value)
  }
  return value
}

function eq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const aKeys = Object.keys(a as object)
  const bKeys = Object.keys(b as object)
  return aKeys.length === bKeys.length && aKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(b, key) &&
    eq((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}

function invalid(code: InvalidTransitionCode, message: string): never {
  throw new InvalidTransitionError(code, message)
}
export function applyCandidateAction(
  candidate: DeepReadonly<PreferenceCandidate>, action: DeepReadonly<CandidateAction>,
  prior?: DeepReadonly<CandidateActionReplay>,
): CandidateActionExecution {
  const input={candidate:clone(candidate),action:clone(action)}; if (prior && prior.input.action.actionId===action.actionId) { if (eq(prior.input,input)) return prior; throw new ActionPayloadConflictError(action.actionId) }
  if (action.actor !== 'user') invalid('actor-not-authorized','Only user actions are authorized'); if (action.candidateId!==candidate.id) invalid('candidate-id-mismatch','Candidate ID mismatch'); if (candidate.status!=='pending_confirmation') invalid('candidate-not-pending','Candidate is not pending'); if (action.expectedCandidateRevision!==candidate.revision) throw new RevisionConflictError(action.expectedCandidateRevision,candidate.revision)
  const revision=candidate.revision+1, c={...clone(candidate),status:action.type==='confirm'?'confirmed' as const:'rejected' as const,revision,updatedAt:action.occurredAt}; const base={schemaVersion:1 as const,id:action.auditEventId,identity:clone(candidate.identity),actor:'user' as const,occurredAt:action.occurredAt,actionId:action.actionId,revision,entity:{kind:'candidate' as const,candidateId:candidate.id}};
  const result=action.type==='reject'?{kind:'rejected' as const,candidate:c,auditEvent:{...base,kind:'candidate-rejected' as const,reasonCode:action.reasonCode??'user-requested' as const}}:{kind:'confirmed' as const,candidate:c,preference:{schemaVersion:1 as const,id:action.preferenceId,identity:clone(candidate.identity),preference:clone(action.preference),scope:clone(action.scope),projection:clone(action.projection),authority:'user-confirmed' as const,status:'active' as const,revision:1,evidenceIds:clone(candidate.evidenceIds),createdAt:action.occurredAt,updatedAt:action.occurredAt,...(candidate.expiresAt===undefined?{}:{expiresAt:candidate.expiresAt})},auditEvent:{...base,kind:'candidate-confirmed' as const,reasonCode:'accepted' as const}}; return freeze({input,result}) as CandidateActionExecution
}

export function revokePreference(
  preference: DeepReadonly<PreferenceRecord>, action: DeepReadonly<RevokePreferenceAction>,
  prior?: DeepReadonly<RevokePreferenceReplay>,
): RevokePreferenceExecution {
  const input={preference:clone(preference),action:clone(action)}; if(prior&&prior.input.action.actionId===action.actionId){if(eq(prior.input,input))return prior;throw new ActionPayloadConflictError(action.actionId)} if(action.actor!=='user')invalid('actor-not-authorized','Only user actions are authorized'); if(action.preferenceId!==preference.id)invalid('preference-id-mismatch','Preference ID mismatch'); if(preference.status!=='active')invalid('preference-not-active','Preference is not active'); if(action.expectedPreferenceRevision!==preference.revision)throw new RevisionConflictError(action.expectedPreferenceRevision,preference.revision); const revision=preference.revision+1; const p={...clone(preference),status:'revoked' as const,revision,updatedAt:action.occurredAt}; const auditEvent={schemaVersion:1 as const,id:action.auditEventId,identity:clone(preference.identity),actor:'user' as const,kind:'preference-revoked' as const,reasonCode:action.reasonCode??'user-requested' as const,entity:{kind:'preference' as const,preferenceId:preference.id},occurredAt:action.occurredAt,actionId:action.actionId,revision}; return freeze({input,result:{preference:p,auditEvent}}) as RevokePreferenceExecution
}

export function supersedePreference(
  previous: DeepReadonly<PreferenceRecord>, replacement: DeepReadonly<PreferenceReplacement>, action: DeepReadonly<SupersedePreferenceAction>,
  prior?: DeepReadonly<SupersedePreferenceReplay>,
): SupersedePreferenceExecution {
  const input={previous:clone(previous),replacement:clone(replacement),action:clone(action)}; if(prior&&prior.input.action.actionId===action.actionId){if(eq(prior.input,input))return prior;throw new ActionPayloadConflictError(action.actionId)} if(action.actor!=='user')invalid('actor-not-authorized','Only user actions are authorized'); if(replacement.id===previous.id)invalid('replacement-id-conflict','Replacement ID conflicts'); if(replacement.preference.key!==previous.preference.key)invalid('replacement-key-conflict','Replacement key conflicts'); if(!action.previousAuditEventId||!action.replacementAuditEventId)invalid('audit-event-id-invalid','Audit event IDs must be non-empty'); if(action.previousAuditEventId===action.replacementAuditEventId)invalid('audit-event-id-conflict','Audit event IDs must differ'); if(previous.status!=='active')invalid('preference-not-active','Preference is not active'); if(action.expectedPreviousRevision!==previous.revision)throw new RevisionConflictError(action.expectedPreviousRevision,previous.revision); const revision=previous.revision+1, old={...clone(previous),status:'superseded' as const,revision,supersededBy:replacement.id,updatedAt:action.occurredAt}, next={schemaVersion:1 as const,id:replacement.id,identity:clone(previous.identity),preference:clone(replacement.preference),scope:clone(replacement.scope),projection:clone(replacement.projection),authority:replacement.authority,revision:1,status:'active' as const,supersedes:previous.id,evidenceIds:clone(replacement.evidenceIds),createdAt:action.occurredAt,updatedAt:action.occurredAt,...(replacement.expiresAt===undefined?{}:{expiresAt:replacement.expiresAt})}; const common={schemaVersion:1 as const,identity:clone(previous.identity),actor:'user' as const,kind:'preference-revised' as const,reasonCode:'superseded' as const,occurredAt:action.occurredAt,actionId:action.actionId}; const auditEvents=[{...common,id:action.previousAuditEventId,entity:{kind:'preference' as const,preferenceId:previous.id},revision},{...common,id:action.replacementAuditEventId,entity:{kind:'preference' as const,preferenceId:replacement.id},revision:1}] as const; return freeze({input,result:{previous:old,replacement:next,auditEvents}}) as SupersedePreferenceExecution
}
