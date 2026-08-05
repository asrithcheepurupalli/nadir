import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    // The pack is one large JSON asset. Keep it a fetched file rather than an
    // inlined import so the loading state can stream it and the service worker
    // can cache it independently of the app bundle.
    assetsInlineLimit: 4096,
  },
});
