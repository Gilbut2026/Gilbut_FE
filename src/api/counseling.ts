/**
 * 상담(챗봇) API — 화면(screens)은 오직 이 파일의 함수만 호출한다.
 *
 * ⚠️ BE 챗봇 컨트롤러는 **개발 전**이라 지금은 항상 Mock 이다 (api/mode.ts 의 FORCED_MOCK).
 *    아래 경로는 노션 「API 명세서」(2026-08-04) 에 맞춰 미리 고쳐둔 것으로,
 *    BE 가 올라오면 FORCED_MOCK 에서 'chat' 만 빼면 그대로 붙는다.
 *    (기존 프론트 경로 `/api/sessions`·`/api/counseling/messages` 는 명세서에 없어 404 였다.)
 *
 * 🚨 정합 필요 — 명세서에 있는데 프론트가 아직 안 쓰는 것:
 *      POST   /api/chat/sessions/{sessionId}/place-confirmation   상담 장소 후보 확정
 *      GET    /api/chat/sessions                                  상담 기록 목록
 *      GET    /api/chat/sessions/{sessionId}                      상담 상세
 *      DELETE /api/chat/sessions/{sessionId}                      상담 기록 삭제
 *    또한 이 파일이 쓰는 CounselingResponse 는 **피벗 이전(판단카드) 모델**이라,
 *    BE 최종 응답 DTO 가 확정되면 types/dto.ts §6 과 함께 갈아엎어야 한다.
 */
import { api } from './client'
import type {
  CounselingRequest,
  CounselingResponse,
  StartSessionResponse,
} from '../types/dto'
import { mockSendMessage, mockStartSession } from '../mock/counseling'
import { useMock } from './mode'

const USE_MOCK = () => useMock('chat')

const SESSIONS = '/api/chat/sessions'

/** 상담 세션 시작 → sessionId 발급 */
export function startSession(): Promise<StartSessionResponse> {
  if (USE_MOCK()) return mockStartSession()
  return api.post<StartSessionResponse>(SESSIONS, {})
}

/** 사용자 발화 전송 → 다음 질문(QUESTION) 또는 결과(RESULT) 반환 */
export function sendMessage(req: CounselingRequest): Promise<CounselingResponse> {
  if (USE_MOCK()) return mockSendMessage(req)
  // sessionId 는 경로에 들어가므로 본문에서는 뺀다
  return api.post<CounselingResponse>(`${SESSIONS}/${req.sessionId}/messages`, {
    message: req.message,
    inputType: req.inputType,
  })
}
