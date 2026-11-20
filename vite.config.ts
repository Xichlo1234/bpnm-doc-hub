import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'hono-dev-api',
      configureServer(server) {
        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.url && req.url.startsWith('/api')) {
            try {
              const serverEntry = path.resolve(__dirname, 'src/server/index.ts');
              const { app } = await server.ssrLoadModule(serverEntry);
              const protocol = req.headers['x-forwarded-proto'] || 'http';
              const host = req.headers.host || 'localhost:5180';
              const fullUrl = `${protocol}://${host}${req.url}`;

              // Read body for POST/PUT/PATCH
              let bodyBuffer: Buffer | undefined;
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                  chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                }
                bodyBuffer = Buffer.concat(chunks);
              }

              const headers = new Headers();
              for (const [key, value] of Object.entries(req.headers)) {
                if (value !== undefined) {
                  if (Array.isArray(value)) {
                    value.forEach(v => headers.append(key, v));
                  } else {
                    headers.set(key, value);
                  }
                }
              }

              const request = new Request(fullUrl, {
                method: req.method,
                headers,
                body: bodyBuffer && bodyBuffer.length > 0 ? (bodyBuffer as any) : undefined,
              });

              const response = await app.fetch(request);
              res.statusCode = response.status;
              response.headers.forEach((val: string, key: string) => {
                res.setHeader(key, val);
              });

              if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(value);
                }
              }
              res.end();
              return;
            } catch (err) {
              console.error('API middleware error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(err) }));
              return;
            }
          }
          next();
        });
      },
    },
  ],
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    host: true,
  },
});
