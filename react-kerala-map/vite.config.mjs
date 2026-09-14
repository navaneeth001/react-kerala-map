import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Library build config: emits dist/index.es.js, dist/index.umd.js and
// dist/react-kerala-map.css (all Leaflet/React CSS is bundled into it).
export default defineConfig({
  plugins: [
    // Classic JSX runtime keeps the UMD build trivially consumable
    // (it only needs the global `React`, not a separate jsx-runtime global).
    react({ jsxRuntime: 'classic' }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.js', import.meta.url)),
      name: 'ReactKeralaMap',
      formats: ['es', 'umd'],
      cssFileName: 'react-kerala-map',
      fileName: (format) => `index.${format === 'es' ? 'es' : 'umd'}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        exports: 'named',
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    // Inline Leaflet's small CSS-referenced images (markers, layers icons)
    // so consumers get a single CSS file with no extra asset requests.
    assetsInlineLimit: 100000,
    sourcemap: true,
  },
});
