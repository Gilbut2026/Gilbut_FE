/**
 * 상담 API — 화면(screens)은 오직 이 파일의 함수만 호출한다.
 *
 * VITE_USE_MOCK=true  → mock 구현으로 동작 (백엔드 없이 화면 확인)
 * VITE_USE_MOCK=false → 실제 백엔드 REST API 호출
 *
 * 백엔드가 준비되면 이 파일은 사실상 그대로 두고 .env 만 바꾸면 된다.
 */
import { api } from './client'
import type {
  CounselingRequest,
  CounselingResponse,
  StartSessionResponse,
} from '../types/dto'
import { mockSendMessage, mockStartSession } from '../mock/counseling'

const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

/** 상담 세션 시작 → sessionId 발급 */
export function startSession(): Promise<StartSessionResponse> {
  if (USE_MOCK) return mockStartSession()
  return api.post<StartSessionResponse>('/api/sessions', {})
}

/** 사용자 발화 전송 → 다음 질문(QUESTION) 또는 결과(RESULT) 반환 */
export function sendMessage(req: CounselingRequest): Promise<CounselingResponse> {
  if (USE_MOCK) return mockSendMessage(req)
  return api.post<CounselingResponse>('/api/counseling/messages', req)
}

export { USE_MOCK }
