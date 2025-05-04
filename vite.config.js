import { defineConfig } from 'vite';
import { resolve } from 'path';
import copy from 'rollup-plugin-copy';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'html/index.html'),
      },
    },
  },
  server: {
    open: '/html/index.html', // Automatically open the main application page
    port: 3000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    copy({
      targets: [
        {
          src: 'node_modules/@maersk-global/icons/js/**/*',
          dest: 'dist/assets/node_modules',
        },
      ],
      flatten: false,
      hook: 'writeBundle',
      copySync: true,
    }),
  ],
}); 