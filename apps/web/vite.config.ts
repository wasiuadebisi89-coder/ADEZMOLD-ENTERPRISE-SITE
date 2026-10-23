/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { contentSecurityPolicy } from './csp';

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  server: { port: 5173, strictPort: true },
  build: { sourcemap: true },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
