const YT_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be']);
const API = 'https://www.googleapis.com/youtube/v3';

/** BCR 사업·관심 주제 기본 검색어 (채널 업로드만으로는 관련 자료가 적을 때 보완) */
export const DEFAULT_TOPIC_QUERIES = [
  'robot actuator',
  'robot controller',
  '액추에이터 로봇',
  '컨트롤러 로봇',
  'AI robotics',
  'artificial intelligence robot',
  '인공지능 로봇',
  'humanoid actuator',
  'collaborative robot controller',
] as const;

export type CollectSourceInput = {
  id: string;
  name: string;
  url: string;
  type: 'news' | 'video';
};

export type CollectedItem = {
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
  viewCount: number;
  contentHash: string;
};

export type CollectResult = {
  items: CollectedItem[];
  nextCursor: string | null;
  warnings: string[];
  channelTitle?: string;
  queries?: string[];
};

export function getYoutubeStatus() {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  return {
    youtube: Boolean(key),
    integrations: Boolean(key) ? 'server' : 'off',
    providers: {
      youtube: key ? 'configured' : 'missing',
      rss: 'unavailable',
      llm: 'unavailable',
    },
    topicQueries: [...DEFAULT_TOPIC_QUERIES],
  };
}

export function assertYoutubeAllowlist(urlString: string) {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error('올바른 YouTube URL이 아닙니다.');
  }
  if (!/^https?:$/i.test(u.protocol) || !YT_HOSTS.has(u.hostname)) {
    throw new Error('허용된 YouTube 도메인만 수집할 수 있습니다.');
  }
  return u;
}

export function parseYoutubeChannelRef(urlString: string):
  | { kind: 'id'; value: string }
  | { kind: 'handle'; value: string }
  | { kind: 'user'; value: string }
  | { kind: 'custom'; value: string }
  | null {
  const u = assertYoutubeAllowlist(urlString);
  if (u.hostname === 'youtu.be') return null;
  const channel = u.pathname.match(/^\/channel\/(UC[\w-]{22})/);
  if (channel) return { kind: 'id', value: channel[1] };
  const handle = u.pathname.match(/^\/@([\w.-]+)/);
  if (handle) return { kind: 'handle', value: handle[1] };
  const user = u.pathname.match(/^\/user\/([\w.-]+)/);
  if (user) return { kind: 'user', value: user[1] };
  const custom = u.pathname.match(/^\/c\/([\w.-]+)/);
  if (custom) return { kind: 'custom', value: custom[1] };
  return null;
}

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error('YouTube API 키가 설정되지 않았습니다. .env의 YOUTUBE_API_KEY를 확인하세요.');
  return key;
}

async function ytGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', apiKey());
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json()) as T & { error?: { message?: string; errors?: { reason?: string }[] } };
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    const msg = data.error?.message || `YouTube API 오류 (${res.status})`;
    if (res.status === 403 && reason === 'quotaExceeded') throw new Error('YouTube API 일일 할당량을 초과했습니다. 잠시 후 다시 시도하세요.');
    if (res.status === 400 || res.status === 403) throw new Error(msg);
    throw new Error(msg);
  }
  return data;
}

export function formatIsoDuration(iso?: string) {
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const sec = Number(m[3] || 0);
  if (h) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function normalizeTopicQueries(input?: string[]) {
  const merged = [...(input || []), ...DEFAULT_TOPIC_QUERIES]
    .map((q) => q.trim().slice(0, 80))
    .filter(Boolean);
  return [...new Set(merged)].slice(0, 12);
}

type ChannelList = {
  items?: {
    id: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
};

type PlaylistItems = {
  nextPageToken?: string;
  items?: {
    contentDetails?: { videoId?: string };
    snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
  }[];
};

type VideosList = {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string };
  }[];
};

type SearchList = {
  nextPageToken?: string;
  items?: {
    id?: { channelId?: string; videoId?: string };
    snippet?: { title?: string; channelTitle?: string };
  }[];
};

async function resolveChannel(ref: NonNullable<ReturnType<typeof parseYoutubeChannelRef>>) {
  if (ref.kind === 'id') {
    const data = await ytGet<ChannelList>('channels', { part: 'snippet,contentDetails', id: ref.value });
    return data.items?.[0] || null;
  }
  if (ref.kind === 'handle') {
    const data = await ytGet<ChannelList>('channels', { part: 'snippet,contentDetails', forHandle: ref.value });
    if (data.items?.[0]) return data.items[0];
  }
  if (ref.kind === 'user') {
    const data = await ytGet<ChannelList>('channels', { part: 'snippet,contentDetails', forUsername: ref.value });
    if (data.items?.[0]) return data.items[0];
  }
  const q = ref.kind === 'handle' ? `@${ref.value}` : ref.value;
  const search = await ytGet<SearchList>('search', { part: 'snippet', type: 'channel', q, maxResults: '1' });
  const channelId = search.items?.[0]?.id?.channelId;
  if (!channelId) return null;
  const data = await ytGet<ChannelList>('channels', { part: 'snippet,contentDetails', id: channelId });
  return data.items?.[0] || null;
}

function pickThumb(thumbs?: Record<string, { url?: string }>) {
  return thumbs?.maxres?.url || thumbs?.standard?.url || thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || '';
}

async function fetchVideoDetails(videoIds: string[]): Promise<CollectedItem[]> {
  const unique = [...new Set(videoIds.filter((id) => /^[\w-]{11}$/.test(id)))].slice(0, 20);
  if (!unique.length) return [];
  const videos = await ytGet<VideosList>('videos', {
    part: 'snippet,contentDetails,statistics',
    id: unique.join(','),
  });
  return (videos.items || []).map((v) => {
    const title = (v.snippet?.title || 'Untitled').slice(0, 500);
    const description = (v.snippet?.description || '').slice(0, 20000);
    const publishedAt = v.snippet?.publishedAt || null;
    const image = pickThumb(v.snippet?.thumbnails);
    return {
      type: 'video' as const,
      title,
      titleKo: '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      description,
      source: (v.snippet?.channelTitle || 'YouTube').slice(0, 150),
      publishedAt,
      image: image && /^https?:\/\//i.test(image) ? image : '',
      videoId: v.id,
      duration: formatIsoDuration(v.contentDetails?.duration),
      viewCount: Math.max(0, Number(v.statistics?.viewCount || 0)),
      contentHash: `yt:${v.id}:${publishedAt || 'na'}`,
    };
  });
}

async function searchVideoIds(query: string, opts: { maxResults: number; channelId?: string; pageToken?: string | null }) {
  const params: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(Math.min(20, Math.max(1, opts.maxResults))),
    order: 'date',
    safeSearch: 'none',
  };
  if (opts.channelId) params.channelId = opts.channelId;
  if (opts.pageToken) params.pageToken = opts.pageToken;
  const search = await ytGet<SearchList>('search', params);
  const ids = (search.items || [])
    .map((i) => i.id?.videoId)
    .filter((id): id is string => Boolean(id && /^[\w-]{11}$/.test(id)));
  return { ids, nextPageToken: search.nextPageToken || null };
}

/** 액추에이터·컨트롤러·AI 등 주제 키워드로 전역 검색 */
export async function collectYoutubeTopics(input?: { keywords?: string[]; cursor?: string | null }): Promise<CollectResult> {
  const queries = normalizeTopicQueries(input?.keywords);
  const warnings: string[] = [];
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  // cursor = "queryIndex:pageToken" 형태. 없으면 첫 쿼리부터.
  let startIndex = 0;
  let pageToken: string | null = null;
  if (input?.cursor) {
    const [idx, ...rest] = input.cursor.split(':');
    startIndex = Number(idx) || 0;
    pageToken = rest.join(':') || null;
  }

  for (let i = startIndex; i < queries.length && orderedIds.length < 20; i++) {
    const q = queries[i];
    try {
      const perQuery = Math.min(8, 20 - orderedIds.length);
      const { ids, nextPageToken } = await searchVideoIds(q, {
        maxResults: perQuery,
        pageToken: i === startIndex ? pageToken : null,
      });
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        orderedIds.push(id);
        if (orderedIds.length >= 20) break;
      }
      if (orderedIds.length >= 20 && nextPageToken) {
        return {
          items: await fetchVideoDetails(orderedIds),
          nextCursor: `${i}:${nextPageToken}`,
          warnings,
          queries,
          channelTitle: '주제 검색 (액추에이터·컨트롤러·AI)',
        };
      }
    } catch (e) {
      warnings.push(`「${q}」 검색 실패: ${e instanceof Error ? e.message : '오류'}`);
    }
  }

  const items = await fetchVideoDetails(orderedIds);
  if (!items.length) warnings.push('주제 키워드로 수집된 영상이 없습니다. 검색어나 API 할당량을 확인해 주세요.');
  return {
    items,
    nextCursor: null,
    warnings,
    queries,
    channelTitle: '주제 검색 (액추에이터·컨트롤러·AI)',
  };
}

export async function collectYoutubeSource(source: CollectSourceInput, cursor: string | null): Promise<CollectResult> {
  const warnings: string[] = [];
  if (source.type !== 'video') {
    return { items: [], nextCursor: null, warnings: ['뉴스·RSS 수집은 아직 연결되지 않았습니다. YouTube 채널 출처만 수집할 수 있습니다.'] };
  }

  assertYoutubeAllowlist(source.url);
  const ref = parseYoutubeChannelRef(source.url);
  if (!ref) {
    throw new Error('YouTube 채널 URL(@핸들, /channel/, /c/, /user/)만 수집할 수 있습니다. 개별 영상 URL은 자료 추가를 이용해 주세요.');
  }

  const channel = await resolveChannel(ref);
  if (!channel?.id) throw new Error('채널을 찾지 못했습니다. URL과 API 키 권한을 확인해 주세요.');
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('채널 업로드 재생목록을 확인할 수 없습니다.');

  const preferredIds: string[] = [];
  const seen = new Set<string>();

  // 1) 오래된 영상도 포함해 채널 조회수 순 인기 영상 우선
  try {
    const popular = await ytGet<SearchList>('search', {
      part: 'snippet',
      type: 'video',
      channelId: channel.id,
      order: 'viewCount',
      maxResults: '12',
      safeSearch: 'none',
    });
    for (const row of popular.items || []) {
      const id = row.id?.videoId;
      if (!id || !/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      preferredIds.push(id);
    }
  } catch (e) {
    warnings.push(`인기 영상 검색 실패: ${e instanceof Error ? e.message : '오류'}`);
  }

  // 2) 최근 업로드로 보완 (최대 20)
  const playlistParams: Record<string, string> = {
    part: 'snippet,contentDetails',
    playlistId: uploads,
    maxResults: '20',
  };
  if (cursor) playlistParams.pageToken = cursor;
  const playlist = await ytGet<PlaylistItems>('playlistItems', playlistParams);
  for (const row of playlist.items || []) {
    const id = row.contentDetails?.videoId;
    if (!id || !/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    preferredIds.push(id);
    if (preferredIds.length >= 20) break;
  }

  if (!preferredIds.length) {
    return {
      items: [],
      nextCursor: playlist.nextPageToken || null,
      warnings: ['수집할 영상이 없습니다.'],
      channelTitle: channel.snippet?.title,
      queries: ['채널 인기 영상 · 조회수 순', '최근 업로드 보완'],
    };
  }

  const items = (await fetchVideoDetails(preferredIds.slice(0, 20)))
    .sort((a, b) => b.viewCount - a.viewCount || Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));
  for (const item of items) item.source = (channel.snippet?.title || source.name).slice(0, 150);

  if (items.length < preferredIds.length) warnings.push('일부 영상 상세 정보를 가져오지 못했습니다.');

  return {
    items,
    nextCursor: playlist.nextPageToken || null,
    warnings,
    channelTitle: channel.snippet?.title,
    queries: ['채널 인기 영상 · 조회수 순', '최근 업로드 보완'],
  };
}
