/**
 * HTTP 클라이언트 — 실제 백엔드 호출을 담당하는 유일한 곳.
 * baseURL 은 .env 의 VITE_API_BASE_URL 한 곳에서만 관리한다.
 *
 * Gilbut_BE 계약에 맞춰:
 *  · 모든 응답은 { success, message, data } 봉투 → data 만 벗겨서 반환.
 *  · success:false 면 message 로 ApiError 를 던진다.
 *  · 로그인 상태면 accessToken 을 Authorization: Bearer 헤더로 자동 첨부.
 */
import type { ApiResponse } from '../types/dto'
import { getAccessToken } from '../state/auth'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken()
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
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
