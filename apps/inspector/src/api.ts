import {
  ConnectionListHttpRequestSchema,
  ConnectionListHttpResultSchema,
  CandidateListHttpRequestSchema,
  CandidateListHttpResultSchema,
  ConfirmCandidateCommandSchema,
  GovernanceMutationHttpRequestSchema,
  GovernanceMutationHttpResultSchema,
  HttpErrorResponseSchema,
  HttpSuccessResponseSchema,
  UpdateConnectionSettingsCommandSchema,
  RejectCandidateCommandSchema,
  SuppressCandidateCommandSchema,
  PreferenceListHttpRequestSchema,
  PreferenceListHttpResultSchema,
  RevisePreferenceCommandSchema,
  RevokePreferenceCommandSchema,
  type ConnectionListHttpRequest,
  type ConnectionListHttpResult,
  type CandidateListHttpRequest,
  type CandidateListHttpResult,
  type ConfirmCandidateCommand,
  type RejectCandidateCommand,
  type SuppressCandidateCommand,
  type PreferenceListHttpRequest,
  type PreferenceListHttpResult,
  type RevisePreferenceCommand,
  type RevokePreferenceCommand,
  type GovernanceMutationHttpRequest,
  type GovernanceMutationHttpResult,
  type HttpErrorResponse,
  type UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'

export type InspectorConnectionsApi = Readonly<{
  listConnections: (request: ConnectionListHttpRequest) => Promise<ConnectionListHttpResult>
  updateConnectionSettings: (
    command: UpdateConnectionSettingsCommand,
  ) => Promise<GovernanceMutationHttpResult>
}>

export type InspectorT12Api = Readonly<{
  listCandidates: (request: CandidateListHttpRequest) => Promise<CandidateListHttpResult>
  confirmCandidate: (command: ConfirmCandidateCommand) => Promise<GovernanceMutationHttpResult>
  rejectCandidate: (command: RejectCandidateCommand) => Promise<GovernanceMutationHttpResult>
  suppressCandidate: (command: SuppressCandidateCommand) => Promise<GovernanceMutationHttpResult>
  listPreferences: (request: PreferenceListHttpRequest | PreferenceListHttpRequest['identity']) => Promise<PreferenceListHttpResult>
  revisePreference: (command: RevisePreferenceCommand) => Promise<GovernanceMutationHttpResult>
  revokePreference: (command: RevokePreferenceCommand) => Promise<GovernanceMutationHttpResult>
}>

export class InspectorApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super('Inspector API request failed')
    this.name = 'InspectorApiError'
    this.status = status
    this.code = code
  }
}

class InspectorProtocolError extends Error {
  constructor() {
    super('Inspector API response did not match the protocol')
    this.name = 'InspectorProtocolError'
  }
}

type StandardSchemaResult = Readonly<{ value?: unknown, issues?: readonly unknown[] }>
type StandardSchema = Readonly<{
  '~standard': Readonly<{ validate: (value: unknown) => StandardSchemaResult }>
}>

const parse = <T>(schema: unknown, value: unknown): T => {
  if (typeof schema !== 'object' || schema === null || !('~standard' in schema)) {
    throw new InspectorProtocolError()
  }
  const result = (schema as StandardSchema)['~standard'].validate(value)
  if (result.issues !== undefined) throw new InspectorProtocolError()
  return result.value as T
}

const responseBody = async (response: Response): Promise<unknown> => {
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw new InspectorProtocolError()
  }
}

const receive = async <T>(
  response: Response,
  schema: unknown,
): Promise<T> => {
  const body = await responseBody(response)
  if (response.status < 200 || response.status >= 300) {
    const error = parse<HttpErrorResponse>(HttpErrorResponseSchema, body)
    throw new InspectorApiError(response.status, error.error.code)
  }
  return parse<{ ok: true; requestId: string; data: T }>(
    HttpSuccessResponseSchema(schema as never),
    body,
  ).data
}

export const createInspectorConnectionsApi = (
  requestFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): InspectorConnectionsApi & InspectorT12Api => ({
  async listConnections(request) {
    const body = parse<ConnectionListHttpRequest>(ConnectionListHttpRequestSchema, request)
    const response = await requestFetch(`/api/v1/connections?${new URLSearchParams(body.identity).toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
    })
    return receive<ConnectionListHttpResult>(response, ConnectionListHttpResultSchema)
  },

  async updateConnectionSettings(command) {
    const parsed = parse<UpdateConnectionSettingsCommand>(UpdateConnectionSettingsCommandSchema, command)
    const body = parse<GovernanceMutationHttpRequest>(GovernanceMutationHttpRequestSchema, {
      command: parsed,
    })
    const response = await requestFetch(`/api/v1/connections/${encodeURIComponent(parsed.hostId)}`, {
      method: 'PATCH',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(body),
    })
    return receive<GovernanceMutationHttpResult>(response, GovernanceMutationHttpResultSchema)
  },

  async listCandidates(request) {
    const body = parse<CandidateListHttpRequest>(CandidateListHttpRequestSchema, request)
    const query = new URLSearchParams({ ...body.identity })
    if (body.statuses !== undefined) query.set('statuses', body.statuses.join(','))
    const response = await requestFetch(`/api/v1/candidates?${query.toString()}`, {
      method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit',
    })
    return receive<CandidateListHttpResult>(response, CandidateListHttpResultSchema)
  },

  async confirmCandidate(command) {
    return sendT12Command(requestFetch, command, ConfirmCandidateCommandSchema, `/api/v1/candidates/${encodeURIComponent(command.candidateId)}/confirm`)
  },

  async rejectCandidate(command) {
    return sendT12Command(requestFetch, command, RejectCandidateCommandSchema, `/api/v1/candidates/${encodeURIComponent(command.candidateId)}/reject`)
  },

  async suppressCandidate(command) {
    return sendT12Command(requestFetch, command, SuppressCandidateCommandSchema, `/api/v1/candidates/${encodeURIComponent(command.candidateId)}/suppress`)
  },

  async listPreferences(request) {
    const body = parse<PreferenceListHttpRequest>(PreferenceListHttpRequestSchema, 'identity' in request ? request : { identity: request })
    const response = await requestFetch(`/api/v1/preferences?${new URLSearchParams(body.identity)}`, {
      method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit',
    })
    return receive<PreferenceListHttpResult>(response, PreferenceListHttpResultSchema)
  },

  async revisePreference(command) {
    return sendT12Command(requestFetch, command, RevisePreferenceCommandSchema, `/api/v1/preferences/${encodeURIComponent(command.preferenceId)}/revise`)
  },

  async revokePreference(command) {
    return sendT12Command(requestFetch, command, RevokePreferenceCommandSchema, `/api/v1/preferences/${encodeURIComponent(command.preferenceId)}/revoke`)
  },
})

const sendT12Command = async <T>(
  requestFetch: typeof globalThis.fetch,
  command: T,
  schema: unknown,
  path: string,
): Promise<GovernanceMutationHttpResult> => {
  const parsed = parse<T>(schema, command)
  const body = parse<GovernanceMutationHttpRequest>(GovernanceMutationHttpRequestSchema, { command: parsed })
  const response = await requestFetch(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(body),
  })
  return receive<GovernanceMutationHttpResult>(response, GovernanceMutationHttpResultSchema)
}
