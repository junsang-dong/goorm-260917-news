import type { Content, Source } from '../shared/schemas';
import { repository } from './repository';

export const TOPIC_SOURCE_ID = 'a0000000-0000-4000-8000-000000000001';
export const TOPIC_SOURCE_URL = 'https://www.youtube.com/results?search_query=robot+actuator+controller+AI';

export type IntegrationStatus = {
  youtube: boolean;
  integrations: 'off' | 'server';
  providers: { youtube: string; rss: string; llm: string };
  topicQueries?: string[];
};

export type CollectedPayload = {
  items: Array<{
    type: 'video';
    title: string;
    titleKo: string;
    url: string;
    description: string;
    source: string;
    publishedAt: string | null;
    image: string;
    videoId: string;
    duration: string;
    contentHash: string;
  }>;
  nextCursor: string | null;
  warnings: string[];
  channelTitle?: string;
  queries?: string[];
};

async function parseError(res: Response) {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message || `요청 실패 (${res.status})`;
  } catch {
    return `요청 실패 (${res.status})`;
  }
}

export async function fetchIntegrationStatus(): Promise<IntegrationStatus> {
  try {
    const res = await fetch('/api/v1/integrations/status');
    if (!res.ok) throw new Error(await parseError(res));
    return (await res.json()) as IntegrationStatus;
  } catch {
    return {
      youtube: false,
      integrations: 'off',
      providers: { youtube: 'unavailable', rss: 'unavailable', llm: 'unavailable' },
    };
  }
}

function toContents(items: CollectedPayload['items'], fallbackSource: string): Content[] {
  const now = new Date().toISOString();
  return items.map((item) => ({
    id: crypto.randomUUID(),
    type: 'video' as const,
    title: item.title,
    titleKo: item.titleKo || '',
    url: item.url,
    description: item.description,
    source: item.source || fallbackSource,
    publishedAt: item.publishedAt,
    collectedAt: now,
    checkedAt: now,
    dataOrigin: 'live' as const,
    image: item.image || '',
    videoId: item.videoId,
    duration: item.duration || undefined,
    dedupKey: '',
    contentHash: item.contentHash,
  }));
}

export async function collectFromSource(source: Source, cursor: string | null = null): Promise<CollectedPayload> {
  const res = await fetch('/api/v1/integrations/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'channel',
      source: { id: source.id, name: source.name, url: source.url, type: source.type },
      cursor,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as CollectedPayload;
}

export async function collectTopics(keywords: string[] = [], cursor: string | null = null): Promise<CollectedPayload> {
  const res = await fetch('/api/v1/integrations/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'topics', keywords, cursor }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as CollectedPayload;
}

export async function ensureTopicSource(): Promise<Source> {
  const snap = await repository.snapshot();
  const existing = snap.sources.find((s) => s.id === TOPIC_SOURCE_ID || s.url === TOPIC_SOURCE_URL);
  if (existing) return existing;
  const source: Source = {
    id: TOPIC_SOURCE_ID,
    name: '주제 검색 · 액추에이터·컨트롤러·AI',
    url: TOPIC_SOURCE_URL,
    type: 'video',
    enabled: true,
    lastSuccessAt: null,
  };
  await repository.saveSource(source);
  return source;
}

export async function runYoutubeCollect(source: Source) {
  if (source.type !== 'video') throw new Error('YouTube 채널 출처만 수집할 수 있습니다.');
  if (!source.enabled) throw new Error('비활성화된 출처입니다.');

  const result = await collectFromSource(source);
  const contents = toContents(result.items, source.name);
  const report = await repository.ingestLiveCollection({
    sourceId: source.id,
    sourceName: result.channelTitle || source.name,
    contents,
    warnings: result.warnings,
  });

  return { ...report, warnings: result.warnings, nextCursor: result.nextCursor };
}

export async function runYoutubeTopicCollect(extraKeywords: string[] = []) {
  const source = await ensureTopicSource();
  const result = await collectTopics(extraKeywords);
  const contents = toContents(result.items, source.name);
  const report = await repository.ingestLiveCollection({
    sourceId: source.id,
    sourceName: result.channelTitle || source.name,
    contents,
    warnings: result.warnings,
    runLabel: 'YouTube 주제 검색',
  });
  return { ...report, warnings: result.warnings, queries: result.queries || [], nextCursor: result.nextCursor };
}
