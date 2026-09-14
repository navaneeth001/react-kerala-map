import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Dev-server config for the demo app inside ./example.
// The example imports the library directly from ../src so no lib build is needed.
export default defineConfig({
  root: fileURLToPath(new URL('./example', import.meta.url)),
  plugins: [react()],
  server: {
    port: 5174,
    open: false,
  },
});
