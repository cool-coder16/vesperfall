import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Deployed under https://cool-coder16.github.io/vesperfall/ — the base must match the repo name.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/vesperfall/',
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
} as any);
