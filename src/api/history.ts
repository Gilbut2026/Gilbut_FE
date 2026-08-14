/**
 * 길찾기 기록 API — 화면은 이 함수만 호출한다.
 *
 * BE 원본 응답은 서버 도메인 기준이고, RouteHistoryItem 은 화면 카드용 모델이다.
 * mapRouteHistoryResponse 가 날짜 문구·배지 라벨 같은 표시값을 만든다.
 *
 * ⚠️ 현재 history 도메인은 api/mode.ts 의 FORCED_MOCK 때문에 Mock 으로 유지된다.
 *    Mock 해제 시 아래 실서버 분기가 그대로 /api/routes/history 를 호출한다.
 *      GET    /api/routes/history               최근 검색 이력 목록  ← listHistory 가 쓸 것
 *      GET    /api/routes/history/{historyId}   상세
 *      DELETE /api/routes/history/{historyId}   삭제
 */
import { api } from './client'
import { useMock } from './mode'
import type { RouteHistoryItem, RouteKey, RouteType, WalkingRouteOption } from '../types/dto'
import { mockListHistory } from '../mock/history'

const USE_MOCK = () => useMock('history')
const HISTORIES = '/api/routes/history'

/** BE GET /api/routes/history 응답 */
export interface RouteHistoryResponse {
  historyId: number
  originName: string
  destinationName: string
  recommendedRouteId: string | null
  recommendedRouteType: RouteType | null
  recommendedRouteOption: WalkingRouteOption | null
  totalTimeSec: number | null
  totalWalkTimeSec: number | null
  totalWalkDistanceM: number | null
  transferCount: number | null
  drtRecommended: boolean
  drtServiceArea: string | null
  createdAt: string
}

const ROUTE_BADGE: Record<RouteKey, { label: string; tone: RouteHistoryItem['badgeTone'] }> = {
  comfort: { label: '편한 길', tone: 'default' },
  short: { label: '보행 최소', tone: 'warn' },
  drt: { label: '똑버스', tone: 'drt' },
  calltaxi: { label: '콜택시', tone: 'drt' },
}

function isSameDate(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

function formatDatePrefix(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (isSameDate(date, today)) return '오늘'
  if (isSameDate(date, yesterday)) return '어제'

  return date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  })
}

function formatHistoryTime(createdAt: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '날짜 미확인'

  const time = date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${formatDatePrefix(date)} ${time}`
}

function routeKeyOf(history: RouteHistoryResponse): RouteKey {
  if (history.drtRecommended) return 'drt'
  if (history.recommendedRouteType === 'TRANSIT') return 'short'
  return 'comfort'
}

/** BE 상담 이력 응답을 HistoryScreen 카드 모델로 변환한다. */
export function mapRouteHistoryResponse(history: RouteHistoryResponse): RouteHistoryItem {
  const routeKey = routeKeyOf(history)
  const badge = ROUTE_BADGE[routeKey]

  return {
    id: history.historyId,
    destination: history.destinationName,
    when: `${formatHistoryTime(history.createdAt)} · ${badge.label}`,
    routeKey,
    badgeLabel: badge.label,
    badgeTone: badge.tone,
  }
}

export function listHistory(): Promise<RouteHistoryItem[]> {
  if (USE_MOCK()) return mockListHistory()
  return api
    .get<RouteHistoryResponse[]>(HISTORIES)
    .then((items) => items.map(mapRouteHistoryResponse))
}

export function deleteHistory(historyId: number): Promise<void> {
  if (USE_MOCK()) return Promise.resolve()
  return api.del<void>(`${HISTORIES}/${historyId}`)
}
