# BCR Robotics Radar

![BCR Radar — Google 로그인](docs/screenshots/login.png)

![BCR Radar — 오늘의 동향](docs/screenshots/radar.png)

블루클라우드 로보틱스 북유럽 세일즈를 위한 미디어 허브입니다. 글로벌 로봇 뉴스·유튜브를 탐색하고, 액추에이터·컨트롤러 사업과 관련된 자료를 저장·메모합니다.

저장소: [junsang-dong/goorm-260917-news](https://github.com/junsang-dong/goorm-260917-news)

---

## 이번 작업 요약 (2026-09-17)

Codex에서 중단된 **단계 A 로컬 MVP**를 이어서 완성하고, **YouTube 수집(단계 B)** 과 **Firebase Google 로그인(단계 C 인증)** 까지 연결했습니다.

### 주요 구현

| 영역 | 내용 |
|---|---|
| 로컬 MVP | IndexedDB 저장, 피드·필터·상세, 북마크·메모, 샘플/수동 등록, JSON 백업·복원 |
| YouTube 수집 | `.env`의 `YOUTUBE_API_KEY`를 서버 전용으로 사용, `/api/v1/integrations/*` 프록시 |
| 주제 검색 | 액추에이터·컨트롤러·AI·인공지능 키워드로 영상 검색 수집 |
| Google 로그인 | Firebase `signInWithPopup`, `/login` 화면, 로그아웃 시 Query 캐시 정리 |
| UI | 블루·네이비 뉴스룸 레이아웃, 로컬/Google 상태 배지, 반응형 |

### 오류·보완 수정

- `App.tsx` JSX 문법 오류(`onAdd` 콜백 닫는 괄호 누락)로 빌드 실패 → 수정
- IndexedDB `blocking` 콜백 TypeScript 오류 → `versionchange` 시 연결 종료로 정리
- 용량 초과 메시지 한글 깨짐(중국어 혼입) → 한국어로 수정
- 테스트 프로세스가 `BroadcastChannel` 때문에 종료되지 않던 문제 → 브라우저에서만 채널 생성
- 백업 다운로드 토스트 중복 알림 → 제거
- 클라우드 모드 차단 메시지 → Firebase 설정 시 Google 로그인 가능하도록 전환
- 채널 업로드만으로는 관련 자료가 부족 → 주제 키워드 검색·채널 내 주제 검색 추가
- API 키·Firebase 설정은 `.env`에만 두고 git에 올리지 않음 (`.gitignore`)

### 아직 미연결 (의도적)

- 뉴스 RSS 실시간 수집
- 생성형 AI(LLM) 요약
- Neon PostgreSQL 계정별 동기화

---

## 실행

```bash
npm install
cp .env.example .env   # YouTube·Firebase 키 입력
npm run dev
```

브라우저: `http://localhost:5173`

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (API 프록시 포함) |
| `npm run build` | 타입 검사 + 정적 빌드 |
| `npm run preview` | 빌드 미리보기 |
| `npm test` | 단위 테스트 |
| `npm run firebase:login` | Firebase CLI 로그인 |
| `npm run firebase:deploy` | Hosting 배포 |

---

## 기능 범위

### 단계 A — 로컬 MVP

- IndexedDB: 콘텐츠·분석·북마크·메모·회사 설명·출처·처리 기록
- localStorage: 테마·레이아웃·최근 필터
- 샘플 초기화, 수동 등록, JSON 가져오기·내보내기
- 사전 작성·수동 요약, 규칙 기반(키워드) 관련도
- 환경변수 없이 실행 가능 (로그인 선택)

### 단계 B — YouTube 수집

`.env`에 `YOUTUBE_API_KEY`를 넣으면 개발 서버가 수집 API를 제공합니다. 키는 브라우저로 내려가지 않습니다.

1. **설정 → 출처 관리**에서 연결 상태 확인
2. **주제 검색 수집** 또는 채널 **지금 수집** / **채널 전체 수집**
3. 요청당 최대 20건 · IndexedDB에 `실시간` 저장 · 메타데이터 기준 분류

### 단계 C — Firebase Google 로그인

`.env`에 `VITE_FIREBASE_*` 웹 설정을 넣으면 `/login`에서 Google 로그인을 사용할 수 있습니다.

Firebase Console 확인 항목:
1. **Authentication → Sign-in method → Google** 사용 설정
2. **Authorized domains**에 `localhost` 포함
3. 배포 도메인도 승인 목록에 추가

자료는 현재 IndexedDB(로컬)에 저장됩니다. Neon 계정 동기화는 후속 단계입니다.

---

## 화면

| 경로 | 내용 |
|---|---|
| `/radar` | 오늘의 동향 · 검색·필터 |
| `/login` | Google 로그인 |
| `/contents/:id` | 상세 · 요약·저장·메모 |
| `/saved` | 저장한 자료 |
| `/settings/sources` | 출처·YouTube 수집 |
| `/settings/company` | 회사 프로필 |
| `/settings/data` | 백업·복원·용량·초기화 |
| `/settings/runs` | 처리 기록 |

---

## 데이터 안내

자료는 현재 브라우저 프로필과 사이트(origin)에만 저장됩니다. 브라우저 데이터 삭제·시크릿 모드 종료 시 사라질 수 있으니 **설정 → 데이터 관리**에서 JSON 백업을 권장합니다.

기본 모드: `VITE_APP_MODE=local` (`.env` 없이도 동일).

---

## 기술 스택

React · Vite · TypeScript · TanStack Query · IndexedDB(idb) · Zod · Firebase Auth · YouTube Data API v3 (서버 프록시)

명세서: `public/C36 SPEC BCR_Robotics_Radar_Technical_Spec_v1.0.md`

---

Developed by Jun · NextPlatform | Built with Cursor · SPEC with ChatGPT | Version 1.0.0 · © 2026
