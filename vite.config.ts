import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { integrationsApiPlugin } from './server/api-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) process.env[key] = value;
  }

  return {
    plugins: [react(), integrationsApiPlugin()],
    server: { host: '0.0.0.0', port: 5173 },
    preview: { host: '0.0.0.0', port: 5173 },
  };
});
