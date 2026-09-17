import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatIsoDuration, normalizeTopicQueries, parseYoutubeChannelRef } from '../server/youtube-collect.ts';

describe('YouTube 채널 URL 파싱', () => {
  it('@핸들·channel·user·c 경로를 구분한다', () => {
    assert.deepEqual(parseYoutubeChannelRef('https://www.youtube.com/@BostonDynamics'), { kind: 'handle', value: 'BostonDynamics' });
    assert.deepEqual(parseYoutubeChannelRef('https://www.youtube.com/channel/UCXXXXXXXXXXXXXXXXXXXXXX'), {
      kind: 'id',
      value: 'UCXXXXXXXXXXXXXXXXXXXXXX',
    });
    assert.deepEqual(parseYoutubeChannelRef('https://www.youtube.com/user/SomeUser'), { kind: 'user', value: 'SomeUser' });
    assert.deepEqual(parseYoutubeChannelRef('https://www.youtube.com/c/CustomName'), { kind: 'custom', value: 'CustomName' });
  });

  it('허용되지 않은 도메인은 거부한다', () => {
    assert.throws(() => parseYoutubeChannelRef('https://evil.example/@x'));
  });
});

describe('주제 검색어', () => {
  it('액추에이터·컨트롤러·AI 기본 쿼리를 포함하고 중복을 제거한다', () => {
    const q = normalizeTopicQueries(['actuator', 'AI', 'actuator']);
    assert.ok(q.includes('actuator'));
    assert.ok(q.includes('AI'));
    assert.ok(q.some((v) => /controller|컨트롤러/i.test(v)));
    assert.ok(q.some((v) => /artificial intelligence|인공지능|AI robotics/i.test(v)));
    assert.equal(q.filter((v) => v === 'actuator').length, 1);
  });
});

describe('영상 길이 포맷', () => {
  it('ISO 8601 duration을 표시 형식으로 변환한다', () => {
    assert.equal(formatIsoDuration('PT1H2M3S'), '1:02:03');
    assert.equal(formatIsoDuration('PT8M32S'), '8:32');
    assert.equal(formatIsoDuration('PT45S'), '0:45');
  });
});
