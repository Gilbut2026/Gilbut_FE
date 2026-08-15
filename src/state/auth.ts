/**
 * JWT 토큰 저장소 — 카카오 로그인 후 받은 토큰을 localStorage 에 보관한다.
 * client.ts 가 요청마다 accessToken 을 Authorization 헤더로 첨부한다.
 */
import type { TokenResponse } from '../types/dto'

const KEY = 'gilbet.auth'

export function getTokens(): TokenResponse | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TokenResponse) : null
  } catch {
    return null
  }
}

export function getAccessToken(): string | null {
  return getTokens()?.accessToken ?? null
}

export function saveTokens(tokens: TokenResponse): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tokens))
  } catch {
    /* 저장 실패는 무시 (시크릿 모드 등) */
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null
}

/* ------------------------------------------------------------
 *  세션 만료 알림
 *
 *  토큰이 만료되고 재발급도 실패하면 앱이 할 수 있는 게 없다. 그때 화면마다
 *  제각기 실패하도록 두면 사용자는 원인을 알 수 없다 — 경로는 "길을 찾지 못했어요",
 *  자주 가는 곳은 빈 목록, 온보딩 저장은 조용한 실패로 보인다.
 *  그래서 한 곳에서 알리고 App 이 로그인 화면으로 되돌린다.
 * ------------------------------------------------------------ */

type Listener = () => void
const expiredListeners = new Set<Listener>()

/** 세션이 끊겼을 때 부를 콜백 등록 — 해제 함수를 돌려준다 */
export function onSessionExpired(cb: Listener): () => void {
  expiredListeners.add(cb)
  return () => {
    expiredListeners.delete(cb)
  }
}

/** client.ts 가 재발급까지 실패했을 때 호출한다 */
export function notifySessionExpired(): void {
  clearTokens()
  expiredListeners.forEach((cb) => cb())
}
