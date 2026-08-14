/**
 * 길찾기(상담) 기록 API — 화면은 이 함수만 호출한다. (Mock ↔ 실서버 스위칭)
 *
 * BE 실계약 (Gilbut_BE #32/#33, 2026-08-14 확인):
 *      GET    /api/routes/history               최근 이력 목록 (RouteHistoryResponse[])
 *      GET    /api/routes/history/{historyId}   상세 (RouteHistoryDetailResponse)
 *      DELETE /api/routes/history/{historyId}   삭제
 *
 * ⚠️ 실호출 준비는 끝났지만 아직 api/mode.ts 의 FORCED_MOCK 에 'history' 가 있어 Mock 으로 돈다.
 *    BE 는 route 추천을 실제로 서빙할 때만 기록을 저장하므로(saveRecommendation),
 *    route(경사도) 실연동이 켜진 뒤에 FORCED_MOCK 에서 'history' 를 빼야 실데이터가 쌓인다.
 *
 * 🚨 화면용 RouteHistoryItem 으로의 번역은 mapHistory.ts 어댑터가 담당한다.
 */
import { api } from './client'
import { useMock } from './mode'
import type { RouteHistoryItem, RouteHistoryResponse } from '../types/dto'
import { mapHistoryResponse } from './mapHistory'
import { mockListHistory } from '../mock/history'

const USE_MOCK = () => useMock('history')
const HISTORY = '/api/routes/history'

/** 최근 상담 이력 목록 */
export async function listHistory(): Promise<RouteHistoryItem[]> {
  if (USE_MOCK()) return mockListHistory()
  const res = (await api.get<RouteHistoryResponse[]>(HISTORY)) ?? []
  return res.map(mapHistoryResponse)
}

/** 상담 이력 한 건 삭제 (BE #33) */
export async function deleteHistory(historyId: number): Promise<void> {
  if (USE_MOCK()) return
  await api.del<void>(`${HISTORY}/${historyId}`)
}
