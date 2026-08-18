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

import { useMock } from './mode'

const USE_MOCK = () => useMock('auth')

/** 카카오 로그인 콜백 경로 — 인가 URL·App 콜백 감지·라우팅에서 공유한다. */
export const KAKAO_CALLBACK_PATH = '/auth/kakao/callback'

/**
 * 브라우저를 보낼 카카오 인가 페이지 URL.
 * redirect_uri 는 BE 의 KAKAO_REDIRECT_URI + 카카오 콘솔 등록값과 글자까지 같아야 한다
 * (BE 가 토큰 교환 때 이 값을 그대로 다시 보내기 때문). 안 맞으면 카카오가 KOE006 으로 막는다.
 */
export function kakaoAuthorizeUrl(): string {
  const clientId = import.meta.env.VITE_KAKAO_CLIENT_ID ?? ''
  const redirectUri =
    import.meta.env.VITE_KAKAO_REDIRECT_URI || `${window.location.origin}${KAKAO_CALLBACK_PATH}`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`
}

/** 카카오 인가 코드로 로그인 → 토큰 저장 */
export async function kakaoLogin(code: string): Promise<TokenResponse> {
  const tokens = USE_MOCK()
    ? await mockKakaoLogin()
    : await api.post<TokenResponse>('/api/auth/kakao-login', { code })
  saveTokens(tokens)
  return tokens
}

/** 리프레시 토큰으로 재발급 → 토큰 갱신 저장 */
export async function refresh(refreshToken: string): Promise<TokenResponse> {
  const tokens = USE_MOCK()
    ? await mockRefresh()
    : await api.post<TokenResponse>('/api/auth/refresh', { refreshToken })
  saveTokens(tokens)
  return tokens
}

/** 회원 탈퇴 — 서버에서 계정과 딸린 자료를 지운다. 토큰 정리는 호출한 쪽(state/account)이 한다.
 *
 *  ⚠️ 백엔드에 아직 이 엔드포인트가 없을 수 있다(2026-08-18 기준 미구현).
 *     없으면 404/405 가 오고, state/account 가 그때 할 수 있는 만큼만 지우는 길로 간다. */
export function deleteAccount(): Promise<void> {
  return api.del<void>('/api/users/me')
}

/** 로그아웃 → 로컬 토큰 삭제 */
export async function logout(): Promise<void> {
  if (!USE_MOCK()) await api.post<void>('/api/auth/logout')
  else await mockLogout()
  clearTokens()
}
