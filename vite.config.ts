import { defineConfig, loadEnv, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function configureLocalAPI(server: { middlewares: Connect.Server }, mode: string) {
  const env = loadEnv(mode, process.cwd(), ['SUPABASE_', 'DATABASE_URL', 'POSTGRES_']);
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL']) if (env[key]) process.env[key] = env[key];
  server.middlewares.use(async (req, res, next) => {
          const path = req.url?.split('?')[0];
          try {
            if (path === '/api/health') { const { default: handler } = await import('./api/health'); await handler(req, res); }
            else if (path === '/api/book') { const { default: handler } = await import('./api/book'); await handler(req, res); }
            else if (path === '/api/recipes') { const { default: handler } = await import('./api/recipes'); await handler(req, res); }
            else next();
          } catch { res.statusCode = 500; res.end(JSON.stringify({ error: 'No se ha podido conectar.' })); }
  });
}

export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: 'local-vercel-api',
      configureServer(server) { configureLocalAPI(server, mode); },
      configurePreviewServer(server) { configureLocalAPI(server, mode); },
    },
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'images/*.webp'],
      manifest: {
        name: 'A fuego lento',
        short_name: 'A fuego lento',
        description: 'Mi recetario personal',
        lang: 'es',
        theme_color: '#a7354f',
        background_color: '#faf9f7',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,webp,woff2}'], navigateFallback: '/index.html' },
    }),
  ],
}));
