import * as v from 'valibot'
import {
  CandidateListHttpRequestSchema,
  CandidateListHttpResultSchema,
  ConnectionListHttpRequestSchema,
  ConnectionListHttpResultSchema,
  ConnectionSettingsHttpRequestSchema,
  ConfirmCandidateCommandSchema,
  CreateExplicitPreferenceCommandSchema,
  DeleteCandidateCommandSchema,
  DeleteEvidenceCommandSchema,
  EffectiveProfileHttpRequestSchema,
  EffectiveProfileHttpResultSchema,
  ExportDataHttpRequestSchema,
  GovernanceMutationHttpResultSchema,
  GovernanceMutationHttpRequestSchema,
  HttpErrorResponseSchema,
  HttpSuccessResponseSchema,
  IngestEvidenceHttpRequestSchema,
  IngestEvidenceHttpResultSchema,
  PreferenceDataExportHttpResultSchema,
  PreferenceListHttpRequestSchema,
  PreferenceListHttpResultSchema,
  ProposeCandidateCommandSchema,
  RecordPolicyDecisionHttpRequestSchema,
  RejectCandidateCommandSchema,
  ReportProjectionStatusCommandSchema,
  ResetHttpRequestSchema,
  ResetHttpResultSchema,
  RevisePreferenceCommandSchema,
  RevokePreferenceCommandSchema,
  SuppressCandidateCommandSchema,
  UpdateConnectionSettingsCommandSchema,
  AuditHttpRequestSchema,
  AuditHttpResultSchema,
  ConnectionSettingsSchema,
  type CandidateListHttpRequest,
  type CandidateListHttpResult,
  type ConnectionListHttpRequest,
  type ConnectionListHttpResult,
  type ConnectionSettings,
  type ConnectionSettingsHttpRequest,
  type ConfirmCandidateCommand,
  type CreateExplicitPreferenceCommand,
  type DeleteCandidateCommand,
  type DeleteEvidenceCommand,
  type EffectiveProfileHttpRequest,
  type EffectiveProfileHttpResult,
  type ExportDataHttpRequest,
  type GovernanceMutationHttpResult,
  type GovernanceMutationHttpRequest,
  type HttpErrorResponse,
  type IngestEvidenceHttpRequest,
  type IngestEvidenceHttpResult,
  type PreferenceDataExportHttpResult,
  type PreferenceListHttpRequest,
  type PreferenceListHttpResult,
  type ProposeCandidateCommand,
  type RecordPolicyDecisionHttpRequest,
  type RejectCandidateCommand,
  type ReportProjectionStatusCommand,
  type ResetHttpRequest,
  type ResetHttpResult,
  type RevisePreferenceCommand,
  type RevokePreferenceCommand,
  type SuppressCandidateCommand,
  type UpdateConnectionSettingsCommand,
  type AuditHttpRequest,
  type AuditHttpResult,
} from '@companion-preference/contracts'

const HealthResultSchema = v.strictObject({
  apiVersion: v.literal(1),
  status: v.literal('ok'),
})

type HealthResult = v.InferOutput<typeof HealthResultSchema>

const HTTP_ETAG = /^"[0-9a-f]{64}"$/

export type RuntimeClientOptions = {
  baseUrl: string
  token: string
  fetch?: typeof globalThis.fetch
}

export type DeepReadonly<T> =
  T extends (...args: any[]) => any ? T
    : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
      : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T

export type CandidateListOptions = {
  etag?: string
}

export type CandidateListResponse =
  | { notModified: false; data: CandidateListHttpResult; etag?: string }
  | { notModified: true; etag: string }

export class RuntimeClientError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean
  readonly currentRevision?: number

  constructor(input: {
    status: number
    code: string
    retryable: boolean
    currentRevision?: number
  }) {
    super('Runtime request failed')
    this.name = 'RuntimeClientError'
    this.status = input.status
    this.code = input.code
    this.retryable = input.retryable
    if (input.currentRevision !== undefined) this.currentRevision = input.currentRevision
  }
}

export class RuntimeClientProtocolError extends Error {
  constructor() {
    super('Runtime response did not match the protocol')
    this.name = 'RuntimeClientProtocolError'
  }
}

const parse = <T>(schema: v.GenericSchema<unknown>, value: unknown): T => {
  const result = v.safeParse(schema, value)
  if (!result.success) throw new RuntimeClientProtocolError()
  return result.output as T
}

const validateEtag = (value: string): string => {
  if (!HTTP_ETAG.test(value)) throw new RuntimeClientProtocolError()
  return value
}

const validateLoopbackBaseUrl = (baseUrl: string): string => {
  const match = /^http:\/\/127\.0\.0\.1:([0-9]{1,5})\/?$/.exec(baseUrl)
  if (!match) throw new Error('Runtime client requires an explicit HTTP IPv4 loopback port')
  const port = Number(match[1])
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Runtime client requires a valid explicit loopback port')
  }
  return `http://127.0.0.1:${port}`
}

const validateToken = (token: string): string => {
  if (typeof token !== 'string' || new TextEncoder().encode(token).byteLength < 32) {
    throw new Error('Runtime client requires a token of at least 32 UTF-8 bytes')
  }
  return token
}

export class RuntimeClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor(options: RuntimeClientOptions) {
    this.baseUrl = validateLoopbackBaseUrl(options.baseUrl)
    this.token = validateToken(options.token)
    this.requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  health(): Promise<HealthResult> {
    return this.get('/health', HealthResultSchema)
  }

  async ingestEvidence(
    request: DeepReadonly<IngestEvidenceHttpRequest>,
  ): Promise<IngestEvidenceHttpResult> {
    const body = parse<IngestEvidenceHttpRequest>(IngestEvidenceHttpRequestSchema, request)
    const result = await this.post<IngestEvidenceHttpRequest, IngestEvidenceHttpResult>(
      '/v1/evidence',
      body,
      IngestEvidenceHttpResultSchema,
      202,
    )
    return result
  }

  async listCandidates(
    request: DeepReadonly<CandidateListHttpRequest>,
    options: CandidateListOptions = {},
  ): Promise<CandidateListResponse> {
    const body = parse<CandidateListHttpRequest>(CandidateListHttpRequestSchema, request)
    const query = new URLSearchParams({
      userId: body.identity.userId,
      companionId: body.identity.companionId,
      relationshipId: body.identity.relationshipId,
    })
    if (body.statuses) query.set('statuses', body.statuses.join(','))
    const headers: Record<string, string> = {}
    if (options.etag !== undefined) headers['if-none-match'] = validateEtag(options.etag)
    const response = await this.request(`/v1/candidates?${query.toString()}`, {
      method: 'GET',
      headers,
    })
    if (response.status === 304) {
      const etag = response.headers.get('etag')
      if (!etag) throw new RuntimeClientProtocolError()
      return { notModified: true, etag: validateEtag(etag) }
    }
    const data = await parseEnvelope<CandidateListHttpResult>(response, CandidateListHttpResultSchema)
    if (response.status !== 200) throw new RuntimeClientProtocolError()
    return {
      notModified: false,
      data,
      ...(response.headers.get('etag') ? { etag: validateEtag(response.headers.get('etag')!) } : {}),
    }
  }

  async confirmCandidate(
    command: DeepReadonly<ConfirmCandidateCommand>,
  ): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/candidates/${encodeURIComponent(command.candidateId)}/confirm`,
      'POST',
      ConfirmCandidateCommandSchema,
      command,
    )
  }

  proposeCandidate(command: DeepReadonly<ProposeCandidateCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand('/v1/candidates', 'POST', ProposeCandidateCommandSchema, command, 201)
  }

  rejectCandidate(command: DeepReadonly<RejectCandidateCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/candidates/${encodeURIComponent(command.candidateId)}/reject`,
      'POST',
      RejectCandidateCommandSchema,
      command,
    )
  }

  suppressCandidate(command: DeepReadonly<SuppressCandidateCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/candidates/${encodeURIComponent(command.candidateId)}/suppress`,
      'POST',
      SuppressCandidateCommandSchema,
      command,
    )
  }

  deleteCandidate(command: DeepReadonly<DeleteCandidateCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/candidates/${encodeURIComponent(command.candidateId)}`,
      'DELETE',
      DeleteCandidateCommandSchema,
      command,
    )
  }

  async listPreferences(request: DeepReadonly<PreferenceListHttpRequest>): Promise<PreferenceListHttpResult> {
    const body = parse<PreferenceListHttpRequest>(PreferenceListHttpRequestSchema, request)
    return this.get(`/v1/preferences?${new URLSearchParams(body.identity).toString()}`, PreferenceListHttpResultSchema)
  }

  createExplicitPreference(command: DeepReadonly<CreateExplicitPreferenceCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand('/v1/preferences', 'POST', CreateExplicitPreferenceCommandSchema, command, 201)
  }

  revisePreference(command: DeepReadonly<RevisePreferenceCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/preferences/${encodeURIComponent(command.preferenceId)}/revise`,
      'POST',
      RevisePreferenceCommandSchema,
      command,
    )
  }

  revokePreference(command: DeepReadonly<RevokePreferenceCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/preferences/${encodeURIComponent(command.preferenceId)}/revoke`,
      'POST',
      RevokePreferenceCommandSchema,
      command,
    )
  }

  async getEffectiveProfile(request: DeepReadonly<EffectiveProfileHttpRequest>): Promise<EffectiveProfileHttpResult> {
    const body = parse<EffectiveProfileHttpRequest>(EffectiveProfileHttpRequestSchema, request)
    return this.send('/v1/profile/effective', 'POST', body, EffectiveProfileHttpResultSchema)
  }

  async getConnectionSettings(request: DeepReadonly<ConnectionSettingsHttpRequest>): Promise<ConnectionSettings> {
    const body = parse<ConnectionSettingsHttpRequest>(ConnectionSettingsHttpRequestSchema, request)
    const query = new URLSearchParams(body.identity)
    return this.get(
      `/v1/connections/${encodeURIComponent(body.hostId)}?${query.toString()}`,
      ConnectionSettingsSchema,
    )
  }

  async listConnections(
    request: DeepReadonly<ConnectionListHttpRequest>,
  ): Promise<ConnectionListHttpResult> {
    const body = parse<ConnectionListHttpRequest>(ConnectionListHttpRequestSchema, request)
    return this.get(`/v1/connections?${new URLSearchParams(body.identity).toString()}`, ConnectionListHttpResultSchema)
  }

  updateConnectionSettings(command: DeepReadonly<UpdateConnectionSettingsCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/connections/${encodeURIComponent(command.hostId)}`,
      'PATCH',
      UpdateConnectionSettingsCommandSchema,
      command,
    )
  }

  reportProjectionStatus(command: DeepReadonly<ReportProjectionStatusCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/connections/${encodeURIComponent(command.hostId)}/projection-status`,
      'POST',
      ReportProjectionStatusCommandSchema,
      command,
    )
  }

  async recordPolicyDecision(request: DeepReadonly<RecordPolicyDecisionHttpRequest>): Promise<GovernanceMutationHttpResult> {
    const body = parse<RecordPolicyDecisionHttpRequest>(RecordPolicyDecisionHttpRequestSchema, request)
    return this.send('/v1/policy-decisions', 'POST', body, GovernanceMutationHttpResultSchema)
  }

  async listAuditEvents(request: DeepReadonly<AuditHttpRequest>): Promise<AuditHttpResult> {
    const body = parse<AuditHttpRequest>(AuditHttpRequestSchema, request)
    return this.send('/v1/audit/query', 'POST', body, AuditHttpResultSchema)
  }

  async exportData(request: DeepReadonly<ExportDataHttpRequest>): Promise<PreferenceDataExportHttpResult> {
    const body = parse<ExportDataHttpRequest>(ExportDataHttpRequestSchema, request)
    return this.send('/v1/export', 'POST', body, PreferenceDataExportHttpResultSchema)
  }

  deleteEvidence(command: DeepReadonly<DeleteEvidenceCommand>): Promise<GovernanceMutationHttpResult> {
    return this.sendCommand(
      command => `/v1/evidence/${encodeURIComponent(command.evidenceId)}`,
      'DELETE',
      DeleteEvidenceCommandSchema,
      command,
    )
  }

  async reset(request: DeepReadonly<ResetHttpRequest>): Promise<ResetHttpResult> {
    const body = parse<ResetHttpRequest>(ResetHttpRequestSchema, request)
    return this.send('/v1/reset', 'POST', body, ResetHttpResultSchema)
  }

  private async get<T>(path: string, schema: v.GenericSchema<unknown>): Promise<T> {
    const response = await this.request(path, { method: 'GET' })
    const result = await parseEnvelope<T>(response, schema)
    if (response.status !== 200) throw new RuntimeClientProtocolError()
    return result
  }

  private async post<TRequest, TResult>(
    path: string,
    body: TRequest,
    schema: v.GenericSchema<unknown>,
    expectedStatus = 200,
  ): Promise<TResult> {
    return this.send(path, 'POST', body, schema, expectedStatus)
  }

  private async send<TRequest, TResult>(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: TRequest,
    schema: v.GenericSchema<unknown>,
    expectedStatus = 200,
  ): Promise<TResult> {
    const response = await this.request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await parseEnvelope<TResult>(response, schema)
    if (response.status !== expectedStatus) throw new RuntimeClientProtocolError()
    return result
  }

  private async sendCommand<T>(
    path: string | ((command: T) => string),
    method: 'POST' | 'PATCH' | 'DELETE',
    schema: v.GenericSchema<unknown>,
    command: DeepReadonly<T>,
    expectedStatus = 200,
  ): Promise<GovernanceMutationHttpResult> {
    const parsedCommand = parse<T>(schema, command)
    const request = parse<GovernanceMutationHttpRequest>(GovernanceMutationHttpRequestSchema, {
      command: parsedCommand,
    })
    const resolvedPath = typeof path === 'function' ? path(parsedCommand) : path
    return this.send(resolvedPath, method, request, GovernanceMutationHttpResultSchema, expectedStatus)
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      const headers = new Headers(init.headers)
      headers.set('accept', 'application/json')
      headers.set('authorization', `Bearer ${this.token}`)
      return await this.requestFetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        credentials: 'omit',
        redirect: 'error',
      })
    } catch {
      throw new RuntimeClientProtocolError()
    }
  }
}

const parseEnvelope = <T>(
  response: Response,
  dataSchema: v.GenericSchema<unknown>,
): Promise<T> => {
  if (response.status === 304) throw new RuntimeClientProtocolError()
  return readResponseBody(response).then((body) => {
    if (response.status < 200 || response.status >= 300) {
      const errorEnvelope = parse<HttpErrorResponse>(HttpErrorResponseSchema, body)
      throw new RuntimeClientError({
        status: response.status,
        code: errorEnvelope.error.code,
        retryable: errorEnvelope.error.retryable,
        ...('currentRevision' in errorEnvelope.error
          ? { currentRevision: errorEnvelope.error.currentRevision }
          : {}),
      })
    }
    const envelope = parse<{ ok: true; requestId: string; data: T }>(
      HttpSuccessResponseSchema(dataSchema),
      body,
    )
    return envelope.data
  })
}

const readResponseBody = async (response: Response): Promise<unknown> => {
  try {
    const text = await response.text()
    if (!text) throw new RuntimeClientProtocolError()
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof RuntimeClientProtocolError) throw error
    throw new RuntimeClientProtocolError()
  }
}
