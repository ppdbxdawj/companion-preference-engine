import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const LOOPBACK_RUNTIME_ORIGIN = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/

/**
 * The development proxy owns a bearer token, so it must never forward that
 * token beyond the literal IPv4 loopback listener started by this project.
 */
export const parseDevelopmentRuntimeOrigin = (value: string | undefined): string => {
  const origin = value ?? 'http://127.0.0.1:43120'
  const match = LOOPBACK_RUNTIME_ORIGIN.exec(origin)
  const port = match?.[1] === undefined ? Number.NaN : Number(match[1])
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      'COMPANION_PREFERENCE_DEV_RUNTIME_ORIGIN must be literal http://127.0.0.1:<valid port>',
    )
  }
  return origin
}

const runtimeOrigin = parseDevelopmentRuntimeOrigin(process.env.COMPANION_PREFERENCE_DEV_RUNTIME_ORIGIN)

export default defineConfig(({ command }) => {
  const token = process.env.COMPANION_PREFERENCE_DEV_RUNTIME_TOKEN
  if (command === 'serve' && token === undefined) {
    throw new Error('COMPANION_PREFERENCE_DEV_RUNTIME_TOKEN is required for the Inspector development proxy')
  }

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': {
          target: runtimeOrigin,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, ''),
          configure(proxy) {
            proxy.on('proxyReq', request => {
              if (token !== undefined) request.setHeader('authorization', `Bearer ${token}`)
            })
          },
        },
      },
    },
  }
})
