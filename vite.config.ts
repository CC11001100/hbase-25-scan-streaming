import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/hbase-25-scan-streaming/',
  server: {
    port: 54325,
  },
})
