const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');
const path = require('node:path');

module.exports = defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
