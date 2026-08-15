/**
 * BE 로 보내는 날짜·시각 형식 한 곳.
 *
 * BE 는 departureDateTime 을 자바 LocalDateTime 으로 받는다 — **시간대 정보가 없는 타입**이다.
 * 그래서 두 가지를 하면 안 된다:
 *   1. new Date().toISOString()          → '2026-08-15T08:44:00.000Z' (Z 때문에 파싱 실패)
 *   2. new Date().toISOString().slice(0,19) → '2026-08-15T08:44:00'
 *      파싱은 되지만 **UTC 시각**이라 한국(UTC+9)에서는 9시간 과거가 된다.
 *      이 값이 TMAP 대중교통 조회로 들어가면 엉뚱한 시간표의 경로가 나오고,
 *      챗 출발시각 확정에서는 "과거 시각" 으로 INVALID_REQUEST 가 난다.
 *
 * 그래서 항상 **로컬 시각**을 'YYYY-MM-DDTHH:mm:ss' 로 만들어 보낸다.
 */

/** Date → 'YYYY-MM-DDTHH:mm:ss' (로컬 시각, 시간대 표기 없음) */
export function toLocalDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/**
 * 지금부터 minutes 분 뒤의 출발 시각.
 *
 * minutes=0('지금 바로')이어도 최소 1분 뒤로 보낸다 — BE 챗 확정이
 * "현재 -1분보다 과거면 거절" 이라, 요청이 오가는 사이 과거가 되는 것을 막는다.
 */
export function departureAfter(minutes: number): string {
  return toLocalDateTime(new Date(Date.now() + Math.max(minutes, 1) * 60_000))
}

/**
 * 사람이 적거나 말한 출발 시각을 "지금부터 몇 분 뒤"로 해석한다.
 * 해석 못 하면 null — 부르는 쪽이 되묻는다(멋대로 '지금'으로 처리하면 엉뚱한 경로가 나온다).
 *
 * BE 는 출발 시각을 해석해주지 않는다. /api/chat 의 AI 동작은
 * SEARCH_DESTINATION · SEARCH_NEARBY_PLACE · OUT_OF_SCOPE 셋뿐이라, 시각 해석은 프론트 몫이다.
 */
export function parseDepartureMinutes(text: string): number | null {
  const t = text.replace(/\s/g, '')

  if (/(지금|당장|바로|곧)/.test(t)) return 0
  if (/모레/.test(t)) return 2 * 24 * 60
  if (/내일|다른날/.test(t)) return 24 * 60

  // "30분 뒤" · "1시간 후" · "1시간30분 뒤"
  const hour = t.match(/(\d+)\s*시간/)
  const min = t.match(/(\d+)\s*분/)
  if (hour || min) {
    const h = hour ? Number(hour[1]) : 0
    const m = min ? Number(min[1]) : 0
    const total = h * 60 + m
    if (total > 0) return total
  }

  // "오후 3시" · "15시" — 오늘 그 시각. 이미 지났으면 내일로 넘긴다.
  const clock = t.match(/(오전|오후)?(\d{1,2})시(?:(\d{1,2})분)?/)
  if (clock) {
    let h = Number(clock[2])
    const m = clock[3] ? Number(clock[3]) : 0
    if (clock[1] === '오후' && h < 12) h += 12
    if (clock[1] === '오전' && h === 12) h = 0
    if (h > 23 || m > 59) return null
    const now = new Date()
    const target = new Date(now)
    target.setHours(h, m, 0, 0)
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
    return Math.round((target.getTime() - now.getTime()) / 60_000)
  }

  return null
}
