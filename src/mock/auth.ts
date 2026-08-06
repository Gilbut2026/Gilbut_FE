/**
 * Mock 인증 — 실제 카카오 OAuth 리다이렉트 없이 토큰을 발급한다.
 *
 * ⚠️ 통합 과도기의 함정 (2026-08-04 로컬 실연결로 확인)
 *    `auth` 는 Mock, `user`·`place`·`safety` 는 실서버로 두면 —
 *    카카오 OAuth 는 브라우저 상호작용이라 자동화가 안 되니 자연스러운 조합인데 —
 *    여기서 발급한 `mock-access-...` 문자열을 BE 가 JWT 로 파싱하지 못해
 *    **모든 요청이 403** 이 된다. 화면은 전부 빈 상태로 보이고 원인은 안 보인다.
 *
 *    그래서 `.env` 에 `VITE_DEV_ACCESS_TOKEN` 을 넣으면 그 값을 그대로 발급한다.
 *    스웨거에서 받은 토큰이나 팀에서 받은 개발용 토큰을 붙여넣으면
 *    카카오 로그인 없이 실서버 엔드포인트를 검증할 수 있다.
 *    실 카카오 로그인이 붙으면 이 값은 비우고 `auth` 도 실서버로 돌리면 된다.
 */
import type { TokenResponse } from '../types/dto'
import { delay } from './_shared'

const DEV_TOKEN: string = import.meta.env.VITE_DEV_ACCESS_TOKEN ?? ''

function issue(): TokenResponse {
  if (DEV_TOKEN) return { accessToken: DEV_TOKEN, refreshToken: DEV_TOKEN }
  return {
    accessToken: `mock-access-${Date.now()}`,
    refreshToken: `mock-refresh-${Date.now()}`,
  }
}

export function mockKakaoLogin(): Promise<TokenResponse> {
  return delay(issue())
}

export function mockRefresh(): Promise<TokenResponse> {
  return delay(issue())
}

export function mockLogout(): Promise<void> {
  return delay(undefined)
}
