import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import { RadarRepository, RadarError } from '../src/repository.ts';
import type { Backup } from '../shared/schemas.ts';

const dbName = 'bcr-test-' + crypto.randomUUID();

describe('IndexedDB Repository', () => {
  let repo: RadarRepository;

  beforeEach(async () => {
    repo = new RadarRepository(dbName, true);
    await repo.initialize();
  });

  afterEach(async () => {
    await repo.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  it('최초 실행 시 샘플을 한 번만 삽입한다', async () => {
    const first = await repo.snapshot();
    assert.ok(first.contents.length >= 8);
    assert.equal(first.contents.filter(c => c.contentHash.startsWith('c46-reference-')).length, 30);
    assert.ok(first.sources.length >= 30);
    await repo.close();
    repo = new RadarRepository(dbName, true);
    await repo.initialize();
    const second = await repo.snapshot();
    assert.equal(second.contents.length, first.contents.length);
  });

  it('같은 URL을 두 번 등록해도 중복 콘텐츠를 만들지 않는다', async () => {
    const now = new Date().toISOString();
    const input = {
      id: crypto.randomUUID(),
      type: 'news' as const,
      title: 'Unique title',
      titleKo: '고유 제목',
      url: 'https://example.com/article?utm_source=test',
      description: 'actuator controller Denmark',
      source: 'Manual Source',
      publishedAt: now,
      collectedAt: now,
      checkedAt: now,
      dataOrigin: 'manual' as const,
      image: '',
      dedupKey: '',
      contentHash: crypto.randomUUID(),
    };
    const id1 = await repo.upsertContent(input, '수동 요약');
    const id2 = await repo.upsertContent({ ...input, id: crypto.randomUUID(), title: 'Other' }, '다른 요약');
    assert.equal(id1, id2);
    const snap = await repo.snapshot();
    assert.equal(snap.contents.filter(c => c.url.includes('example.com/article')).length, 1);
  });

  it('메모 버전 충돌을 감지하고 입력 유실 없이 오류를 반환한다', async () => {
    const content = (await repo.snapshot()).contents[0];
    await repo.saveNote(content.id, '첫 메모', 0);
    await assert.rejects(() => repo.saveNote(content.id, '충돌 메모', 0), (e: unknown) => {
      assert.ok(e instanceof RadarError);
      assert.equal(e.code, 'VERSION_CONFLICT');
      return true;
    });
    const note = (await repo.snapshot()).notes.find(n => n.contentId === content.id);
    assert.equal(note?.body, '첫 메모');
  });

  it('JSON 내보내기 후 빈 저장소에 복원하면 자료가 일치한다', async () => {
    const content = (await repo.snapshot()).contents[0];
    await repo.setBookmark(content.id, true);
    await repo.saveNote(content.id, '영업 메모', 0);
    const backup = await repo.exportWorkspace();
    await repo.reset();
    assert.equal((await repo.snapshot()).contents.length, 0);
    await repo.importWorkspace(backup, 'replace');
    const restored = await repo.snapshot();
    assert.equal(restored.contents.length, backup.contents.length);
    assert.equal(restored.bookmarks.length, 1);
    assert.equal(restored.notes[0]?.body, '영업 메모');
    assert.ok(restored.companyProfiles.length >= 1);
  });

  it('같은 자료를 병합 가져오기하면 중복 없이 관계를 매핑한다', async () => {
    const backup = await repo.exportWorkspace();
    const before = (await repo.snapshot()).contents.length;
    await repo.importWorkspace(backup, 'merge');
    const after = await repo.snapshot();
    assert.equal(after.contents.length, before);
  });

  it('손상된 JSON과 상위 schemaVersion은 거부하고 원 데이터를 보존한다', async () => {
    const before = await repo.snapshot();
    await assert.rejects(() => repo.previewImport({ app: 'bcr-robotics-radar', schemaVersion: 99 }));
    await assert.rejects(() => repo.importWorkspace({ ...before, schemaVersion: 99 } as unknown as Backup, 'merge'));
    const after = await repo.snapshot();
    assert.equal(after.contents.length, before.contents.length);
  });
});
