/**
 * 회원 탈퇴 — 계정을 지우고 처음 상태로 돌아간다.
 *
 * 두 가지 이유로 필요하다.
 *
 *  · **어르신의 권리** — 그만 쓰겠다는 사람이 자기 자료를 지울 방법이 없으면 안 된다.
 *    집 주소, 비상 연락처, 어디를 언제 다녔는지가 다 남아 있는 앱이다.
 *  · **시연** — 시연 영상은 「처음 앱을 켠 사람」에서 시작해야 하는데, 개발하며 쌓인
 *    로그인·이동특성·집 주소·기록 때문에 온보딩 화면을 다시 볼 수가 없었다. 찍을 때마다
 *    새 카카오 계정을 만들고 있었다(2026-08-18 정성민님).
 *
 * ─────────────────────────────────────────────────────────────
 *  서버에 탈퇴가 있으면 그것으로, 없으면 할 수 있는 만큼
 * ─────────────────────────────────────────────────────────────
 *
 * 백엔드에 `DELETE /api/users/me` 가 아직 없다(2026-08-18 확인). 생기면 그 한 번으로
 * 끝나므로 **먼저 그것을 부른다.** 404·405 가 오면 아직 없는 것이니, 프론트에서 지울 수
 * 있는 것을 하나씩 지운다 — 집 주소·즐겨찾기·비상 연락처·길찾기 기록·대화 세션.
 *
 * 이 길에서는 **이동특성(온보딩 답)만 남는다.** 그것만 지우는 엔드포인트도 없고, PUT 으로
 * 덮어쓰는 것만 된다. 그래서 「다음 로그인은 온보딩부터」 표시를 남겨둔다. 다시 들어와
 * 7문항을 답하면 그 답이 예전 것을 덮어쓰므로, 보이는 결과는 처음 가입한 것과 같다.
 *
 * 서버가 탈퇴를 받아주게 되면 이 표시는 필요 없다 — 계정이 없으니 프로필도 없고,
 * 앱이 알아서 온보딩으로 보낸다(App 의 404 처리).
 */
import { ApiError } from '../api/client'
import { deleteAccount, logout } from '../api/auth'
import { resetChatSession } from '../api/chat'
import { listHistory, deleteHistory } from '../api/history'
import { deleteHome, listFavorites, deleteFavorite } from '../api/place'
import { listContacts, deleteContact } from '../api/safety'
import { clearTokens } from './auth'

/** 이 기기에 우리가 쓴 것들의 공통 앞머리 (gilbet.auth, gilbet.settings, …) */
const APP_PREFIX = 'gilbet.'

/** 「다음 로그인은 온보딩부터」 표시. 서버 탈퇴가 안 될 때만 심고, 온보딩을 마치면 지운다. */
const FRESH_KEY = 'gilbet.freshStart'

/** 탈퇴하고 다시 들어온 것인가 — App 이 첫 화면을 정할 때 본다 */
export function isFreshStart(): boolean {
  try {
    return localStorage.getItem(FRESH_KEY) === '1'
  } catch {
    return false
  }
}

/** 온보딩을 마쳤다 — 표시를 거둔다 */
export function clearFreshStart(): void {
  try {
    localStorage.removeItem(FRESH_KEY)
  } catch {
    /* 무시 */
  }
}

/** 이 기기에 남은 앱 데이터를 모두 지운다 (토큰·설정·가다 만 길·설치 안내 닫음 표시) */
function clearLocalData(): void {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const keys: string[] = []
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (k?.startsWith(APP_PREFIX)) keys.push(k)
      }
      keys.forEach((k) => store.removeItem(k))
    } catch {
      /* 저장소를 못 쓰는 환경이면 지울 것도 없다 */
    }
  }
}

/** 실패해도 다음 것을 계속 지운다 — 하나 막혔다고 전부 남겨두면 더 나쁘다 */
async function tryStep(label: string, run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch {
    return label
  }
}

/** 서버에 탈퇴가 아직 없다는 신호 */
function notImplemented(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 405)
}

/** 서버에 남은 내 자료를 하나씩 지운다 — 탈퇴 엔드포인트가 없을 때의 차선책 */
async function clearServerData(): Promise<string[]> {
  const failed = await Promise.all([
    tryStep('집 주소', () => deleteHome()),
    tryStep('즐겨찾기', async () => {
      const list = await listFavorites()
      await Promise.all(list.map((f) => deleteFavorite(f.id)))
    }),
    tryStep('비상 연락처', async () => {
      const list = await listContacts()
      await Promise.all(list.map((c) => deleteContact(c.id)))
    }),
    tryStep('길찾기 기록', async () => {
      const list = await listHistory()
      await Promise.all(list.map((h) => deleteHistory(h.id)))
    }),
    tryStep('대화 내용', () => resetChatSession()),
  ])
  await tryStep('로그아웃', () => logout())
  return failed.filter((x): x is string => x !== null)
}

/** 탈퇴가 어떻게 처리됐는지 */
export interface WithdrawResult {
  /** 'account' = 서버에서 계정째 지웠다 · 'data' = 탈퇴가 아직 없어 자료만 지웠다 */
  how: 'account' | 'data'
  /** 'data' 일 때, 그마저도 지우지 못한 것들 */
  failed: string[]
}

/**
 * 탈퇴한다. 끝나면 화면을 통째로 다시 여는 것이 호출자의 몫이다 —
 * 이 앱은 라우터 없이 App 의 useState 하나로 화면을 갈아끼우기 때문에, 지우기만 하고
 * 화면을 그대로 두면 방금 지운 값들이 메모리에 남아 계속 보인다.
 *
 * @throws 서버 탈퇴가 있는데 실패했을 때. 이때는 아무것도 지우지 않는다 —
 *         절반만 지워진 계정을 남기느니 실패했다고 알리는 편이 낫다.
 */
export async function withdraw(): Promise<WithdrawResult> {
  try {
    await deleteAccount()
    clearTokens()
    clearLocalData()
    return { how: 'account', failed: [] }
  } catch (e) {
    if (!notImplemented(e)) throw e
  }

  // 여기부터는 서버에 탈퇴가 아직 없는 경우
  const failed = await clearServerData()
  clearTokens()
  clearLocalData()
  try {
    localStorage.setItem(FRESH_KEY, '1')
  } catch {
    /* 표시를 못 남기면 온보딩 대신 홈으로 간다 — 설정의 '다시 답하기'로 갈 수 있다 */
  }
  if (failed.length) console.warn('[탈퇴] 지우지 못한 것:', failed.join(', '))
  return { how: 'data', failed }
}
