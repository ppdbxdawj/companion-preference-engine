import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRuntimeLocal } from './main.js'
import { startRuntimeLoopbackServer } from './server.js'

const DEV_RUNTIME_TOKEN = 'COMPANION_PREFERENCE_DEV_RUNTIME_TOKEN'

type DevelopmentRuntime = Readonly<{ close: () => Promise<void> }>
type DevelopmentServer = Readonly<{ stop: () => Promise<void> }>

const configuredPort = (): number => {
  const value = process.env.COMPANION_PREFERENCE_DEV_RUNTIME_PORT ?? '43120'
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('COMPANION_PREFERENCE_DEV_RUNTIME_PORT must be a valid port')
  }
  return port
}

/**
 * Shutdown is deliberately best-effort: a listener-close failure must not
 * leave the SQLite runtime lock or database handle behind. The listener error
 * remains the failure surfaced to the launcher after runtime cleanup.
 */
export const stopDevelopmentRuntime = async (
  server: DevelopmentServer,
  runtime: DevelopmentRuntime,
): Promise<void> => {
  let listenerError: unknown
  try {
    await server.stop()
  } catch (error) {
    listenerError = error
  }

  try {
    await runtime.close()
  } catch (error) {
    if (listenerError === undefined) throw error
  }

  if (listenerError !== undefined) throw listenerError
}

const start = async (): Promise<void> => {
  const token = process.env[DEV_RUNTIME_TOKEN]
  if (token === undefined) throw new Error(`${DEV_RUNTIME_TOKEN} is required`)

  const port = configuredPort()
  const inspectorOrigin = process.env.COMPANION_PREFERENCE_DEV_INSPECTOR_ORIGIN
    ?? 'http://127.0.0.1:5173'
  const databasePath = process.env.COMPANION_PREFERENCE_DEV_DATABASE_PATH
    ?? resolve(process.cwd(), '.companion-preference-dev.sqlite')
  const runtime = createRuntimeLocal({ databasePath, observerProposals: [] })
  await runtime.start()

  let server: Awaited<ReturnType<typeof startRuntimeLoopbackServer>>
  try {
    server = await startRuntimeLoopbackServer({
      coordinator: runtime,
      token,
      allowedOrigins: [inspectorOrigin],
      port,
    })
  } catch (error) {
    await runtime.close()
    throw error
  }

  let stopPromise: Promise<void> | undefined
  const stop = (): Promise<void> => (
    stopPromise ??= stopDevelopmentRuntime(server, runtime)
  )
  const stopOnSignal = (): void => {
    void stop().catch(() => {
      process.exitCode = 1
    })
  }
  process.once('SIGINT', stopOnSignal)
  process.once('SIGTERM', stopOnSignal)
  console.info(`Companion Preference dev runtime listening on http://${server.hostname}:${server.port}`)
}

const isDevEntrypoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDevEntrypoint) {
  void start().catch(error => {
    console.error(error instanceof Error ? error.message : 'Unable to start development runtime')
    process.exitCode = 1
  })
}
