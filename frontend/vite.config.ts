import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/__test__/*.test.{ts,tsx}'],
  },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
