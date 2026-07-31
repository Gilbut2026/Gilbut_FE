/** Mock 길찾기 기록 — BE RouteSearchHistory 컨트롤러 미구현(🟡)이라 정적 데모. */
import type { RouteHistoryItem } from '../types/dto'
import { delay } from './_shared'

const ITEMS: RouteHistoryItem[] = [
  { id: 1, destination: '○○병원', when: '오늘 오전 9:40 · 가장 편한 길', routeKey: 'comfort', badgeLabel: '편한 길', badgeTone: 'default' },
  { id: 2, destination: '전통시장', when: '어제 오후 2:15 · 똑버스 문의', routeKey: 'drt', badgeLabel: '똑버스', badgeTone: 'drt' },
  { id: 3, destination: '주민센터', when: '7월 8일 오전 11:02 · 걷기 적은 길', routeKey: 'short', badgeLabel: '보행 최소', badgeTone: 'warn' },
]

export function mockListHistory(): Promise<RouteHistoryItem[]> {
  return delay(ITEMS)
}
