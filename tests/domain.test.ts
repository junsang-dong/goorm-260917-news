import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalUrl, classify, dedup, defaults, filterItems, youtubeId, type Filters } from '../src/domain.ts';
import type { Item } from '../shared/schemas.ts';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'title'>): Item {
  return {
    dedupKey: partial.dedupKey || partial.url || partial.id,
    type: 'news',
    titleKo: '',
    url: 'https://example.com/' + partial.id,
    description: '',
    source: 'Test',
    publishedAt: '2026-09-17T03:00:00.000Z',
    collectedAt: '2026-09-17T04:00:00.000Z',
    checkedAt: '2026-09-17T04:00:00.000Z',
    dataOrigin: 'manual',
    image: '',
    contentHash: partial.id,
    bookmarked: false,
    ...partial,
  };
}

describe('URL 정규화와 중복 키', () => {
  it('추적 파라미터와 fragment만 제거하고 의미 있는 쿼리는 보존한다', () => {
    assert.equal(
      canonicalUrl('https://Example.com/path?b=2&utm_source=x&a=1#section'),
      'https://example.com/path?a=1&b=2',
    );
  });

  it('영상은 youtube:videoId, 뉴스는 정규화 URL을 dedupKey로 사용한다', () => {
    assert.equal(youtubeId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
    assert.equal(youtubeId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
    assert.equal(dedup('video', 'https://www.youtube.com/watch?v=abcdefghijk&utm_source=x'), 'youtube:abcdefghijk');
    assert.equal(dedup('news', 'https://news.example/a?utm_campaign=1'), 'https://news.example/a');
  });
});

describe('필터 AND/OR와 날짜 규칙', () => {
  const base: Item[] = [
    item({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Denmark actuator news',
      titleKo: '덴마크 액추에이터',
      source: 'Odense',
      publishedAt: '2026-09-16T12:00:00.000Z',
      analysis: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        contentId: '11111111-1111-4111-8111-111111111111',
        analysisKey: 'a',
        summary: '북유럽 협동로봇',
        products: ['actuator'],
        countries: ['DK'],
        topics: ['협동로봇'],
        score: 90,
        method: 'prepared',
        evidenceScope: 'metadata',
        reasons: [],
        facts: [],
        actions: [],
        unknowns: [],
        profileVersion: 1,
        status: 'completed',
      },
    }),
    item({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'German controller',
      titleKo: '독일 컨트롤러',
      publishedAt: '2026-08-01T12:00:00.000Z',
      analysis: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        contentId: '22222222-2222-4222-8222-222222222222',
        analysisKey: 'b',
        summary: '',
        products: ['controller'],
        countries: ['DE'],
        topics: ['산업용 로봇'],
        score: 50,
        method: 'rule_based',
        evidenceScope: 'metadata',
        reasons: [],
        facts: [],
        actions: [],
        unknowns: [],
        profileVersion: 1,
        status: 'completed',
      },
    }),
    item({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Unknown date item',
      publishedAt: null,
      analysis: {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        contentId: '33333333-3333-4333-8333-333333333333',
        analysisKey: 'c',
        summary: '',
        products: ['other'],
        countries: [],
        topics: ['산업 동향'],
        score: null,
        method: 'rule_based',
        evidenceScope: 'metadata',
        reasons: [],
        facts: [],
        actions: [],
        unknowns: [],
        profileVersion: 1,
        status: 'pending',
      },
    }),
  ];

  it('같은 필터는 OR, 다른 필터는 AND로 결합한다', () => {
    const f: Filters = { ...defaults, period: 'all', countries: ['DK', 'DE'], products: ['actuator'] };
    const result = filterItems(base, f, Date.parse('2026-09-17T12:00:00.000Z'));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, '11111111-1111-4111-8111-111111111111');
  });

  it('기간 필터에서 발행일 미상은 제외하고 전체에서는 포함한다', () => {
    const week = filterItems(base, { ...defaults, period: '7' }, Date.parse('2026-09-17T12:00:00.000Z'));
    assert.ok(week.every(i => i.publishedAt));
    const all = filterItems(base, { ...defaults, period: 'all' }, Date.parse('2026-09-17T12:00:00.000Z'));
    assert.ok(all.some(i => i.publishedAt === null));
  });

  it('서울 자정 기준으로 직접 기간을 적용한다', () => {
    const f: Filters = { ...defaults, period: 'custom', from: '2026-09-16', to: '2026-09-16' };
    const result = filterItems(base, f, Date.parse('2026-09-17T12:00:00.000Z'));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, '11111111-1111-4111-8111-111111111111');
  });

  it('제목·요약·출처를 부분 검색한다', () => {
    const result = filterItems(base, { ...defaults, period: 'all', q: '북유럽' }, Date.parse('2026-09-17T12:00:00.000Z'));
    assert.equal(result.length, 1);
  });
});

describe('규칙 기반 분류', () => {
  it('제품·국가 키워드로 관련도를 계산하고 AI 생성을 하지 않는다', () => {
    const analysis = classify(
      {
        id: '44444444-4444-4444-8444-444444444444',
        dedupKey: 'https://example.com/x',
        type: 'news',
        title: 'Denmark expands actuator procurement',
        titleKo: '덴마크 액추에이터 조달',
        url: 'https://example.com/x',
        description: '협동로봇용 actuator 파트너 모집',
        source: 'Test',
        publishedAt: null,
        collectedAt: '2026-09-17T00:00:00.000Z',
        checkedAt: '2026-09-17T00:00:00.000Z',
        dataOrigin: 'manual',
        image: '',
        contentHash: 'h',
      },
      1,
    );
    assert.equal(analysis.method, 'rule_based');
    assert.ok(analysis.products.includes('actuator'));
    assert.ok(analysis.countries.includes('DK'));
    assert.ok((analysis.score ?? 0) >= 70);
    assert.equal(analysis.actions.length, 0);
  });
});
