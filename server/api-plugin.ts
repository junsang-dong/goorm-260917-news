import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  collectYoutubeSource,
  collectYoutubeTopics,
  getYoutubeStatus,
  type CollectSourceInput,
} from './youtube-collect.ts';
import { requireUser } from './auth.ts';
import { analyzeWithGpt, getLlmStatus } from './gpt-analysis.ts';
import { checkDatabaseConnection, readWorkspace, writeWorkspace } from './neon-store.ts';

function readBody(req: IncomingMessage): Promise<string> {
  const parsedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (parsedBody !== undefined) {
    return Promise.resolve(typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody));
  }
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

export async function handleApi(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void = () => undefined) {
  const url = req.url || '';
  if (!url.startsWith('/api/v1/')) return next();

  try {
    if (req.method === 'GET' && url.startsWith('/api/v1/integrations/status')) {
      const status = getYoutubeStatus();
      const database = await checkDatabaseConnection();
      return sendJson(res, 200, {
        ...status,
        providers: {
          ...status.providers,
          llm: getLlmStatus() ? 'configured' : 'missing',
          database: database ? 'connected' : process.env.DATABASE_URL?.trim() ? 'unavailable' : 'missing',
        },
        llm: getLlmStatus(),
        database,
      });
    }

    if (url.startsWith('/api/v1/workspace')) {
      const user = await requireUser(req);
      if (req.method === 'GET') {
        const workspace = await readWorkspace(user.uid);
        return sendJson(res, 200, workspace || { state: null, revision: 0 });
      }
      if (req.method === 'PUT') {
        const raw = await readBody(req);
        if (raw.length > 12_000_000) return sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE', message: '워크스페이스는 12MB 이하여야 합니다.' });
        const parsed = JSON.parse(raw) as { state?: unknown; expectedRevision?: number };
        const revision = await writeWorkspace(user.uid, parsed.state, parsed.expectedRevision);
        return sendJson(res, 200, { revision });
      }
      return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: '지원하지 않는 요청입니다.' });
    }

    if (req.method === 'POST' && url.startsWith('/api/v1/analysis')) {
      await requireUser(req);
      const raw = await readBody(req);
      if (raw.length > 80_000) return sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE', message: '분석 요청이 너무 큽니다.' });
      const parsed = JSON.parse(raw) as { content?: unknown; company?: unknown };
      const result = await analyzeWithGpt(parsed.content, parsed.company);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && url.startsWith('/api/v1/integrations/collect')) {
      await requireUser(req);
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
    const explicitStatus = typeof e === 'object' && e && 'statusCode' in e ? Number((e as { statusCode: number }).statusCode) : 0;
    const validation = typeof e === 'object' && e && ('issues' in e || e instanceof SyntaxError);
    const status = explicitStatus || (validation ? 400 : message.includes('API 키') ? 503 : 502);
    const code = status === 401 ? 'UNAUTHORIZED' : status === 409 ? 'VERSION_CONFLICT' : status === 400 ? 'VALIDATION_ERROR' : status === 503 ? 'INTEGRATION_UNAVAILABLE' : 'INTEGRATION_ERROR';
    return sendJson(res, status, { error: code, message });
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
