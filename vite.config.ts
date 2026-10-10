import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // basicSsl: serve over HTTPS so other devices on the network are allowed to use the camera
  plugins: [react(), basicSsl()],
})
