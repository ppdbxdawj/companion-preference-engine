import type {
  EffectiveProfileQuery,
  Preference,
  PreferenceAuthority,
  PreferenceRecord,
  PreferenceScope,
  ProjectionPolicy,
} from '@companion-preference/contracts'

export const resolverQueryFixture: EffectiveProfileQuery = {
  userId: 'user-local',
  companionId: 'companion-airi',
  relationshipId: 'relationship-1',
  hostId: 'reference-host',
  domain: 'work',
  workspaceId: 'workspace-1',
  taskId: 'task-1',
  now: '2026-08-21T03:10:00Z',
}

export function resolverRecordFixture(overrides: {
  id?: string
  preference?: Preference
  scope?: PreferenceScope
  projection?: ProjectionPolicy
  authority?: PreferenceAuthority
  status?: PreferenceRecord['status']
  expiresAt?: string
  identity?: PreferenceRecord['identity']
} = {}): PreferenceRecord {
  return {
    schemaVersion: 1,
    id: overrides.id ?? 'preference-base',
    identity: overrides.identity ?? {
      userId: resolverQueryFixture.userId,
      companionId: resolverQueryFixture.companionId,
      relationshipId: resolverQueryFixture.relationshipId,
    },
    preference: overrides.preference ?? {
      key: 'interaction.response_detail',
      value: 'concise',
    },
    scope: overrides.scope ?? { kind: 'workspace', workspaceId: 'workspace-1' },
    projection: overrides.projection ?? {
      allowedHosts: ['reference-host'],
      allowedDomains: ['work'],
    },
    authority: overrides.authority ?? 'user-confirmed',
    revision: 1,
    status: overrides.status ?? 'active',
    evidenceIds: [],
    createdAt: '2026-08-21T03:00:00Z',
    updatedAt: '2026-08-21T03:00:00Z',
    ...(overrides.expiresAt === undefined ? {} : { expiresAt: overrides.expiresAt }),
  }
}
