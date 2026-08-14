/**
 * 번역 어댑터 — BE 「맞춤 경로 추천」 응답(RouteRecommendationResult) → 화면용 RouteResult.
 *
 * 왜 필요한가: BE 는 "점수 매긴 경로 후보들"(시간·거리·환승·rank·drtDecision)만 준다.
 * 화면(ResultsScreen)은 "편집형 4카드"(가장 편한 길·걷기 적은 길·똑버스/콜택시)에 사람이 읽는
 * 문구·편의시설·미니맵을 기대한다. 이 함수가 그 사이를 번역한다.
 *
 * ⚠️ 아직 실호출은 하지 않는다 — api/mode.ts 의 FORCED_MOCK 에 'route' 가 들어 있어 화면은 mock 이다.
 *    스위치를 뺄 때 api/route.ts 의 getRoutes 가 실호출 결과를 이 함수에 통과시키면 된다.
 *
 * 🚨 확정 필요한 "판단" (BE 응답 ↔ 4카드는 1:1 이 아니라, 아래 규칙은 협의 후 조정):
 *   1. 카드 배정: rank 1 → '가장 편한 길'(comfort). 나머지 중 걷는 시간이 가장 짧은 후보 → '걷기 적은 길'(short).
 *   2. DRT/콜택시: drtDecision.show=true 면 카드 추가. taxiGuide=true → 콜택시, 아니면 똑버스.
 *   3. 오늘 추천(recommendedKey): drtDecision.priority=true & DRT 노출 시 그쪽, 아니면 comfort.
 *   4. 편의시설(facilities): BE 추천 응답엔 경로별 접근성 신호(계단·육교·지하보도)가 노출되지 않는다
 *      (RouteCandidate.walkSegments 가 @JsonIgnore). 그래서 지금은 지표(보행거리·환승)만 정확히 채우고
 *      계단/육교 등 상세는 뺀다. BE 가 신호를 노출하면 여기서 채운다.
 *   5. 문구(title·sub·notice)·미니맵: BE 가 안 주는 편집 정보라 아래 CARD_TEXT 템플릿을 유지한다(mock 과 동일 voice).
 *   6. stairComparison: BE WALKING DEFAULT ↔ AVOID_STAIRS 두 후보가 이에 해당하지만, 계단 상세(stairFact)가
 *      응답에 없어 지금은 null. 접근성 신호가 노출되면 그때 두 후보로 구성한다.
 */
import type {
  RouteFacility,
  RouteKey,
  RouteOption,
  RouteRecommendationItemDto,
  RouteRecommendationResult,
  RouteResult,
} from '../types/dto'

/** 목적지·출발지 이름은 BE 응답이 아니라 화면 흐름(대화/좌표해석)에서 온다 → 어댑터에 함께 넘긴다. */
export interface RouteDisplayContext {
  destination: string
  origin: string
}

/** 카드별 편집 문구 템플릿 — BE 가 안 주는 값이라 프론트가 유지 (mock/route.ts 와 같은 voice). */
const CARD_TEXT: Record<RouteKey, { title: string; sub: string; notice: string }> = {
  comfort: {
    title: '가장 편한 길',
    sub: '계단과 육교를 피해 걷는 부담을 줄인 경로',
    notice: '계단·육교·지하보도·횡단보도는 확인된 정보예요. 쉼터는 점수에 넣지 않고 지도에 표시만 해요.',
  },
  short: {
    title: '걷기 적은 길',
    sub: '걷는 시간은 줄이고 대중교통 환승을 늘린 경로',
    notice: '걷는 시간이 짧은 대신 환승이 늘 수 있어요.',
  },
  drt: {
    title: '똑버스 이용 추천',
    sub: '보행 부담을 줄이고 예약 차량으로 이동하는 방법',
    notice: '실제 배차 가능 여부와 대기시간은 운영기관에서 최종 확인해야 해요.',
  },
  calltaxi: {
    title: '장애인 콜택시 안내',
    sub: '휠체어를 탄 채로 탈 수 있는 차량을 전화로 부르는 방법',
    notice: '이용 대상과 요금, 대기시간은 콜센터에서 확인해 주세요.',
  },
}

/** 초 → "분" (반올림) */
const toMinutes = (sec: number): number => Math.max(0, Math.round(sec / 60))
const formatTime = (sec: number): string => `약 ${toMinutes(sec)}분`
const formatWalk = (sec: number): string => `${toMinutes(sec)}분`
const formatTransfer = (count: number): string => (count <= 0 ? '없음' : `${count}회`)

/** BE 지표에서 안전하게 채울 수 있는 편의시설만 만든다 (접근성 상세는 BE 미노출 → 제외, 위 주석 4). */
function facilitiesFromMetrics(item: RouteRecommendationItemDto): RouteFacility[] {
  const m = item.candidate.metrics
  const rows: RouteFacility[] = [
    { status: 'ok', label: '보행거리', value: `${m.totalWalkDistanceM.toLocaleString()}m` },
    {
      status: m.transferCount > 0 ? 'info' : 'ok',
      label: '환승',
      value: formatTransfer(m.transferCount),
    },
  ]
  // 경사 계산이 실제로 돌았을 때만(NOT_REQUESTED 아니면) 최대 오르막 경사를 참고로 보여준다.
  const slope = item.slopeSummary
  if (slope && slope.status !== 'NOT_REQUESTED' && slope.maxUphillGradePercent != null) {
    rows.push({
      status: slope.maxUphillGradePercent >= 7 ? 'warn' : 'info',
      label: '최대 오르막',
      value: `${slope.maxUphillGradePercent.toFixed(1)}%`,
    })
  }
  return rows
}

/** 추천 후보 1건 → 카드 1장 (지표는 BE 값, 문구는 템플릿). */
function itemToOption(item: RouteRecommendationItemDto, key: RouteKey): RouteOption {
  const m = item.candidate.metrics
  const text = CARD_TEXT[key]
  return {
    key,
    title: text.title,
    sub: text.sub,
    time: formatTime(m.totalTimeSec),
    walk: formatWalk(m.totalWalkTimeSec),
    transfer: formatTransfer(m.transferCount),
    facilities: facilitiesFromMetrics(item),
    notice: text.notice,
    guide: 'navigate',
  }
}

/** DRT/콜택시 카드 — BE 가 지표를 주지 않으므로 템플릿 값으로 구성. */
function drtOption(key: 'drt' | 'calltaxi'): RouteOption {
  const text = CARD_TEXT[key]
  const isTaxi = key === 'calltaxi'
  return {
    key,
    title: text.title,
    sub: text.sub,
    time: '예약 후 확정',
    walk: isTaxi ? '0분' : '4분',
    transfer: '없음',
    facilities: isTaxi
      ? [
          { status: 'ok', label: '휠체어 탑승', value: '가능' },
          { status: 'info', label: '대기시간', value: '콜센터 확인' },
          { status: 'warn', label: '예약', value: '전화로만 가능' },
        ]
      : [
          { status: 'ok', label: '운행 구역', value: '포함 확인' },
          { status: 'info', label: '대기시간', value: '기관 확인' },
          { status: 'warn', label: '배차', value: '예약 후 확정' },
        ],
    notice: text.notice,
    guide: key,
  }
}

/**
 * BE 추천 응답 → 화면 RouteResult.
 * @param be   POST /api/routes/recommendations 응답 (봉투 해제 후 data)
 * @param ctx  목적지·출발지 표시 이름 (BE 응답이 아니라 화면 흐름에서 온다)
 */
export function mapRecommendationToRouteResult(
  be: RouteRecommendationResult,
  ctx: RouteDisplayContext,
): RouteResult {
  const ranked = [...be.recommendations].sort((a, b) => a.rank - b.rank)

  const options: RouteOption[] = []

  // 1. rank 1 → 가장 편한 길
  const comfortItem = ranked[0]
  if (comfortItem) options.push(itemToOption(comfortItem, 'comfort'))

  // 2. 나머지 중 걷는 시간이 가장 짧은 후보 → 걷기 적은 길
  const rest = ranked.slice(1)
  const shortItem = rest.reduce<RouteRecommendationItemDto | null>((best, cur) => {
    if (!best) return cur
    return cur.candidate.metrics.totalWalkTimeSec < best.candidate.metrics.totalWalkTimeSec ? cur : best
  }, null)
  if (shortItem) options.push(itemToOption(shortItem, 'short'))

  // 3. DRT/콜택시 (drtDecision.show 일 때만)
  const drt = be.drtDecision
  const drtKey: 'drt' | 'calltaxi' | null = drt?.show ? (drt.taxiGuide ? 'calltaxi' : 'drt') : null
  if (drtKey) options.push(drtOption(drtKey))

  // 4. 오늘 추천 — DRT 우선추천이면 그쪽, 아니면 가장 편한 길
  const recommendedKey: RouteKey =
    drtKey && drt?.priority ? drtKey : (options[0]?.key ?? 'comfort')

  return {
    destination: ctx.destination,
    origin: ctx.origin,
    options,
    recommendedKey,
    // 🚨 위 주석 6 — 접근성 신호가 응답에 노출되면 DEFAULT↔AVOID_STAIRS 두 후보로 구성한다.
    stairComparison: null,
  }
}
