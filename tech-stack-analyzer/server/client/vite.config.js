import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // frappe-gantt の package.json exports は "." しか公開しておらず、
      // dist/frappe-gantt.css へのサブパスimportがexportsマップの制約でブロックされるため明示的に解決する。
      'frappe-gantt/dist/frappe-gantt.css': path.resolve(__dirname, 'node_modules/frappe-gantt/dist/frappe-gantt.css'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
  },
});
