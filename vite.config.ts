import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'node:url'

export default defineConfig(() => {
  const projectRoot = path.dirname(fileURLToPath(import.meta.url))
  const buildId = new Date().toISOString()

  return {
    base: '/Status/',

    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'status-997-build-version',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'app-version.json',
            source: JSON.stringify({ buildId }),
          })
        },
      },
    ],

    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },

    resolve: {
      alias: {
        '@': projectRoot,
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  }
})
