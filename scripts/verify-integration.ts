/**
 * 백엔드 실연결 검증 — 화면이 쓰는 것과 **똑같은 api/*.ts 코드**를 그대로 태운다.
 * curl 로 엔드포인트만 두드리는 것과 달리, client.ts 의 응답 봉투 해제·JWT 헤더 첨부·
 * 도메인 스위치(api/mode.ts)까지 실제 경로를 통과하므로 통합 리스크를 진짜로 걷어낸다.
 *
 * 실행:
 *   npx vite-node scripts/verify-integration.ts
 *
 * 전제: BE 가 VITE_API_BASE_URL 주소에 떠 있고, .env 에 VITE_REAL_DOMAINS 와
 *      (카카오 로그인 전이라면) VITE_DEV_ACCESS_TOKEN 이 채워져 있을 것.
 */
import { kakaoLogin } from '../src/api/auth'
import { getMobilityProfile, saveMobilityProfile, saveAccessibility, getSettings } from '../src/api/user'
import { addFavorite, listFavorites, deleteFavorite, getHome, saveHome, deleteHome } from '../src/api/place'
import { addContact, listContacts, deleteContact } from '../src/api/safety'
import { getRoutes } from '../src/api/route'
import { MOCKED_DOMAINS } from '../src/api/mode'
import type { MobilityAid } from '../src/types/dto'

// 브라우저 전용 API 를 Node 에서 대신한다 (state/auth 가 localStorage 를 씀)
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

let pass = 0
let fail = 0

async function check(label: string, fn: () => Promise<unknown>, assert?: (v: never) => boolean | string) {
  try {
    const v = await fn()
    const verdict = assert ? assert(v as never) : true
    if (verdict === true) {
      console.log(`  ✅ ${label}`)
      pass++
    } else {
      console.log(`  ❌ ${label} — ${verdict === false ? '단언 실패' : verdict}`)
      fail++
    }
  } catch (e) {
    console.log(`  ❌ ${label} — ${(e as Error).message}`)
    fail++
  }
}

async function main() {
  console.log(`Mock 도메인: ${MOCKED_DOMAINS.join(', ') || '없음'}\n`)

  console.log('[인증] 토큰 발급·저장')
  await check('kakaoLogin → localStorage 에 토큰 저장', () => kakaoLogin('dummy-code'), (t: { accessToken: string }) =>
    typeof t.accessToken === 'string' && t.accessToken.length > 0,
  )

  console.log('\n[온보딩] 이동설정 — 오늘 복원한 보조기구 3지선다')
  for (const aid of ['NONE', 'CANE', 'WHEELCHAIR'] as MobilityAid[]) {
    await check(
      `saveMobilityProfile mobilityAid=${aid}`,
      () =>
        saveMobilityProfile({
          walkingDuration: 'WITHIN_20_MINUTES',
          stairLevel: 'SLIGHTLY_DIFFICULT',
          restStopPreference: 'REQUIRED',
          transferLevel: 'FEWER_PREFERRED',
          mobilityAid: aid,
        }),
      (p: { mobilityAid: string }) => p.mobilityAid === aid || `되돌아온 값이 ${p.mobilityAid}`,
    )
  }
  await check('getMobilityProfile', () => getMobilityProfile(), (p: { mobilityAid: string }) =>
    p.mobilityAid === 'WHEELCHAIR' || `마지막 저장값과 다름: ${p.mobilityAid}`,
  )

  console.log('\n[설정] 접근성 + 통합 조회')
  await check(
    'saveAccessibility fontSize=EXTRA_LARGE',
    () =>
      saveAccessibility({
        voiceGuidanceEnabled: true,
        highContrastEnabled: false,
        fontSize: 'EXTRA_LARGE',
        voiceSpeed: 1.2,
      }),
    (a: { fontSize: string }) => a.fontSize === 'EXTRA_LARGE',
  )
  await check('getSettings (설정 화면 한 번에 조회)', () => getSettings(), (s: { mobilityProfile: unknown }) =>
    s.mobilityProfile !== null || '이동설정이 비어 있음',
  )

  console.log('\n[연락처] 등록 → 조회 → 삭제')
  let contactId = 0
  await check('addContact', () => addContact({ name: '김보호', relationship: '자녀', phoneNumber: '010-1234-5678', priority: 1 }),
    (c: { id: number }) => { contactId = c.id; return c.id > 0 },
  )
  await check('listContacts', () => listContacts(), (l: unknown[]) => l.length === 1 || `${l.length}건`)
  await check('deleteContact', () => deleteContact(contactId))

  console.log('\n[즐겨찾기] 등록 → 조회 → 삭제')
  let favId = 0
  await check('addFavorite', () => addFavorite({ name: '○○병원', address: '수원시 팔달구 ○○로 12', latitude: 37.28, longitude: 127.01 }),
    (f: { id: number }) => { favId = f.id; return f.id > 0 },
  )
  await check('listFavorites', () => listFavorites(), (l: unknown[]) => l.length === 1 || `${l.length}건`)
  await check('deleteFavorite', () => deleteFavorite(favId))

  console.log('\n[집 주소] 미등록 → 등록 → 삭제')
  await check('getHome (미등록이면 null)', () => getHome(), (h: unknown) => h === null || `null 이 아님: ${JSON.stringify(h)}`)
  await check('saveHome', () => saveHome({ address: '수원시 팔달구 행궁로 11', latitude: 37.2636, longitude: 127.0286 }))
  await check('getHome (등록 후)', () => getHome(), (h: { address: string } | null) => h?.address === '수원시 팔달구 행궁로 11')
  await check('deleteHome', () => deleteHome())

  console.log('\n[경로] BE 미구현 — Mock 이 계속 도는지')
  await check('getRoutes → 후보 3개', () => getRoutes('○○병원'), (r: { options: unknown[] }) => r.options.length === 3)

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
