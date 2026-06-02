import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const runtimeModule = mode === 'mock'
    ? './mocks/runtime.ts'
    : './src/runtime/live.ts'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '#runtime': fileURLToPath(new URL(runtimeModule, import.meta.url)),
      },
    },
  }
})
