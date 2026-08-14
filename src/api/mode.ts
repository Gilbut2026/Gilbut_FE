/**
 * ============================================================
 *  Mock ↔ 실서버 스위치 — 도메인 단위
 * ============================================================
 *  백엔드 개발 현황이 도메인마다 다르다 (노션 「API 명세서」 2026-08-04 기준).
 *
 *    개발 완료 (20개) — auth · user · place · safety
 *    개발 전   (17개) — route · chat · facility · drt · history
 *
 *  전부-아니면-전무 스위치로는 "로그인·설정은 실서버, 경로·대화는 Mock" 이라는
 *  통합 과도기 조합을 만들 수 없어서 도메인 단위로 쪼갰다.
 *
 *  .env 사용법
 *    VITE_USE_MOCK=true                 전부 Mock (기본값 · 시연 안전판)
 *    VITE_USE_MOCK=false                전부 실서버
 *    VITE_REAL_DOMAINS=auth,user        전부 Mock인 상태에서 이 도메인만 실서버  ← 통합 시작할 때 이걸 씀
 *    VITE_MOCK_DOMAINS=route,chat       전부 실서버인 상태에서 이 도메인만 Mock
 *
 *  ⚠️ BE가 아직 안 만든 도메인(FORCED_MOCK)은 실서버로 켜도 Mock 으로 강제된다.
 *     켜지는 순간 화면이 통째로 죽는 것보다, 안 켜지고 콘솔에 경고가 뜨는 편이 낫다.
 *     BE 컨트롤러가 올라오면 FORCED_MOCK 에서 빼면 된다.
 */

export type ApiDomain = 'auth' | 'user' | 'place' | 'safety' | 'route' | 'chat' | 'history'

/** 화면·배지에 쓰는 사람이 읽는 이름 */
export const DOMAIN_LABEL: Record<ApiDomain, string> = {
  auth: '로그인',
  user: '설정',
  place: '장소',
  safety: '연락처',
  route: '경로',
  chat: '대화',
  history: '기록',
}

/**
 * BE 컨트롤러 미구현 — 실서버로 켜도 Mock 유지 (올라오는 대로 여기서 뺀다).
 * 2026-08-14 route 제거: BE 「맞춤 경로 추천」(POST /api/routes/recommendations) 배포됨 + AI 스코어링 서버
 *   배포(gilbut-ai.onrender.com)로 실호출 가능해졌다. 이제 route 는 일반 스위치로 처리 — 배포본은
 *   VITE_REAL_DOMAINS 에 route 가 없어 여전히 Mock 이고, 켜려면 그 목록에 route 를 넣는다(로그인 JWT 필요).
 * chat 은 AI 챗 NLU 엔드포인트 미존재, history 는 실이력이 전체 플로우 후에야 쌓여 아직 Mock 유지.
 */
const FORCED_MOCK: ReadonlySet<ApiDomain> = new Set<ApiDomain>(['chat', 'history'])

const ALL_DOMAINS: ApiDomain[] = ['auth', 'user', 'place', 'safety', 'route', 'chat', 'history']

function parseList(raw: string | undefined): Set<ApiDomain> {
  if (!raw) return new Set()
  const known = new Set<string>(ALL_DOMAINS)
  const picked = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const unknown = picked.filter((s) => !known.has(s))
  if (unknown.length > 0) {
    console.warn(`[api/mode] 모르는 도메인 이름: ${unknown.join(', ')} — 무시합니다.`)
  }
  return new Set(picked.filter((s): s is ApiDomain => known.has(s)))
}

const BASE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false'
const REAL_LIST = parseList(import.meta.env.VITE_REAL_DOMAINS)
const MOCK_LIST = parseList(import.meta.env.VITE_MOCK_DOMAINS)

/** 이 도메인을 Mock 으로 처리할지 */
export function useMock(domain: ApiDomain): boolean {
  if (FORCED_MOCK.has(domain)) return true
  // 명시 목록이 기본값을 이긴다. 둘 다에 있으면 Mock 이 이긴다(안전한 쪽).
  if (MOCK_LIST.has(domain)) return true
  if (REAL_LIST.has(domain)) return false
  return BASE_MOCK
}

/** 지금 Mock 으로 도는 도메인 목록 — 화면 배지용 */
export const MOCKED_DOMAINS: ApiDomain[] = ALL_DOMAINS.filter(useMock)

/** 하나라도 Mock 이면 true (배지 노출 여부) */
export const HAS_MOCK: boolean = MOCKED_DOMAINS.length > 0

/** 전부 Mock 인지 */
export const ALL_MOCK: boolean = MOCKED_DOMAINS.length === ALL_DOMAINS.length

/** 배지 문구 — 통합 중에 뭐가 실서버인지 눈으로 보이게 */
export function mockBadgeLabel(): string {
  if (ALL_MOCK) return 'MOCK 모드'
  return `MOCK: ${MOCKED_DOMAINS.map((d) => DOMAIN_LABEL[d]).join('·')}`
}

// 설정이 의도대로 먹었는지 콘솔에서 바로 확인할 수 있게 (개발 빌드에서만)
if (import.meta.env.DEV) {
  const real = ALL_DOMAINS.filter((d) => !useMock(d))
  const blocked = [...REAL_LIST].filter((d) => FORCED_MOCK.has(d))
  console.info(
    `[api/mode] 실서버: ${real.length ? real.join(', ') : '없음'} / Mock: ${MOCKED_DOMAINS.join(', ')}` +
      ` / baseURL: ${import.meta.env.VITE_API_BASE_URL || '(미설정)'}`,
  )
  if (blocked.length > 0) {
    console.warn(
      `[api/mode] ${blocked.join(', ')} 는 백엔드 컨트롤러가 아직 없어 Mock 으로 유지됩니다.` +
        ` BE 배포되면 api/mode.ts 의 FORCED_MOCK 에서 빼주세요.`,
    )
  }
  // auth 만 Mock 이면 가짜 토큰이 나가 실서버가 전부 403 을 준다 — 원인이 화면에 안 드러나는 조합
  if (real.length > 0 && useMock('auth') && !import.meta.env.VITE_DEV_ACCESS_TOKEN) {
    console.warn(
      `[api/mode] auth 는 Mock 인데 ${real.join(', ')} 는 실서버입니다.` +
        ` Mock 토큰은 JWT 가 아니라 실서버가 403 을 줍니다.` +
        ` .env 의 VITE_DEV_ACCESS_TOKEN 에 개발용 토큰을 넣거나 auth 도 실서버로 돌리세요.`,
    )
  }
}
