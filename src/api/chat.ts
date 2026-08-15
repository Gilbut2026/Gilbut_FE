/**
 * 상담(chat) API — 2026-08-15 배포 BE chat-controller 계약 (/v3/api-docs 대조 완료).
 * 화면(ChatScreen)은 이 파일의 함수만 호출한다.
 *
 * 서버 주도 상태머신: sendChatMessage 로 발화를 보내면 서버가 다음 상태·메시지를
 * 돌려주고, 단계 확정은 *-confirmation 으로 한다. sessionId 는 서버가 JWT(사용자)
 * 기준으로 관리하므로 클라이언트가 들고 다닐 필요가 없다.
 *
 * 배포된 엔드포인트는 6개다. 당일상태 확정(today-condition-confirmation)은 BE 에서
 * 삭제됐으므로 호출하지 않는다 — 남겨두면 404 가 난다.
 *
 * ⚠️ 실서버 전용이다. Mock 모드에서는 ChatScreen 이 기존 스크립트 대화로 동작하므로
 *    이 파일을 타지 않는다(useMock('chat') 로 화면에서 분기). BE 미배포이던
 *    api/counseling.ts 는 레거시이며, chat 도메인이 실서버로 붙으면 제거한다.
 */
import { api } from './client'
import type {
  ChatMessageRequest,
  ChatMessageResponse,
  ChatSessionResponse,
  DepartureTimeConfirmationRequest,
  OriginConfirmationRequest,
  PlaceConfirmationRequest,
} from '../types/dto'

/** 현재 세션 스냅샷 (없으면 서버가 새로 시작한 상태를 준다) */
export function getChatSession(): Promise<ChatSessionResponse> {
  return api.get<ChatSessionResponse>('/api/chat/session')
}

/** 세션 초기화 — 처음부터 다시 (목적지 변경 등) */
export function resetChatSession(): Promise<ChatSessionResponse> {
  return api.post<ChatSessionResponse>('/api/chat/session/reset', {})
}

/**
 * 사용자 발화 전송 → 다음 상태·메시지·(장소 후보).
 *
 * coords 를 넘기면 "내 근처 병원"·"수원역 근처 약국" 같은 기준 위치 검색이 동작한다
 * (2026-08-15 BE 채팅 주변검색 지원). 위치 권한이 없으면 생략해도 되고, 그때 서버는
 * 위치가 꼭 필요한 발화에 responseType='LOCATION_REQUIRED' 로 답한다.
 */
export function sendChatMessage(
  message: string,
  coords?: { latitude: number; longitude: number },
): Promise<ChatMessageResponse> {
  const body: ChatMessageRequest = { message }
  if (coords) {
    body.latitude = coords.latitude
    body.longitude = coords.longitude
  }
  return api.post<ChatMessageResponse>('/api/chat', body)
}

/** 목적지 후보 확정 */
export function confirmPlace(req: PlaceConfirmationRequest): Promise<ChatSessionResponse> {
  return api.post<ChatSessionResponse>('/api/chat/place-confirmation', req)
}

/** 출발지 확정 (현재 위치 / 집 / 특정 장소) */
export function confirmOrigin(req: OriginConfirmationRequest): Promise<ChatSessionResponse> {
  return api.post<ChatSessionResponse>('/api/chat/origin-confirmation', req)
}

/** 출발 시각 확정 (ISO 8601) */
export function confirmDepartureTime(
  req: DepartureTimeConfirmationRequest,
): Promise<ChatSessionResponse> {
  return api.post<ChatSessionResponse>('/api/chat/departure-time-confirmation', req)
}

/* 당일 상태 확정(confirmTodayCondition)은 제거했다 — 배포 BE 에 해당 엔드포인트가 없다.
 * 휠체어·이동 특성은 온보딩(PUT /api/users/me/mobility-profile)에서만 받는다. */
