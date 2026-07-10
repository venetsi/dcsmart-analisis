import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El proxy hace que /api funcione igual en dev (-> backend local) y en prod
// (-> rewrite de Firebase Hosting a Cloud Run), sin variables de entorno por ambiente.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
