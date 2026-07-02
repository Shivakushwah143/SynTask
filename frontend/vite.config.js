import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

const rootPath = fileURLToPath(new URL('.', import.meta.url))
const srcPath = fileURLToPath(new URL('./src', import.meta.url))
const manualChunkGroups = {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-ui': ['lucide-react', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  'vendor-charts': ['recharts'],
  'vendor-query': ['react-query'],
  'vendor-forms': ['react-hook-form', 'zod', '@hookform/resolvers'],
  'vendor-dates': ['date-fns'],
  'vendor-network': ['axios', 'zustand'],
}

const toNodeModulePath = (packageName) => `node_modules/${packageName}/`

const manualChunks = (id) => {
  const normalizedId = id.replaceAll('\\', '/')
  for (const [chunkName, packages] of Object.entries(manualChunkGroups)) {
    if (packages.some((packageName) => normalizedId.includes(toNodeModulePath(packageName)))) {
      return chunkName
    }
  }
  return undefined
}

// https://vitejs.dev/config/
export default defineConfig({
  root: rootPath,
  plugins: [react()],
  resolve: {
    alias: {
      '@': srcPath,
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
