import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../mobile/src/i18n/', import.meta.url))] },
  },
})
