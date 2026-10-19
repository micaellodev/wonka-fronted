import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  // Electron carga dist/index.html por file:// (rutas relativas); la web necesita rutas absolutas o /admin/... da pantalla en blanco
  base: process.env.ELECTRON_BUILD ? './' : '/',
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // release/ holds 400MB+ of Electron build output; watching it exhausts memory
  server: { watch: { ignored: ['**/release/**'] } },
})
