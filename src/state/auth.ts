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
