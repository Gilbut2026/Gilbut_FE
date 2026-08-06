/**
 * 길찾기 기록 API — 화면은 이 함수만 호출한다.
 *
 * ⚠️ BE 컨트롤러 **개발 전** → 항상 Mock (api/mode.ts 의 FORCED_MOCK).
 *      GET    /api/routes/history               최근 검색 이력 목록  ← listHistory 가 쓸 것
 *      GET    /api/routes/history/{historyId}   상세
 *      DELETE /api/routes/history/{historyId}   삭제
 *
 * 🚨 RouteHistoryItem 은 화면용으로 프론트가 만든 형태다(배지 라벨·톤 포함).
 *    BE 응답이 나오면 계약을 맞춰야 한다.
 */
import type { RouteHistoryItem } from '../types/dto'
import { mockListHistory } from '../mock/history'

export function listHistory(): Promise<RouteHistoryItem[]> {
  return mockListHistory()
}
