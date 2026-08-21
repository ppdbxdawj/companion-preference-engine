import {
  activePreferenceRecordFixture,
  confirmCandidateCommandFixture,
  preferenceCandidateFixture,
  rejectCandidateCommandFixture,
  revokePreferenceCommandFixture,
} from '@companion-preference/contracts'

import type {
  ConfirmCandidateAction,
  PreferenceReplacement,
  RejectCandidateAction,
  RevokePreferenceAction,
  SupersedePreferenceAction,
} from './lifecycle.js'

export const confirmCandidateActionFixture: ConfirmCandidateAction = {
  ...confirmCandidateCommandFixture,
  projection: {
    allowedHosts: [...confirmCandidateCommandFixture.projection.allowedHosts],
    allowedDomains: [...confirmCandidateCommandFixture.projection.allowedDomains],
  },
  actor: 'user',
  auditEventId: 'audit-confirm-1',
  type: 'confirm',
}

export const rejectCandidateActionFixture = {
  ...rejectCandidateCommandFixture,
  actor: 'user',
  auditEventId: 'audit-reject-1',
  type: 'reject',
} as const satisfies RejectCandidateAction

export const revokePreferenceActionFixture = {
  ...revokePreferenceCommandFixture,
  actor: 'user',
  auditEventId: 'audit-revoke-1',
  type: 'revoke',
} as const satisfies RevokePreferenceAction

export const preferenceReplacementFixture: PreferenceReplacement = {
  id: 'preference-2',
  preference: {
    key: 'interaction.response_detail',
    value: 'detailed',
  },
  scope: activePreferenceRecordFixture.scope,
  projection: {
    allowedHosts: [...activePreferenceRecordFixture.projection.allowedHosts],
    allowedDomains: [...activePreferenceRecordFixture.projection.allowedDomains],
  },
  authority: 'user-set',
  evidenceIds: [],
}

export const supersedePreferenceActionFixture = {
  actionId: 'action-supersede-1',
  actor: 'user',
  type: 'supersede',
  expectedPreviousRevision: activePreferenceRecordFixture.revision,
  occurredAt: '2026-08-21T03:14:00Z',
  previousAuditEventId: 'audit-supersede-old-1',
  replacementAuditEventId: 'audit-supersede-new-1',
} as const satisfies SupersedePreferenceAction

export { activePreferenceRecordFixture, preferenceCandidateFixture }
