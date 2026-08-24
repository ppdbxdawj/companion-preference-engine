import vue from './apps/inspector/node_modules/@vitejs/plugin-vue/dist/index.mjs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: [
      'apps/**/*.test.ts',
      'adapters/**/*.test.ts',
      'evals/**/*.test.ts',
      'packages/**/*.test.ts',
      'servers/**/*.test.ts',
    ],
  },
})
