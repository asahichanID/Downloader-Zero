import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function dzBuildVersionPlugin(enabled: boolean): Plugin {
  const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    name: 'dz-build-version',
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html.replace(
        '</head>',
        `    <meta name="dz-build-id" content="${buildId}" />\n  </head>`
      );
    },
    generateBundle() {
      if (!enabled) return;
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          buildId,
          builtAt: new Date().toISOString(),
        }),
      });
    },
  };
}

export default defineConfig(({command}) => {
  const isBuild = command === 'build';
  return {
    base: '/',
    plugins: [react(), tailwindcss(), dzBuildVersionPlugin(isBuild)],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR and standalone WS server disabled to prevent port 24678 conflicts
      hmr: false as const,
      ws: false as const,
      watch: {
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      },
    },
  };
});
