import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ command, mode }) => {
  const runtimeModule = mode === 'mock'
    ? './mocks/runtime.ts'
    : './src/runtime/live.ts'

  return {
    plugins: [react()],
    // Сборка принтера обращается к локальному API независимо от dev-настроек .env.
    define: command === 'build' && mode === 'live'
      ? {
          'import.meta.env.VITE_MOONRAKER_URL': JSON.stringify('http://127.0.0.1:7125'),
          'import.meta.env.VITE_UI_RELEASE_TAG': JSON.stringify(process.env.UI_RELEASE_TAG ?? 'unknown'),
        }
      : {},
    resolve: {
      alias: {
        '#runtime': fileURLToPath(new URL(runtimeModule, import.meta.url)),
      },
    },
  }
})
