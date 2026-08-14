/**
 * 상담 이력 어댑터 — BE 실계약(RouteHistoryResponse) → 화면용(RouteHistoryItem) 번역기.
 *
 * BE 는 원본 데이터(초·미터·enum)를 주고, 화면은 사람이 읽을 문구·배지를 원한다.
 * 그 간극을 여기서 메운다. 화면(HistoryScreen)은 손대지 않아도 실데이터가 흐르게 된다.
 */
import type { RouteHistoryItem, RouteHistoryResponse, RouteKey } from '../types/dto'

/** ISO 일시("2026-08-12T14:15:00") → "8월 12일 오후 2:15" (오늘/어제는 그 말로) */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const time = `${ampm} ${h12}:${String(m).padStart(2, '0')}`

  if (sameDay(d, now)) return `오늘 ${time}`
  if (sameDay(d, yesterday)) return `어제 ${time}`
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`
}

/** 초 → "25분" (1시간 넘으면 "1시간 5분") */
function formatDuration(totalSec: number): string {
  const min = Math.max(1, Math.round(totalSec / 60))
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h}시간 ${rest}분` : `${h}시간`
}

/** BE 필드로 배지(라벨·톤)를 만든다. */
function toBadge(r: RouteHistoryResponse): { label: string; tone: 'default' | 'drt' | 'warn' } {
  if (r.drtRecommended) return { label: '똑버스', tone: 'drt' }
  if (r.recommendedRouteOption === 'AVOID_STAIRS') return { label: '계단 적은 길', tone: 'warn' }
  if (r.recommendedRouteType === 'TRANSIT') return { label: '대중교통', tone: 'default' }
  return { label: '도보', tone: 'default' }
}

/** 화면이 쓰는 routeKey(현재 표시엔 미사용이나 계약상 필요) 로 환산. */
function toRouteKey(r: RouteHistoryResponse): RouteKey {
  if (r.drtRecommended) return 'drt'
  if (r.recommendedRouteOption === 'AVOID_STAIRS') return 'short'
  return 'comfort'
}

/** BE 이력 한 건 → 화면 카드 한 건 */
export function mapHistoryResponse(r: RouteHistoryResponse): RouteHistoryItem {
  const badge = toBadge(r)
  return {
    id: r.historyId,
    destination: r.destinationName,
    when: `${formatWhen(r.createdAt)} · ${formatDuration(r.totalTimeSec)}`,
    routeKey: toRouteKey(r),
    badgeLabel: badge.label,
    badgeTone: badge.tone,
  }
}
