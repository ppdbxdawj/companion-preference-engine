import { createHash, randomUUID } from 'node:crypto'

import {
  AuditHttpRequestSchema,
  CandidateListHttpRequestSchema,
  ConnectionListHttpRequestSchema,
  ConnectionSettingsHttpRequestSchema,
  ConfirmCandidateCommandSchema,
  CreateExplicitPreferenceCommandSchema,
  DeleteCandidateCommandSchema,
  DeleteEvidenceCommandSchema,
  EffectiveProfileHttpRequestSchema,
  ExportDataHttpRequestSchema,
  GovernanceMutationHttpRequestSchema,
  IngestEvidenceHttpRequestSchema,
  PreferenceListHttpRequestSchema,
  ProposeCandidateCommandSchema,
  RejectCandidateCommandSchema,
  ReportProjectionStatusCommandSchema,
  RESET_CONFIRMATION_PHRASE as SHARED_RESET_CONFIRMATION_PHRASE,
  ResetHttpRequestSchema,
  RevisePreferenceCommandSchema,
  RevokePreferenceCommandSchema,
  SuppressCandidateCommandSchema,
  UpdateConnectionSettingsCommandSchema,
  type AuditHttpRequest,
  type CandidateListHttpRequest,
  type ConnectionListHttpRequest,
  type ConnectionSettingsHttpRequest,
  type ConfirmCandidateCommand,
  type CreateExplicitPreferenceCommand,
  type DeleteCandidateCommand,
  type DeleteEvidenceCommand,
  type EffectiveProfileHttpRequest,
  type ExportDataHttpRequest,
  type GovernanceMutationHttpRequest,
  type HttpErrorCode,
  type HttpErrorDetail,
  type IngestEvidenceHttpRequest,
  type PreferenceListHttpRequest,
  type PreferenceCandidate,
  type ProposeCandidateCommand,
  type RejectCandidateCommand,
  type ReportProjectionStatusCommand,
  type ResetHttpRequest,
  type RevisePreferenceCommand,
  type RevokePreferenceCommand,
  type SuppressCandidateCommand,
  type UpdateConnectionSettingsCommand,
} from '@companion-preference/contracts'
import {
  ActivePreferenceSlotOccupiedError,
  ActionPayloadConflictError,
  CandidateIdempotencyConflictError,
  InvalidTransitionError,
  RevisionConflictError,
} from '@companion-preference/preference-core'
import {
  createAdaptorServer,
  type ServerType,
} from '@hono/node-server'
import { Hono } from 'hono'
import * as v from 'valibot'

import { createRuntimeAuthPolicy } from './auth.js'
import type { PreferenceApplication } from './application.js'
import {
  RuntimeUnavailableError,
  type RuntimeLifecycleCoordinator,
} from './runtime-lifecycle.js'

export const RUNTIME_LOOPBACK_HOST = '127.0.0.1' as const
export const RESET_CONFIRMATION_PHRASE = SHARED_RESET_CONFIRMATION_PHRASE

const HTTP_ETAG = /^"[0-9a-f]{64}"$/

type RuntimeHttpVariables = {
  requestId: string
}

type RuntimeHttpCoordinator = Pick<
  RuntimeLifecycleCoordinator<PreferenceApplication>,
  'execute' | 'resetAllData' | 'state'
>

export type RuntimeHttpAppOptions = Readonly<{
  coordinator: RuntimeHttpCoordinator
  token: string
  allowedOrigins: readonly string[]
  requestIdFactory?: () => string
}>

export type RuntimeNodeServerOptions<TFetch> = Readonly<{
  fetch: TFetch
  port: number
}>

type RuntimeNodeServerFactory = typeof createAdaptorServer

export type StartRuntimeLoopbackServerOptions = RuntimeHttpAppOptions & Readonly<{
  port: number
  /** Test/custom adapter seam; loopback host and port remain runtime-owned. */
  nodeServerFactory?: RuntimeNodeServerFactory
}>

export type RuntimeLoopbackServerHandle = Readonly<{
  hostname: typeof RUNTIME_LOOPBACK_HOST
  port: number
  stop: () => Promise<void>
}>

class BadRequestError extends Error {
  constructor() {
    super('Request did not match the protocol')
    this.name = 'BadRequestError'
  }
}

class SettingsRevisionConflictError extends Error {
  constructor(readonly actualRevision: number) {
    super('The expected settings revision is no longer current')
    this.name = 'SettingsRevisionConflictError'
  }
}

const executeSettingsMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      throw new SettingsRevisionConflictError(error.actualRevision)
    }
    throw error
  }
}

const parse = <T>(schema: v.GenericSchema<unknown>, value: unknown): T => {
  const result = v.safeParse(schema, value)
  if (!result.success) throw new BadRequestError()
  return result.output as T
}

const readJson = async <T>(
  request: Request,
  schema: v.GenericSchema<unknown>,
): Promise<T> => {
  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new BadRequestError()
  }
  return parse<T>(schema, value)
}

const sameIdentity = (
  left: PreferenceCandidate['identity'],
  right: CandidateListHttpRequest['identity'],
): boolean => left.userId === right.userId
  && left.companionId === right.companionId
  && left.relationshipId === right.relationshipId

const candidateQuery = (request: Request): CandidateListHttpRequest => {
  const search = new URL(request.url).searchParams
  const allowed = new Set(['userId', 'companionId', 'relationshipId', 'statuses'])
  for (const key of search.keys()) {
    if (!allowed.has(key) || search.getAll(key).length !== 1) throw new BadRequestError()
  }

  const statuses = search.get('statuses')
  return parse<CandidateListHttpRequest>(CandidateListHttpRequestSchema, {
    identity: {
      userId: search.get('userId'),
      companionId: search.get('companionId'),
      relationshipId: search.get('relationshipId'),
    },
    ...(statuses === null ? {} : { statuses: statuses.split(',') }),
  })
}

const strictSearch = (
  request: Request,
  allowedKeys: readonly string[],
): URLSearchParams => {
  const search = new URL(request.url).searchParams
  const allowed = new Set(allowedKeys)
  for (const key of search.keys()) {
    if (!allowed.has(key) || search.getAll(key).length !== 1) throw new BadRequestError()
  }
  return search
}

const requiredSearchValue = (search: URLSearchParams, key: string): string => {
  const value = search.get(key)
  if (value === null) throw new BadRequestError()
  return value
}

const preferenceListQuery = (request: Request): PreferenceListHttpRequest => {
  const keys = ['userId', 'companionId', 'relationshipId', 'hostId', 'sessionId', 'domain'] as const
  const search = strictSearch(request, keys)
  return parse<PreferenceListHttpRequest>(PreferenceListHttpRequestSchema, {
    identity: Object.fromEntries(keys.map(key => [key, requiredSearchValue(search, key)])),
  })
}

const connectionQuery = (request: Request, hostId: string): ConnectionSettingsHttpRequest => {
  const keys = ['userId', 'companionId', 'relationshipId'] as const
  const search = strictSearch(request, keys)
  return parse<ConnectionSettingsHttpRequest>(ConnectionSettingsHttpRequestSchema, {
    identity: Object.fromEntries(keys.map(key => [key, requiredSearchValue(search, key)])),
    hostId,
  })
}

const connectionListQuery = (request: Request): ConnectionListHttpRequest => {
  const keys = ['userId', 'companionId', 'relationshipId'] as const
  const search = strictSearch(request, keys)
  return parse<ConnectionListHttpRequest>(ConnectionListHttpRequestSchema, {
    identity: Object.fromEntries(keys.map(key => [key, requiredSearchValue(search, key)])),
  })
}

const etagFor = (value: unknown): string => {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex')
  return `"${digest}"`
}

const errorDetail = (error: unknown): Readonly<{
  status: 400 | 409 | 500 | 503
  detail: HttpErrorDetail
}> => {
  if (error instanceof BadRequestError) {
    return {
      status: 400,
      detail: { code: 'bad-request', message: 'Request did not match the protocol', retryable: false },
    }
  }
  if (error instanceof RevisionConflictError) {
    return {
      status: 409,
      detail: {
        code: 'revision-conflict',
        message: 'The expected revision is no longer current',
        retryable: false,
        currentRevision: error.actualRevision,
      },
    }
  }
  if (error instanceof SettingsRevisionConflictError) {
    return {
      status: 409,
      detail: {
        code: 'settings-revision-conflict',
        message: 'The expected settings revision is no longer current',
        retryable: false,
        currentRevision: error.actualRevision,
      },
    }
  }
  if (error instanceof ActionPayloadConflictError) {
    return {
      status: 409,
      detail: {
        code: 'action-payload-conflict',
        message: 'The action ID was already used for another request',
        retryable: false,
      },
    }
  }
  if (error instanceof ActivePreferenceSlotOccupiedError) {
    return {
      status: 409,
      detail: {
        code: 'active-preference-conflict',
        message: 'An active preference already occupies this slot',
        retryable: false,
      },
    }
  }
  if (error instanceof CandidateIdempotencyConflictError) {
    return {
      status: 409,
      detail: {
        code: 'candidate-idempotency-conflict',
        message: 'The candidate idempotency key conflicts with another candidate',
        retryable: false,
      },
    }
  }
  if (error instanceof InvalidTransitionError) {
    return {
      status: 409,
      detail: {
        code: 'invalid-transition',
        message: 'The requested lifecycle transition is not allowed',
        retryable: false,
      },
    }
  }
  if (error instanceof RuntimeUnavailableError) {
    if (error.code === 'RUNTIME_MAINTENANCE') {
      return {
        status: 503,
        detail: {
          code: 'runtime-maintenance',
          message: 'The runtime is temporarily in maintenance mode',
          retryable: true,
        },
      }
    }
    return {
      status: 503,
      detail: {
        code: 'runtime-closed',
        message: 'The runtime is closed',
        retryable: false,
      },
    }
  }
  return {
    status: 500,
    detail: { code: 'internal-error', message: 'The runtime request failed', retryable: false },
  }
}

const authErrorDetail = (code: Extract<HttpErrorCode, 'unauthorized' | 'forbidden'>): HttpErrorDetail => ({
  code,
  message: code === 'unauthorized' ? 'Authentication is required' : 'The browser origin is not allowed',
  retryable: false,
})

export const createRuntimeNodeServerOptions = <TFetch>(
  options: RuntimeNodeServerOptions<TFetch>,
): Readonly<{
  fetch: TFetch
  hostname: typeof RUNTIME_LOOPBACK_HOST
  port: number
}> => {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new Error('Runtime server requires an explicit valid port')
  }
  return { fetch: options.fetch, hostname: RUNTIME_LOOPBACK_HOST, port: options.port }
}

const closeListeningServer = (server: ServerType): Promise<void> => {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/**
 * Explicitly start the authenticated runtime API on IPv4 loopback. Constructing
 * either the runtime coordinator or Hono app never opens a socket.
 */
export const startRuntimeLoopbackServer = async (
  options: StartRuntimeLoopbackServerOptions,
): Promise<RuntimeLoopbackServerHandle> => {
  const app = createRuntimeHttpApp(options)
  const nodeOptions = createRuntimeNodeServerOptions({ fetch: app.fetch, port: options.port })
  const serverFactory = options.nodeServerFactory ?? createAdaptorServer

  return new Promise((resolve, reject) => {
    let server: ServerType | undefined
    let startupSettled = false

    const rejectStart = (error: unknown): void => {
      if (startupSettled) return
      startupSettled = true
      const currentServer = server
      if (!currentServer) {
        reject(error)
        return
      }
      currentServer.off('error', rejectStart)
      void closeListeningServer(currentServer).then(
        () => reject(error),
        () => reject(error),
      )
    }

    try {
      const createdServer = serverFactory(nodeOptions)
      server = createdServer
      createdServer.once('error', rejectStart)
      createdServer.listen(nodeOptions.port, nodeOptions.hostname, () => {
        if (startupSettled) return
        startupSettled = true
        createdServer.off('error', rejectStart)

        let stopPromise: Promise<void> | undefined
        const stop = (): Promise<void> => {
          stopPromise ??= closeListeningServer(createdServer)
          return stopPromise
        }
        resolve(Object.freeze({
          hostname: RUNTIME_LOOPBACK_HOST,
          port: nodeOptions.port,
          stop,
        }))
      })
    } catch (error) {
      rejectStart(error)
    }
  })
}

export const createRuntimeHttpApp = (options: RuntimeHttpAppOptions) => {
  const authPolicy = createRuntimeAuthPolicy({
    token: options.token,
    allowedOrigins: options.allowedOrigins,
  })
  const requestIdFactory = options.requestIdFactory ?? randomUUID
  const allowedOrigins = new Set(options.allowedOrigins)
  const app = new Hono<{ Variables: RuntimeHttpVariables }>()

  app.use('*', async (context, next) => {
    const requestId = requestIdFactory()
    context.set('requestId', requestId)
    const origin = context.req.header('origin')

    if (context.req.method === 'OPTIONS') {
      if (origin === undefined || !allowedOrigins.has(origin)) {
        return context.json({
          ok: false,
          requestId,
          error: authErrorDetail('forbidden'),
        }, 403)
      }
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-headers': 'authorization, content-type, if-none-match',
          'access-control-allow-methods': 'DELETE, GET, PATCH, POST, OPTIONS',
          vary: 'Origin',
        },
      })
    }

    const decision = authPolicy.authorize(context.req.raw)
    if (!decision.ok) {
      const response = context.json({
        ok: false,
        requestId,
        error: authErrorDetail(decision.code),
      }, decision.status)
      if (origin !== undefined && allowedOrigins.has(origin)) {
        response.headers.set('access-control-allow-origin', origin)
        response.headers.set('vary', 'Origin')
      }
      return response
    }

    await next()
    if (origin !== undefined && allowedOrigins.has(origin)) {
      context.res.headers.set('access-control-allow-origin', origin)
      context.res.headers.set('vary', 'Origin')
    }
  })

  app.onError((error, context) => {
    const mapped = errorDetail(error)
    return context.json({
      ok: false,
      requestId: context.get('requestId'),
      error: mapped.detail,
    }, mapped.status)
  })

  app.notFound(context => context.json({
    ok: false,
    requestId: context.get('requestId'),
    error: {
      code: 'not-found',
      message: 'The runtime route was not found',
      retryable: false,
    },
  }, 404))

  app.get('/health', context => context.json({
    ok: true,
    requestId: context.get('requestId'),
    data: { apiVersion: 1, status: 'ok' },
  }, 200))

  app.post('/v1/evidence', async context => {
    const request = await readJson<IngestEvidenceHttpRequest>(
      context.req.raw,
      IngestEvidenceHttpRequestSchema,
    )
    const result = await options.coordinator.execute(application => application.ingestEvidence(request.evidence))
    const disposition = result.disposition === 'inserted' ? 'accepted' : result.disposition
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: {
        evidenceId: request.evidence.id,
        disposition,
        ...('reasonCode' in result ? { reasonCode: result.reasonCode } : {}),
        settingsRevision: result.settingsRevision,
      },
    }, 202)
  })

  app.get('/v1/candidates', async context => {
    const request = candidateQuery(context.req.raw)
    const candidates = await options.coordinator.execute(async (application) => {
      const groups = request.statuses === undefined
        ? [await application.listCandidates()]
        : await Promise.all(request.statuses.map(status => application.listCandidates(status)))
      const byId = new Map<string, PreferenceCandidate>()
      for (const candidate of groups.flat()) {
        if (sameIdentity(candidate.identity, request.identity)) byId.set(candidate.id, candidate)
      }
      return [...byId.values()]
    })
    const data = { candidates }
    const etag = etagFor(data)
    const ifNoneMatch = context.req.header('if-none-match')
    if (ifNoneMatch !== undefined && HTTP_ETAG.test(ifNoneMatch) && ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers: { etag } })
    }
    context.header('etag', etag)
    return context.json({ ok: true, requestId: context.get('requestId'), data }, 200)
  })

  app.post('/v1/candidates/:id/confirm', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<ConfirmCandidateCommand>(ConfirmCandidateCommandSchema, envelope.command)
    if (context.req.param('id') !== command.candidateId) throw new BadRequestError()
    const preference = await options.coordinator.execute(application => application.confirmCandidate(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: {
        kind: 'preference',
        actionId: command.actionId,
        preference,
      },
    }, 200)
  })

  app.post('/v1/candidates', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<ProposeCandidateCommand>(ProposeCandidateCommandSchema, envelope.command)
    const candidate = await options.coordinator.execute(application => application.proposeCandidate(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'candidate', actionId: command.actionId, candidate },
    }, 201)
  })

  app.post('/v1/candidates/:id/reject', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<RejectCandidateCommand>(RejectCandidateCommandSchema, envelope.command)
    if (context.req.param('id') !== command.candidateId) throw new BadRequestError()
    await options.coordinator.execute(application => application.rejectCandidate(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'completed', actionId: command.actionId },
    }, 200)
  })

  app.post('/v1/candidates/:id/suppress', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<SuppressCandidateCommand>(SuppressCandidateCommandSchema, envelope.command)
    if (context.req.param('id') !== command.candidateId) throw new BadRequestError()
    await options.coordinator.execute(application => application.suppressCandidate(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'completed', actionId: command.actionId },
    }, 200)
  })

  app.delete('/v1/candidates/:id', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<DeleteCandidateCommand>(DeleteCandidateCommandSchema, envelope.command)
    if (context.req.param('id') !== command.candidateId) throw new BadRequestError()
    await options.coordinator.execute(application => application.deleteCandidate(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'completed', actionId: command.actionId },
    }, 200)
  })

  app.get('/v1/preferences', async context => {
    const request = preferenceListQuery(context.req.raw)
    const preferences = await options.coordinator.execute(
      application => application.listActivePreferences(request.identity),
    )
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { preferences },
    }, 200)
  })

  app.post('/v1/preferences', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<CreateExplicitPreferenceCommand>(
      CreateExplicitPreferenceCommandSchema,
      envelope.command,
    )
    const preference = await options.coordinator.execute(
      application => application.createExplicitPreference(command),
    )
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'preference', actionId: command.actionId, preference },
    }, 201)
  })

  app.post('/v1/preferences/:id/revise', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<RevisePreferenceCommand>(RevisePreferenceCommandSchema, envelope.command)
    if (context.req.param('id') !== command.preferenceId) throw new BadRequestError()
    const preference = await options.coordinator.execute(application => application.revisePreference(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'preference', actionId: command.actionId, preference },
    }, 200)
  })

  app.post('/v1/preferences/:id/revoke', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<RevokePreferenceCommand>(RevokePreferenceCommandSchema, envelope.command)
    if (context.req.param('id') !== command.preferenceId) throw new BadRequestError()
    const preference = await options.coordinator.execute(application => application.revokePreference(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'preference', actionId: command.actionId, preference },
    }, 200)
  })

  app.post('/v1/profile/effective', async context => {
    const request = await readJson<EffectiveProfileHttpRequest>(
      context.req.raw,
      EffectiveProfileHttpRequestSchema,
    )
    const result = await options.coordinator.execute(
      application => application.getEffectiveProfile(request.query),
    )
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { guidance: result.guidance, settingsRevision: result.settingsRevision },
    }, 200)
  })

  app.get('/v1/connections', async context => {
    const request = connectionListQuery(context.req.raw)
    const connections = await options.coordinator.execute(
      application => application.listConnectionSettings(request.identity),
    )
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { connections },
    }, 200)
  })

  app.get('/v1/connections/:hostId', async context => {
    const request = connectionQuery(context.req.raw, context.req.param('hostId'))
    const settings = await options.coordinator.execute(
      application => application.getConnectionSettings(request.identity, request.hostId),
    )
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: settings,
    }, 200)
  })

  app.patch('/v1/connections/:hostId', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<UpdateConnectionSettingsCommand>(
      UpdateConnectionSettingsCommandSchema,
      envelope.command,
    )
    if (context.req.param('hostId') !== command.hostId) throw new BadRequestError()
    const settings = await executeSettingsMutation(
      () => options.coordinator.execute(application => application.updateConnectionSettings(command)),
    )
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'connection-settings', actionId: command.actionId, settings },
    }, 200)
  })

  app.post('/v1/connections/:hostId/projection-status', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<ReportProjectionStatusCommand>(
      ReportProjectionStatusCommandSchema,
      envelope.command,
    )
    if (context.req.param('hostId') !== command.hostId) throw new BadRequestError()
    const projectionStatus = await executeSettingsMutation(
      () => options.coordinator.execute(
        application => application.reportAdapterProjectionStatus(command),
      ),
    )
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'projection-status', actionId: command.actionId, projectionStatus },
    }, 200)
  })

  app.post('/v1/policy-decisions', () => {
    // The application/repository does not yet provide an atomic action receipt
    // for this mutation. Refuse admission until replays are governed rather
    // than acknowledging a write that cannot be made idempotent.
    throw new RuntimeUnavailableError('RUNTIME_MAINTENANCE')
  })

  app.post('/v1/audit/query', async context => {
    const request = await readJson<AuditHttpRequest>(context.req.raw, AuditHttpRequestSchema)
    const events = await options.coordinator.execute(application => application.listAuditEvents(request.query))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { events },
    }, 200)
  })

  app.post('/v1/export', async context => {
    const request = await readJson<ExportDataHttpRequest>(context.req.raw, ExportDataHttpRequestSchema)
    const data = await options.coordinator.execute(application => application.exportData(request.identity))
    return context.json({ ok: true, requestId: context.get('requestId'), data }, 200)
  })

  app.delete('/v1/evidence/:id', async context => {
    const envelope = await readJson<GovernanceMutationHttpRequest>(
      context.req.raw,
      GovernanceMutationHttpRequestSchema,
    )
    const command = parse<DeleteEvidenceCommand>(DeleteEvidenceCommandSchema, envelope.command)
    if (context.req.param('id') !== command.evidenceId) throw new BadRequestError()
    const result = await options.coordinator.execute(application => application.deleteEvidence(command))
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { kind: 'evidence-deletion', actionId: command.actionId, result },
    }, 200)
  })

  app.post('/v1/reset', async context => {
    await readJson<ResetHttpRequest>(context.req.raw, ResetHttpRequestSchema)
    await options.coordinator.resetAllData()
    return context.json({
      ok: true,
      requestId: context.get('requestId'),
      data: { status: 'reset' },
    }, 200)
  })

  return app
}
