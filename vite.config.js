import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // Cho phép preview proxy của môi trường sandbox (host dạng *.e2b.app).
    // Trong production Vercel, static build không liên quan cấu hình này.
    allowedHosts: true,
  },
})
