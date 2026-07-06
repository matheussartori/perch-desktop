import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve('src/domain'),
      '@application': resolve('src/application'),
      '@infrastructure': resolve('src/infrastructure'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    // Domain + application are pure and run in Node. Infra/renderer adapters
    // that need Electron/DOM are covered by their own integration suites.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**']
    }
  }
})
