/**
 * 길찾기 기록 API — 화면은 이 함수만 호출한다.
 * ⚠️ BE RouteSearchHistory 컨트롤러 미구현 → 현재는 항상 Mock.
 */
import type { RouteHistoryItem } from '../types/dto'
import { mockListHistory } from '../mock/history'

export function listHistory(): Promise<RouteHistoryItem[]> {
  return mockListHistory()
}
