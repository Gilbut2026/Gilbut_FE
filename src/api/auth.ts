/**
 * 인증 API — 카카오 로그인 + JWT. 화면은 이 파일의 함수만 호출한다.
 *
 * VITE_USE_MOCK=true  → 가짜 토큰 발급 (백엔드 없이 로그인된 상태로 화면 확인)
 * VITE_USE_MOCK=false → 실제 BE (/api/auth/*) 호출
 */
import { api } from './client'
import type { TokenResponse } from '../types/dto'
import { saveTokens, clearTokens } from '../state/auth'
import { mockKakaoLogin, mockRefresh, mockLogout } from '../mock/auth'

const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

/** 카카오 인가 코드로 로그인 → 토큰 저장 */
export async function kakaoLogin(code: string): Promise<TokenResponse> {
  const tokens = USE_MOCK
    ? await mockKakaoLogin()
    : await api.post<TokenResponse>('/api/auth/kakao-login', { code })
  saveTokens(tokens)
  return tokens
}

/** 리프레시 토큰으로 재발급 → 토큰 갱신 저장 */
export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const tokens = USE_MOCK
    ? await mockRefresh()
    : await api.post<TokenResponse>('/api/auth/refresh', { refreshToken })
  saveTokens(tokens)
  return tokens
}

/** 로그아웃 → 로컬 토큰 삭제 */
export async function logout(): Promise<void> {
  if (!USE_MOCK) await api.post<void>('/api/auth/logout')
  else await mockLogout()
  clearTokens()
}
