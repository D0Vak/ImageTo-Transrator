import { defineConfig } from 'vite'

export default defineConfig({
  // Base path for deployment. './' makes it relative and works in most environments.
  base: './',
  build: {
    outDir: 'dist',
  }
})
