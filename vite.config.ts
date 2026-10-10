import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // HTTPS lets other devices on the network use the camera. API requests are
  // forwarded to the standalone backend during development.
  plugins: [react(), basicSsl()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
