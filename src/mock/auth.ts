/** Mock 인증 — 실제 카카오 OAuth 리다이렉트 없이 가짜 토큰을 발급한다. */
import type { TokenResponse } from '../types/dto'
import { delay } from './_shared'

export function mockKakaoLogin(): Promise<TokenResponse> {
  return delay({
    accessToken: `mock-access-${Date.now()}`,
    refreshToken: `mock-refresh-${Date.now()}`,
  })
}

export function mockRefresh(): Promise<TokenResponse> {
  return delay({
    accessToken: `mock-access-${Date.now()}`,
    refreshToken: `mock-refresh-${Date.now()}`,
  })
}

export function mockLogout(): Promise<void> {
  return delay(undefined)
}
