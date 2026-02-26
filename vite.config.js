import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html"],
  },
  server: {
    port: 3210,
    proxy: {
      '/api': {
        target: 'http://localhost:3211',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
