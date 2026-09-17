# BCR Robotics Radar 기술 명세서

- 개정 버전: 1.1 · 작성일: 2026-09-17
- 대상: 블루 클라우드 로보틱스 북유럽 세일즈 5년차 심수정 매니저
- 프런트엔드: React / Vite / TypeScript
- 기본 MVP: 외부 DB·인증 없이 IndexedDB + localStorage 사용
- 후속 클라우드: Neon PostgreSQL + Firebase Authentication의 Google 로그인
- 이 문서는 v1.0의 DB·인증·수집 실행·권한 설계를 대체한다. 문서 파일의 기존 이름은 버전 이력 유지를 위해 유지한다.

## 1. 목표와 확정 변경 사항

글로벌 로봇 부품·산업 뉴스와 유튜브를 한곳에서 탐색하고, 회사의 액추에이터·컨트롤러 사업과 관련 있는 자료를 저장·메모하는 미디어 허브다.

기본 흐름: 앱 열기 → 로컬 자료 조회 → 국가·제품 필터 → 요약·원문 확인 → 저장·메모 → 브라우저 재실행 후 복원.

| 항목 | 기본 MVP | 후속 클라우드 확장 |
|---|---|---|
| 데이터 | 브라우저 IndexedDB | Neon PostgreSQL |
| UI 설정 | localStorage | localStorage, 필요 시 계정 설정 동기화 |
| 로그인 | 없음, 즉시 사용 | Firebase Google 로그인 |
| 사용자 | 동일 origin·브라우저 프로필의 단일 작업공간 | Firebase UID 기반 계정 |
| 개인 자료 | 해당 브라우저에 저장 | 서버가 소유자 검증 후 Neon 저장 |
| 자료 입력 | 샘플·JSON 가져오기·수동 입력 | 서버 RSS·YouTube 수집 추가 |
| 분석 | 사전 작성 요약·수동 요약·규칙 기반 분류 | 서버 LLM 요약·분석 |
| 실시간 연결 | 선택적 서버 프록시로 확장 가능 | 인증된 서버 API |
| 자동 수집 | 앱이 열린 동안 선택적 갱신만 | Cron + 서버 작업 큐 |
| 백업 | JSON 내보내기·복원 필수 | DB 운영 백업 + JSON 내보내기 |

외부 DB·인증을 제거한다고 비밀 API 키까지 브라우저에 옮기지 않는다. 기본 MVP는 키 없이 실행 가능하게 완성하며, 실제 최신 수집·AI 생성은 별도 연결 단계로 구분한다. 연결 전에는 ‘실시간 수집’ 또는 ‘AI 생성 완료’를 표시하지 않는다.

## 2. 구현 단계와 기능 범위

### 2.1 단계 A — 기본 로컬 MVP: 이번 구현의 필수 범위

- 로그인 없는 통합 피드, 검색·기간·국가·제품·유형 필터, 상세 패널.
- IndexedDB 콘텐츠·분석 결과·북마크·메모·회사 설명·출처 설정 저장.
- localStorage 테마·최근 필터·레이아웃 설정 저장.
- 샘플 데이터 초기화, 수동 뉴스·영상 등록, 검증된 JSON 파일 가져오기.
- 한국어 요약 표시·수동 작성, 규칙 기반 태그·관련도 제공. 생성형 AI를 실행한 것으로 표현하지 않는다.
- JSON 백업·복원, 저장 용량·오류·스키마 업그레이드 처리.
- 앱 화면·로컬 기능은 외부 API·Neon·Firebase 설정 없이 동작해야 한다.

### 2.2 단계 B — 선택적 실시간 연결: 로컬 저장 유지

Vercel Functions 등 서버 프록시로 RSS·YouTube·LLM을 연결한다. 콘텐츠와 개인 메모는 계속 IndexedDB에 저장하고 프록시는 영속 DB를 사용하지 않는다. 네트워크 응답을 받은 브라우저가 검증·저장한다. 프록시가 없으면 단계 A로 명확하게 동작한다.

이 단계의 무인증 유료 엔드포인트는 공개 배포하지 않는다. 개인 개발 서버 또는 접근이 제한된 배포에서 사용하고, 공개 운영은 단계 C의 인증·서버 사용량 제한 적용 후 진행한다. CORS나 UI 버튼 숨김은 인증을 대신하지 않는다.

### 2.3 단계 C — 클라우드 확장: 이번 로컬 MVP의 완료 조건 아님

Neon PostgreSQL, Firebase Google 로그인, 서버 권한 검사, 계정별 저장·메모, 정기 수집·AI 분석, 로컬 데이터의 명시적 가져오기를 구현한다. 다기기 동기화는 이 단계에서 제공한다. 주간 브리핑·공유 컬렉션·댓글·이메일 알림은 그 이후다.

## 3. 로컬 사용자와 저장 경계

- 첫 실행 시 IndexedDB에 UUID localWorkspaceId와 표시 이름 ‘심수정’을 생성한다. 이는 인증 정보가 아니라 로컬 데이터 구분자다.
- 로그인·회원가입·관리자 역할 선택 화면은 단계 A에서 노출하지 않는다. 설정은 로컬 사용자가 수정한다.
- 동일 브라우저 프로필과 동일 origin 사용자는 같은 자료를 볼 수 있다. 사용자 간 보안 격리가 있다고 표현하지 않는다.
- 개발 localhost, 미리보기 도메인, 운영 도메인은 별도 저장소다. 데이터 이동은 JSON 백업으로 수행한다.
- 브라우저 데이터 삭제·시크릿 모드 종료·저장소 정리 등에 의해 자료가 사라질 수 있다. 설정 화면에 간결하게 안내하고 내보내기 버튼을 제공한다.
- 저장소 접근 불가 시 메모리 모드로 조용히 전환하지 않는다. ‘저장소를 사용할 수 없음’을 표시하고 복원·환경 안내를 제공한다.

## 4. 화면과 상호작용

| 경로 | 화면 | 기본 MVP 동작 |
|---|---|---|
| /radar | 오늘의 동향 | 로그인 없이 진입, 최근 7일 기본 |
| /radar?type=news 또는 video | 유형별 피드 | 뉴스·영상 필터 |
| /contents/:id | 상세 | 직접 URL·원문·요약·저장·메모 |
| /saved | 저장한 자료 | 로컬 북마크·메모 탐색 |
| /settings/sources | 출처 | 출처 등록·연결 상태, 미연결 출처는 수집 불가 표시 |
| /settings/company | 회사 설명 | 제품·관심 시장·설명 버전 |
| /settings/data | 데이터 관리 | 가져오기·내보내기·용량·초기화 |
| /settings/runs | 처리 기록 | 가져오기 및 선택적 수집·분석 결과 |
| /login | 클라우드 로그인 | 단계 C에서만 Google 로그인 표시 |

상단에 ‘로컬 모드 · 이 브라우저에 저장’을 표시한다. 데모 자료는 ‘샘플’ 배지, 실제 가져온 자료는 수집 기준 시각을 표시한다. 오래된 샘플의 날짜를 오늘로 변경하지 않으며 결과가 없으면 ‘샘플 전체 보기’를 제공한다.

### 4.1 레이아웃

- 1280px 이상: 왼쪽 메뉴 216px, 유동 피드, 선택 시 오른쪽 상세 380px.
- 768~1279px: 메뉴 축소, 피드 2열, 상세는 오버레이 패널.
- 767px 이하: 단일 열 카드, 메뉴 드로어, 상세 독립 화면, 필터 바텀시트.
- 최소 지원 폭 360px. 텍스트 확대 시 가로 스크롤이 발생하지 않아야 한다.
- 기본 한국어 UI, 원문 제목 병기, 흰 배경·네이비 텍스트·블루 강조. 상태는 색상과 글자를 함께 표시한다.
- 키보드 탐색, 명시적 폼 라벨, 모달 초점 이동·복원, ESC 닫기, 클릭 영역 44px 이상을 적용한다.

### 4.2 카드와 상세

카드: 자료 유형, 썸네일(없으면 대체 이미지), 한국어 제목/원제, 출처, 발행일, 3줄 이내 요약, 제품·지역 태그, 관련도, 저장 버튼. 영상은 채널·재생 시간을 추가한다.

상세: 원문 링크, 발행일·최초 수집일·최근 확인일, 요약 근거 범위, 확인된 사실, 회사 관련 이유, AI 제안, 미확인 정보, 개인 메모. 영상 임베드는 사용자 클릭 시 로드하고 불가하면 YouTube에서 보기로 대체한다.

메모는 명시적 ‘저장’ 버튼으로 저장하며 성공 표시를 제공한다. 미저장 상태에서 이동하면 이탈 확인을 제공한다. 최대 5,000자, 일반 텍스트로 렌더링한다.

### 4.3 검색과 필터 규칙

- q: 원제·한국어 제목·요약·출처명 대상 부분 검색. 입력 300ms 디바운스, 최대 100자.
- 필터: 유형, 기간(24시간/7일/30일/전체/직접 지정), 제품, 주제, 국가, 관련도, 분석 상태.
- 같은 필터의 여러 선택은 OR, 서로 다른 필터는 AND.
- 국가는 기사에 등장하는 시장·기업 소재지에 근거한다. 언어·YouTube regionCode를 기업 소재지로 해석하지 않는다.
- 일시는 UTC 저장, Asia/Seoul 표시. 직접 기간은 서울 자정 이상~종료일 다음날 자정 미만으로 UTC 변환한다.
- 발행일 미상은 기간 필터에서 제외하며 ‘전체’에서 발행일 미상 배지와 함께 표시한다.
- 최신순은 published_at DESC NULLS LAST, id DESC. 관련도순은 score DESC NULLS LAST, published_at DESC NULLS LAST, id DESC.
- 페이지당 20건, Repository 조회 최대 50건. 다음 커서에는 정렬값과 ID를 포함한다. 필터 변경 시 커서를 초기화하고 URL 쿼리에 조건을 보존한다.

### 4.4 상태 처리

로딩 스켈레톤, 빈 결과와 필터 초기화, API 오류와 재시도, 분석 대기·실패, 일부 출처 실패를 별도로 표시한다. 수집 실패 시 기존 콘텐츠를 유지한다. ‘최근 수집 성공’은 실제 성공 시각이며 화면 조회 시각으로 덮어쓰지 않는다.

## 5. 기술 구조와 어댑터

| 계층 | 기본 MVP | 후속 옵션 |
|---|---|---|
| UI | React, TypeScript, React Router, Tailwind CSS | 동일 |
| 비동기 조회 | TanStack Query + Repository | HTTP Repository로 교체 |
| 데이터 저장 | IndexedDB, idb 래퍼 | Neon PostgreSQL |
| 입력 검증 | Zod | 서버에도 동일 계약 적용 |
| 인증 | NoAuthAdapter | FirebaseGoogleAuthAdapter |
| 콘텐츠 입력 | Sample/Manual/JsonImportAdapter | ServerCollectionAdapter |
| 분석 | PreparedSummary/Manual/RuleBasedAdapter | ServerLLMAdapter |
| 배포 | 정적 Vite 빌드 | Vercel Functions·Cron 추가 |

UI가 IndexedDB나 SQL을 직접 호출하지 않는다. UI → 서비스 → Repository → 저장소 구조를 사용한다. 클라우드 인증 SDK도 모드별 어댑터 안에서만 초기화한다. 기본 모드에서 Firebase·Neon 연결을 시도하지 않는다.

```ts
type AppMode = 'local' | 'cloud';
type IntegrationMode = 'off' | 'server';
interface RadarRepository {
  listContents(query: ContentQuery): Promise<ContentPage>;
  getContent(id: string): Promise<ContentDetail | null>;
  upsertContent(input: ContentInput): Promise<string>;
  setBookmark(contentId: string, saved: boolean): Promise<void>;
  saveNote(contentId: string, body: string, expectedVersion: number): Promise<Note>;
  exportWorkspace(): Promise<BackupV1>;
  importWorkspace(backup: BackupV1, mode: 'merge' | 'replace'): Promise<ImportReport>;
}
```

계약에 필요한 타입은 shared/schemas에서 정의한다. 오류 코드는 VALIDATION_ERROR, NOT_FOUND, VERSION_CONFLICT, STORAGE_UNAVAILABLE, QUOTA_EXCEEDED, INTEGRATION_UNAVAILABLE를 공통 사용한다. 로컬 CRUD는 HTTP 요청 없이 Promise 기반 함수로 동작한다.

## 6. 로컬 데이터베이스와 백업

### 6.1 IndexedDB

DB 이름 bcr-robotics-radar, 최초 스키마 버전 1. 모든 ID는 UUID 문자열, 날짜는 UTC ISO 8601 문자열이다. 데이터에 JSON 객체·배열을 사용하며 SQL 타입이나 자동 FK를 가정하지 않는다.

| Object store | 키·인덱스 | 저장 내용 |
|---|---|---|
| workspaces | id | localWorkspaceId, displayName, createdAt |
| contents | id; unique dedupKey; publishedAt,type | 원제·URL·설명·발행일·수집일·영상 ID·썸네일 URL·contentHash·dataOrigin |
| contentSources | [contentId,sourceId] | 자료와 출처 연결 |
| analyses | id; unique analysisKey; contentId | 요약·근거 범위·관련도·방법·회사 버전·상태 |
| bookmarks | [workspaceId,contentId]; workspaceId | 저장 시각 |
| notes | [workspaceId,contentId]; workspaceId | body 최대 5000자, version, updatedAt |
| sources | id | 유형·URL·채널 ID·키워드·연결 상태·최근 성공 시각 |
| companyProfiles | version | 제품 설명·관심 국가·작성 시각, 버전 불변 |
| runs | id; startedAt | import/collect/analyze, 건수·성공·부분 실패·오류 |
| meta | key | seedVersion, currentProfileVersion, lastBackupAt, migration 정보 |

content.dataOrigin은 sample/imported/manual/live로 구분한다. analyses.method는 prepared/manual/rule_based/llm이다. 뉴스 dedupKey는 정규화 URL 해시, 영상은 youtube:videoId. fragment·알려진 추적 파라미터만 제거하고 의미 있는 쿼리는 보존한다.

중복 제거와 연결 갱신은 readwrite transaction에서 처리한다. IndexedDB에는 FK가 없으므로 Repository가 참조 존재를 검증한다. 콘텐츠 삭제 시 분석·연결·북마크·메모를 같은 트랜잭션에서 정리하되 사용자가 저장/메모한 자료의 자동 삭제는 금지한다. 북마크 해제는 메모를 삭제하지 않는다.

메모 저장은 한 트랜잭션에서 기존 version을 읽고 expectedVersion과 비교한다. 최초 저장은 0, 이후 1씩 증가. 다중 탭 충돌은 VERSION_CONFLICT로 반환하고 작성 중 내용을 보존한다. BroadcastChannel로 변경을 알리고 미지원 시 창 focus에 재조회한다. 알림은 잠금을 대신하지 않는다.

### 6.2 localStorage

bcr:ui:v1 키에 schemaVersion, theme, layout, lastFilters만 저장한다. 파싱 실패 시 기본 UI 설정으로 복구하되 IndexedDB는 건드리지 않는다. 콘텐츠·메모·토큰·API 키·DB 비밀번호는 넣지 않는다. 필수 workspace ID는 IndexedDB가 기준이다.

### 6.3 용량·마이그레이션

navigator.storage.estimate()로 가능한 경우 사용량을 표시하고 persist() 지원 시 영속 저장을 요청할 수 있다. 승인 여부와 무관하게 백업을 제공한다. QuotaExceededError 시 쓰기 실패를 명확히 표시하고 내보내기·미저장 캐시 정리를 제공한다. 저장 성공은 transaction complete 이후에만 표시한다.

IndexedDB 저장은 origin 단위이며 브라우저 용량 정책·삭제 조건을 따른다. 영구 보존을 보장하지 않는다. [MDN 저장 용량 문서](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

DB versionchange migration은 트랜잭션으로 수행한다. 이전 탭이 막으면 탭 닫기·새로고침 안내를 제공한다. 실패 시 자동 DB 삭제를 하지 않는다. 비디오 파일·대용량 이미지 바이너리를 저장하지 않고 메타데이터와 URL을 저장한다.

### 6.4 JSON 내보내기와 복원

형식: {app:'bcr-robotics-radar',schemaVersion:1,exportedAt,workspace,contents,contentSources,analyses,bookmarks,notes,sources,companyProfiles}. 자격증명·실행 중 잠금·캐시 토큰은 내보내지 않는다. 초기 입력 한도 10MB·콘텐츠 5000건으로 설정한다.

1. 파일 크기·JSON·버전·필드 길이·URL·참조 관계를 검증한다. 미지원 상위 버전은 거부한다.
2. 미리보기에서 신규·중복·충돌 건수를 보여주고 merge 또는 replace를 선택한다.
3. merge는 dedupKey로 콘텐츠 ID를 매핑하고 모든 자식 참조를 재매핑한다. 기존 메모와 다르면 사용자가 선택하기 전까지 적용하지 않는다.
4. replace는 현재 백업 다운로드를 먼저 제안하고 명시적 확인 후 적용한다. 해당 앱의 저장소만 대상으로 한다.
5. 입력 전체 검증 후 관련 store를 하나의 readwrite transaction으로 변경한다. 중도 오류·용량 초과 시 전체 롤백한다.
6. 성공 후 건수와 실제 완료 시각을 기록한다. 가져온 workspaceId는 현재 로컬 workspace로 매핑한다.

최초 샘플 삽입은 빈 DB에서 한번만 실행하고 seedVersion을 기록한다. 빈 결과나 API 오류를 샘플 재삽입 조건으로 사용하지 않는다.

## 7. 분석 계약

### 7.1 입력과 출력

입력: 원제, 출처, 발행일, 확보한 텍스트, 근거 범위, 회사 설명 버전, 제품 목록, 관심 국가. 원문은 분석할 데이터이며 원문에 포함된 명령은 실행하지 않는다. LLM에 브라우징·도구 실행 권한을 주지 않는다.

```ts
type AnalysisResult = {
  titleKo: string;
  summaryKo: string[]; // 최대 3개
  evidenceScope: 'metadata' | 'feed_excerpt' | 'full_text' | 'transcript';
  topics: string[];
  products: ('actuator' | 'controller' | 'other')[];
  countries: string[]; // 근거 있는 ISO 국가 코드만, 없으면 []
  facts: { text: string; evidence: string }[];
  relevance: {
    product: 0 | 20 | 40;
    market: 0 | 10 | 20;
    useCase: 0 | 10 | 20;
    businessSignal: 0 | 10 | 20;
    reasons: string[];
  };
  suggestedActions: string[]; // 최대 3개, 제안임을 명시
  unknowns: string[];
};
```

분석 어댑터는 Zod로 필드·배열 길이·enum을 검증한다. evidence는 입력에 존재하는 짧은 근거 조각인지 확인하고 불일치 결과는 저장하지 않는다. JSON 오류는 한 번 교정 요청하고 다시 실패하면 failed로 기록한다. 과도하게 긴 입력은 제한된 길이로 자르고 input_truncated=true를 기록하여 요약 범위를 표시한다.

### 7.2 관련도

총점은 공통 도메인 함수가 4개 요소를 합산한다. 70~100 높음, 40~69 보통, 0~39 낮음. 분석 미완료는 null이며 낮음과 구분한다.

| 요소 | 기준 |
|---|---|
| 제품 0/20/40 | 무관 / 간접 연관 / 액추에이터·컨트롤러 직접 언급 |
| 시장 0/10/20 | 불명·비대상 / 기타 유럽 / 북유럽 대상 국가 |
| 적용 0/10/20 | 불명 / 일반 로봇 적용 / 회사 제품 용도와 명확한 연결 |
| 사업 신호 0/10/20 | 없음 / 일반 발표 / 명시적 생산 확대·조달·파트너 모집 등 |

점수는 열람 우선순위이며 수주 확률이 아니다. 기사에 제품 사양·구매 의향·공급 관계가 없으면 추정하지 않는다. 초기 회사 정보가 제품 종류뿐이면 구체적 성능 적합성 판단은 unknowns에 남긴다.

### 7.3 분석 버전과 재실행

content_id + content_hash + company_profile_version + prompt_version + model_id에 고유 제약을 적용한다. 새 버전 분석 성공 전까지 이전 성공 결과를 제공하되 outdated 배지를 표시한다. active_analysis_id 갱신은 동일 콘텐츠의 유효한 최신 작업인지 확인 후 원자적으로 수행한다. 실패가 기존 성공 결과를 덮어쓰지 않는다.


### 7.4 로컬 모드 분석 동작

위 LLM 계약은 단계 B/C 연결 시 적용한다. 단계 A에서는 동일한 결과 표시 컴포넌트에 prepared 또는 manual 요약을 전달하고 방법을 명시한다. 자동 번역·새 요약 생성 버튼은 ‘AI 연결 필요’ 상태로 둔다.

규칙 기반 분석은 고정 사전의 제품·국가 키워드 일치와 근거 문장을 제공한다. LLM 관련도와 구분해 ‘키워드 관련도’로 표시하고 생성형 사실·영업 제안을 만들어내지 않는다. summaryKo가 없으면 ‘요약 없음’으로 표시한다. method별 analysisKey를 분리하고 manual/prepared 결과에는 modelId 대신 해당 방법 식별자를 사용한다.

## 8. 선택적 실제 뉴스·영상·AI 연동

- 단계 A: JSON 가져오기 또는 제목·URL·설명·발행일을 직접 입력한다. URL만으로 기사 전문이나 영상 자막을 읽었다고 가정하지 않는다.
- 단계 B: POST /api/v1/integrations/collect에 검증된 sourceId·cursor를 전달하고 items,nextCursor,warnings를 응답받아 브라우저에서 저장한다. 출처는 서버 allowlist로 승인하며 임의 URL 프록시는 허용하지 않는다.
- POST /api/v1/integrations/analyze에는 선택된 콘텐츠와 회사 설명만 보내고 개인 메모는 보내지 않는다. AI 결과를 클라이언트에서도 검증 후 저장한다.
- RSS 직접 브라우저 fetch는 출처 CORS 허용에 좌우되므로 기본 수집 경로로 보장하지 않는다. 서버 프록시가 없으면 파일 입력을 사용한다.
- YouTube 키·LLM 키는 서버 환경변수에 저장한다. Google API 키를 localStorage에 입력하게 하는 기능은 만들지 않는다.
- 채널 업로드는 uploads playlist, 키워드 검색은 search.list, 상세 정보는 videos.list를 사용하는 어댑터로 분리한다. 검색 결과는 전체 산업 뉴스의 완전한 목록이 아니다.
- 영상 메타데이터만 있으면 ‘영상 소개 요약’. 사용 허용된 자막·대본이 있을 때만 ‘영상 내용 요약’으로 표시한다.
- 뉴스 발행일과 수집일을 분리하고 미상 날짜는 null을 유지한다. 추적 기업·국가는 언어와 별개로 판정한다.
- 브라우저가 열린 동안 사용자가 갱신하거나, 마지막 성공 후 24시간이 지났을 때 선택적으로 재조회한다. 탭 종료 상태의 예약 수집은 제공하지 않는다.
- 한 요청은 출처당 20건 이내로 제한한다. 실패는 기존 데이터를 지우지 않는다. 클라이언트 중단 시 다음 실행에서 안전하게 다시 가져온다.
- 프록시는 429·5xx 재시도를 제한하고 Retry-After를 반영한다. 요청마다 입력 크기·처리 시간·응답 크기를 제한한다.
- 서버 DB 없이 일일 사용량을 브라우저 값만으로 강제할 수 없으므로 제공자 예산 상한과 제한된 배포 접근을 사용한다.

## 9. 후속 Firebase Google 로그인 설계

단계 C에서 Firebase Authentication의 Google provider를 활성화하고 배포 도메인을 승인 목록에 등록한다. signInWithPopup을 기본으로 구현하고 팝업 취소·차단·네트워크 오류를 처리한다. redirect 사용 시 배포 도메인 및 브라우저 조건에 맞춰 별도 검증한다. [Firebase Google 로그인 공식 문서](https://firebase.google.com/docs/auth/web/google-signin)

최초 로그인은 Firebase 사용자 생성과 서버 사용자 upsert를 연결한다. 이메일·비밀번호 가입 폼은 만들지 않는다. SDK의 인증 상태 복원을 기다린 후 화면을 전환하며 인증 토큰을 앱이 별도 localStorage 키로 복제하지 않는다.

서버 요청은 Authorization: Bearer <Firebase ID token>. Firebase Admin SDK로 토큰을 검증하고 검증된 uid를 사용한다. 클라이언트가 보내는 userId·role을 신뢰하지 않는다. 유효한 토큰이어도 BCR 접근 허용 여부를 서버에서 확인한다. [Firebase ID 토큰 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

가입과 회사 접근은 구분한다. 기본 사내 앱 정책은 서버에 등록된 허용 이메일·UID만 승인하고 그 외 계정은 접근 대기 화면을 보여준다. Firebase 인증 성공만으로 모든 회사 데이터를 읽을 수 없다. member/admin은 Neon users.role에서 관리하며 서버 운영 절차로만 관리자 권한을 부여한다.

로그아웃 시 Query 캐시·개인 자료 메모리·해당 클라우드 계정 오프라인 캐시를 정리한다. 로컬 작업공간을 클라우드 계정과 자동 병합하지 않는다. 계정 A 로그아웃 후 B 로그인 시 A 자료가 표시되지 않아야 한다.

## 10. 후속 Neon DB와 서버 API

Firebase는 인증을, Neon은 애플리케이션 데이터를 담당한다. Firestore·Realtime Database는 사용하지 않는다. 브라우저는 Neon 연결 문자열을 받지 않으며 서버의 PostgreSQL 드라이버와 parameterized query로만 접근한다.

| PostgreSQL 테이블 | 주요 필드·제약 |
|---|---|
| users | id UUID PK, firebase_uid TEXT UNIQUE, email, display_name, role, status, created_at |
| company_profiles | id UUID, version UNIQUE, description, products JSONB, target_countries TEXT[] |
| contents | id UUID PK, dedup_key UNIQUE, type, canonical_url, title_original, description, published_at nullable, collected_at, content_hash |
| sources/content_sources | 출처 설정 및 content_id/source_id 복합 PK |
| analyses | id, content_id FK, analysis_key UNIQUE, method, result JSONB, score, profile_version, status |
| bookmarks | user_id FK, content_id FK, 복합 PK |
| notes | user_id FK, content_id FK, body, version, updated_at, 복합 PK |
| collection_runs/jobs | 실행 상태·재시도·lease·멱등키 |
| import_batches | id, user_id, idempotency_key, status, id_map JSONB, 결과 건수 |
| usage_daily | day/provider/operation 복합 PK, 호출·토큰 수 |

SQL 스키마는 IndexedDB 객체를 명시적으로 매핑하고 날짜는 timestamptz로 변환한다. Firebase UID는 UUID라고 가정하지 않는다. FK는 users.id를 참조하며 Firebase 계정과는 firebase_uid로 연결한다.

권한 검사는 모든 서버 API에서 수행한다. 개인 자료 쿼리는 user_id=검증된 내부 사용자 ID 조건을 강제한다. DB 접속 역할은 필요한 최소 권한만 부여하고 SQL은 파라미터화한다. 인증 서비스 전용 auth.uid() 같은 함수를 가정하지 않는다. DB RLS를 추가한다면 사용자 컨텍스트와 정책을 별도로 구현·검증해야 하며 기본 보안 경계는 서버 API다.

| API | 단계 C 동작 |
|---|---|
| GET /api/v1/me | 검증된 Firebase UID에 연결된 사용자·권한 |
| GET /contents, GET /contents/:id | 인증된 조직 사용자 콘텐츠 조회 |
| PUT/DELETE /bookmarks/:id, GET /bookmarks | 본인 저장 목록만 변경·조회 |
| PUT/DELETE /notes/:id | 본인 메모, expectedVersion 비교 |
| GET/POST/PATCH /sources | 조회 및 관리자 설정 변경 |
| GET/PUT /company-profile | 조회 및 관리자 버전 변경 |
| POST /collection-runs, GET /collection-runs/:id | 관리자 예약·상태 조회 |
| POST /contents/:id/analyze | 관리자 분석 예약 |
| POST /imports/preview, POST /imports/commit | 로컬 데이터 검증·명시적 계정 가져오기 |

위 상대 경로는 /api/v1 아래에 둔다. CRUD 성공은 200/204, 작업 예약은 202, 오류는 400/401/403/404/409/429/502/503. 응답에 requestId를 포함하고 내부 키·스택을 노출하지 않는다.

서버 수집은 Cron + Neon 작업 큐로 수행하고 작은 묶음 단위로 처리한다. 작업 잠금·lease·멱등키를 사용하여 중복 실행에 대응한다. 브라우저가 닫혀 있어도 수집할 수 있는 기능은 이 단계에서만 활성화한다.

### 10.1 로컬 → 클라우드 전환

Google 로그인 → 가져올 로컬 자료와 대상 계정 표시 → 사용자가 가져오기 선택 → 서버 검증 → 중복 콘텐츠 매핑 → 북마크·메모를 로그인 사용자에게 연결 → 결과 보고.

클라이언트 workspaceId나 백업의 소유자 값을 권한 근거로 사용하지 않는다. notes 충돌은 기본 기존 서버 내용 보존, 사용자 선택 후 교체한다. import idempotencyKey로 재시도 중복을 막는다. 성공 전 로컬 자료를 지우지 않으며 초기 버전에서는 양방향 자동 동기화를 구현하지 않는다. cloud 모드는 서버를 기준으로 읽고 쓰며 local 모드로 돌아갈 때 자동 다운로드가 된다고 가정하지 않는다.

## 11. 코드 구조·설정·보안

```text
src/
  app/                  # router, mode factory
  components/           # card, filter, detail, storage status
  features/             # radar, saved, settings, cloud-auth
  repositories/         # indexeddb-repository, cloud-repository
  storage/              # schema, migrations, backup, ui-settings
  adapters/             # no-auth, firebase-auth, manual, import, server
  domain/               # normalize, filtering, scoring
shared/                 # types, Zod schemas
fixtures/               # labeled sample JSON
server/                 # optional collection/AI; cloud auth/Neon later
api/                    # optional HTTP handlers
migrations/neon/        # cloud SQL only
 tests/                 # storage, import, filters, E2E
```

기본 환경변수: VITE_APP_MODE=local, VITE_INTEGRATIONS=off. 이 기본값은 .env가 없어도 적용한다. 단계 A에서는 Firebase SDK 초기화·Neon SQL migration·외부 네트워크가 앱 실행의 전제 조건이 아니다.

단계 B 공개 설정: VITE_INTEGRATIONS=server, 동일 origin /api 사용. 서버 비밀: YOUTUBE_API_KEY, LLM_API_KEY, LLM_MODEL. 단계 C 공개 설정: VITE_APP_MODE=cloud, VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID. Firebase 웹 앱 설정은 프로젝트 식별용이며 서버 비밀 자격증명과 구분한다.

서버 전용: DATABASE_URL(Neon), FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY 또는 배포 환경의 서버 자격증명, CRON_SECRET. DATABASE_URL·Admin 개인키·LLM 키를 VITE_ 접두사에 넣지 않는다. cloud 설정 누락은 오류로 표시하고 조용히 로컬로 전환하지 않는다.

외부 HTML은 안전한 텍스트로 렌더링하고 URL은 http/https만 허용한다. RSS 파서 외부 엔티티 차단, 서버 프록시는 사설 IP·localhost·메타데이터 주소 및 리다이렉트 검증으로 SSRF를 차단한다. 로컬 JSON도 신뢰하지 않고 Zod와 길이 제한으로 검증한다.

정적 앱 최초 로드는 네트워크가 필요할 수 있다. 로컬 저장만으로 오프라인 앱 재로딩이 보장되지는 않는다. Service Worker/PWA는 후속 옵션이며 기본 인수 기준은 네트워크 없이 이미 열린 앱의 저장 자료를 조회·수정하는 동작이다.

## 12. 구현 순서

1. 모드 factory·NoAuth·IndexedDB 스키마·Repository·샘플 초기화.
2. 피드·필터·상세·반응형 화면·원문 링크.
3. 저장·메모·다중 탭 충돌·설정 복원.
4. JSON 가져오기·중복 병합·백업·초기화·용량 오류.
5. prepared/manual/rule_based 분석 표시와 상태 구분.
6. 로컬 MVP 인수 테스트·정적 배포·README 작성.
7. 별도 단계 B: 실제 수집·LLM 프록시 연동.
8. 별도 단계 C: Firebase Google 로그인·Neon·권한·계정 가져오기·Cron.

이번 산출물은 단계 A를 완성한 앱이며 B/C는 의존성을 끼워 넣지 않고 연결 가능한 인터페이스를 제공한다. footer: Developed by Jun · NextPlatform | React · Vite · TypeScript · Vercel / Built with Cursor · SPEC with ChatGPT | Version 1.0.0 · © 2026.

## 13. 인수 기준

| ID | 검증 시나리오 | 통과 기준 |
|---|---|---|
| L01 | 환경변수 없이 실행 | 로그인 없이 화면 표시, Firebase·Neon 요청 없음 |
| L02 | 콘텐츠·메모 3건 저장 후 브라우저 재실행 | 동일 origin에서 복원 |
| L03 | UI 설정 변경 후 새로고침 | localStorage 설정 복원, 콘텐츠는 IndexedDB |
| L04 | 날짜·국가·제품·유형 결합 검색 | 정의된 AND/OR·날짜 경계·미상 규칙 적용 |
| L05 | 같은 자료 2회 가져오기 | 중복 콘텐츠 없이 관계 매핑 |
| L06 | JSON 내보내기 후 빈 저장소에 복원 | 콘텐츠·분석·메모·북마크·회사 설정 일치 |
| L07 | 손상 JSON·상위 schemaVersion·용량 초과 | 부분 덮어쓰기 없음, 원 데이터 보존 |
| L08 | 두 탭 메모 동시 저장 | 충돌 감지, 입력 유실 없음 |
| L09 | IndexedDB upgrade·blocked·접근 불가 | 자동 데이터 삭제 없이 복구 안내 |
| L10 | 샘플·수동 요약·규칙 분류 | AI 실행·실시간 데이터로 오인할 표시 없음 |
| L11 | 메타데이터 기반 영상 자료 | 영상 소개 요약으로 표시 |
| L12 | 앱이 열린 상태에서 네트워크 차단 | 기존 자료 조회·메모 가능, 외부 자료 미리보기 실패만 표시 |
| L13 | 360px·키보드·상세 직접 URL | 주요 작업 가능, 포커스·새로고침 정상 |
| L14 | 앱 재실행·빈 검색 결과 | 샘플 중복 삽입 없음 |
| B01 | 선택적 실제 수집 및 분석 실패 | 기존 로컬 자료 유지·정확한 실패 상태 |
| C01 | Google 첫 로그인·재로그인 | Firebase UID와 users 매핑 중복 없음 |
| C02 | 무효 토큰·미승인 계정·다른 사용자 메모 | 서버에서 접근 거부 |
| C03 | 로그아웃 후 다른 계정 로그인 | 이전 개인 자료 미노출 |
| C04 | 로컬 자료를 계정으로 재가져오기 | 소유권 검증·중복 방지·기존 자료 보존 |

L01~L14가 기본 MVP 완료 조건이다. B/C 검증은 해당 연결 구현 때 수행한다. IndexedDB 실제 브라우저 테스트는 영속성·트랜잭션·다중 탭을 중심으로 하고 단위 테스트는 URL 정규화·필터·import mapping에 집중한다. 초기 성능 목표는 로컬 콘텐츠 5000건에서 필터 응답 500ms 이내이며 측정 브라우저·장비를 기록한다.

## 14. 참고와 문서 상태

- [MDN Storage 정책](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Firebase Google 로그인](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase ID token 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Neon 공식 사이트](https://neon.com/): 클라우드 구현 시 연결 방식·드라이버·플랜 확인.
- [YouTube 검색 API](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube 자막 API](https://developers.google.com/youtube/v3/docs/captions/download)

2026-09-17 개정. 이 문서는 구현 명세이며 실제 앱 코드 변경·DB 생성·인증 설정·배포는 포함하지 않는다.
