import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base:
    process.env.SITE_BASE || loadEnv(mode, process.cwd(), '').SITE_BASE || '/',
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: [
        'index.html',
        'about/index.html',
        'team/index.html',
        'contact/index.html',
      ],
    },
  },
}));
