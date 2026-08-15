/**
 * HTTP 클라이언트 — 실제 백엔드 호출을 담당하는 유일한 곳.
 * baseURL 은 .env 의 VITE_API_BASE_URL 한 곳에서만 관리한다.
 *
 * Gilbut_BE 계약에 맞춰:
 *  · 모든 응답은 { success, message, data } 봉투 → data 만 벗겨서 반환.
 *  · success:false 면 message 로 ApiError 를 던진다.
 *  · 로그인 상태면 accessToken 을 Authorization: Bearer 헤더로 자동 첨부.
 */
import type { ApiResponse, TokenResponse } from '../types/dto'
import { getAccessToken, getTokens, saveTokens, notifySessionExpired } from '../state/auth'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

/** 재발급 엔드포인트 — 이 경로는 401 이어도 재발급을 시도하지 않는다(무한 재귀 방지) */
const REFRESH_PATH = '/api/auth/refresh'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * 진행 중인 재발급. 여러 요청이 동시에 401 을 받아도 재발급은 한 번만 돈다.
 * (화면 하나가 장소·연락처·설정을 한꺼번에 부르는 일이 흔해서, 묶지 않으면
 *  refreshToken 이 여러 번 소비되어 오히려 세션이 끊긴다.)
 */
let refreshing: Promise<string | null> | null = null

/**
 * refreshToken 으로 accessToken 재발급.
 * api.post 를 쓰지 않는 이유: 이 호출이 401 이면 다시 재발급을 시도하는 재귀가 된다.
 */
function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing

  refreshing = (async () => {
    const refreshToken = getTokens()?.refreshToken
    if (!refreshToken) return null

    try {
      const res = await fetch(`${BASE_URL}${REFRESH_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return null

      const body = (await res.json()) as ApiResponse<TokenResponse>
      if (!body.success || !body.data?.accessToken) return null

      saveTokens(body.data)
      return body.data.accessToken
    } catch {
      return null
    }
  })()

  // 성공이든 실패든 다음 만료 때 다시 시도할 수 있게 비운다
  refreshing.finally(() => {
    refreshing = null
  })

  return refreshing
}

async function send(path: string, init: RequestInit | undefined, token: string | null): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(0, '네트워크에 연결할 수 없어요.')
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init, getAccessToken())

  // 토큰이 만료됐으면 한 번 재발급하고 원래 요청을 다시 보낸다.
  // 이걸 안 하면 만료된 순간부터 앱 전체가 원인 표시 없이 실패한다
  // (경로는 "길을 찾지 못했어요", 자주 가는 곳은 빈 목록으로 보인다).
  if (res.status === 401 && path !== REFRESH_PATH) {
    const fresh = await refreshAccessToken()
    if (fresh) {
      res = await send(path, init, fresh)
    } else {
      // 재발급도 안 되면 다시 로그인하는 수밖에 없다 — App 이 로그인 화면으로 되돌린다
      notifySessionExpired()
      throw new ApiError(401, '로그인이 만료됐어요. 다시 로그인해 주세요.')
    }
  }

  // 204 No Content (삭제 등) — 본문 없음
  if (res.status === 204) return undefined as T

  let body: ApiResponse<T>
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(res.status, `응답을 해석할 수 없어요. (${res.status})`)
  }

  if (!res.ok || !body.success) {
    throw new ApiError(res.status, body.message || `요청이 실패했어요. (${res.status})`)
  }
  return body.data as T
}

/** GET 쿼리스트링 직렬화 (undefined/빈값은 제외) */
export function toQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') usp.append(k, v)
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
