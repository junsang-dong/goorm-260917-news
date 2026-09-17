import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  collectYoutubeSource,
  collectYoutubeTopics,
  getYoutubeStatus,
  type CollectSourceInput,
} from './youtube-collect.ts';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

async function handleApi(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
  const url = req.url || '';
  if (!url.startsWith('/api/v1/integrations')) return next();

  try {
    if (req.method === 'GET' && url.startsWith('/api/v1/integrations/status')) {
      return sendJson(res, 200, getYoutubeStatus());
    }

    if (req.method === 'POST' && url.startsWith('/api/v1/integrations/collect')) {
      const raw = await readBody(req);
      if (raw.length > 50_000) return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: '요청이 너무 큽니다.' });
      let parsed: {
        mode?: 'channel' | 'topics';
        source?: CollectSourceInput;
        keywords?: string[];
        cursor?: string | null;
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'JSON 본문이 올바르지 않습니다.' });
      }

      if (parsed.mode === 'topics') {
        const result = await collectYoutubeTopics({ keywords: parsed.keywords, cursor: parsed.cursor ?? null });
        return sendJson(res, 200, result);
      }

      if (!parsed.source?.id || !parsed.source?.url || !parsed.source?.type) {
        return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'sourceId·url·type이 필요합니다.' });
      }
      const result = await collectYoutubeSource(parsed.source, parsed.cursor ?? null);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { error: 'NOT_FOUND', message: '지원하지 않는 API입니다.' });
  } catch (e) {
    const message = e instanceof Error ? e.message : '수집 중 오류가 발생했습니다.';
    const code = message.includes('API 키') ? 'INTEGRATION_UNAVAILABLE' : 'INTEGRATION_ERROR';
    return sendJson(res, code === 'INTEGRATION_UNAVAILABLE' ? 503 : 502, { error: code, message });
  }
}

export function integrationsApiPlugin(): Plugin {
  return {
    name: 'bcr-integrations-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApi(req, res, next);
      });
    },
  };
}
