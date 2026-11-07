import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vaultPlugin from './server/plugin.js';

export default defineConfig({
  plugins: [react(), vaultPlugin()],
  server: {
    port: 5180,
    host: '127.0.0.1',
    watch: { ignored: ['**/vault/**'] },
  },
  preview: { host: '127.0.0.1' },
});
