import { defineConfig } from 'vitest/config'

export default defineConfig({
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
