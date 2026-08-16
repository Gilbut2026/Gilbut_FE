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
 *   4. 편의시설(facilities): 2026-08-15 BE 가 accessibilitySummary(계단·육교·지하보도·횡단보도)를
 *      노출하기 시작해 실제 신호로 채운다. UNKNOWN 은 "확인 불가"로 표시하고 감추지 않는다 —
 *      어르신 대상이라 "정보가 없다"는 사실 자체가 판단에 필요하다.
 *   5. 문구(title·sub)·미니맵: BE 가 안 주는 편집 정보라 아래 CARD_TEXT 템플릿을 유지한다(mock 과 동일 voice).
 *      단 notice 는 BE recommendationReason 이 있으면 그것을 우선한다(사람이 읽는 추천 사유).
 *   6. stairComparison: BE WALKING DEFAULT ↔ AVOID_STAIRS 두 후보로 구성한다. 계단 신호가
 *      노출되면서 "계단 몇 곳" 을 실제로 채울 수 있게 됐다.
 *      계단을 '조금 어려움'으로 답한 분에게만 물어보는 화면이라(7/31 회의), 두 후보가
 *      모두 있을 때만 만든다. 하나뿐이면 비교할 것이 없어 null 이다.
 */
import { buildDirections } from './directions'
import type {
  AccessibilitySignal,
  DrtGuideResponse,
  FilteredRouteDto,
  RouteFacility,
  RouteFilterCode,
  RouteKey,
  RouteOption,
  RouteRecommendationItemDto,
  RouteRecommendationResult,
  RouteResult,
  StairComparison,
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

/**
 * 접근성 신호 한 줄 → 화면 편의시설 한 줄.
 * PRESENT 는 어르신에게 부담 요소라 'warn', ABSENT 는 'ok', UNKNOWN 은 'info'(확인 불가)로 둔다.
 * 신호 자체가 없으면(null) 줄을 만들지 않는다.
 */
function facilityFromSignal(label: string, signal: AccessibilitySignal | null): RouteFacility | null {
  if (!signal) return null
  if (signal.state === 'UNKNOWN') return { status: 'info', label, value: '확인 불가' }
  if (signal.state === 'ABSENT') return { status: 'ok', label, value: '없음' }
  // PRESENT — count 가 오면 개수까지 보여준다(0 이어도 서버가 PRESENT 라 했으면 '있음'으로 남긴다)
  return { status: 'warn', label, value: signal.count ? `${signal.count}곳` : '있음' }
}

/** BE 지표 + 접근성 신호로 편의시설 목록을 만든다 (위 주석 4). */
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

  // 접근성 신호 — 계단·육교·지하보도·횡단보도 (2026-08-15 BE 노출)
  const a = item.accessibilitySummary
  if (a) {
    for (const row of [
      facilityFromSignal('계단', a.stair),
      facilityFromSignal('육교', a.overpass),
      facilityFromSignal('지하보도', a.underpass),
      facilityFromSignal('횡단보도', a.crosswalk),
    ]) {
      if (row) rows.push(row)
    }
  }
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

/**
 * 계단 있는 길 ↔ 없는 길 비교 구성.
 * BE 는 보행 경로를 DEFAULT(계단 허용)와 AVOID_STAIRS(계단 회피) 두 갈래로 뽑아준다.
 * 둘 다 있을 때만 비교가 성립한다 — 하나뿐이면 고를 것이 없다.
 */
function buildStairComparison(items: RouteRecommendationItemDto[]): StairComparison | null {
  const withStairs = items.find(
    (i) => i.candidate.routeType === 'WALKING' && i.candidate.routeOption === 'DEFAULT',
  )
  const noStairs = items.find(
    (i) => i.candidate.routeType === 'WALKING' && i.candidate.routeOption === 'AVOID_STAIRS',
  )
  if (!withStairs || !noStairs) return null

  const toOption = (i: RouteRecommendationItemDto) => ({
    minutes: toMinutes(i.candidate.metrics.totalTimeSec),
    walkMinutes: toMinutes(i.candidate.metrics.totalWalkTimeSec),
    meters: i.candidate.metrics.totalWalkDistanceM,
  })

  // 계단이 몇 곳인지 BE 접근성 신호에서 가져온다. 모르면 숫자를 지어내지 않는다.
  const stair = withStairs.accessibilitySummary?.stair
  const stairFact =
    stair?.state === 'PRESENT' && stair.count
      ? `계단 ${stair.count}곳을 지나요`
      : stair?.state === 'PRESENT'
        ? '계단을 지나요'
        : '계단 정보는 확인되지 않았어요'

  return {
    withStairs: { ...toOption(withStairs), stairFact },
    noStairs: toOption(noStairs),
  }
}

/** 추천 후보 1건 → 카드 1장 (지표·사유는 BE 값, 나머지 문구는 템플릿). */
/**
 * 두 번째 길에 붙일 이름 — **사실인 것만** 적는다.
 *
 * 어르신에게 「걷기 적은 길」은 몸이 덜 힘들다는 약속이다. 1분 덜 걷는 길에
 * 그렇게 적으면 지키지 못할 약속이 된다. 그래서 차이가 뚜렷할 때만 그 이름을 쓴다.
 *
 * 기준은 **걷는 시간 3분** 또는 **걷는 거리 200m**. 3분은 신호등 한 번 더 기다리는
 * 정도이고, 200m 는 버스 한 정거장 남짓이다 — 그쯤 되어야 사람이 체감한다.
 */
function secondLabel(
  first: RouteRecommendationItemDto | undefined,
  second: RouteRecommendationItemDto,
): { title: string; sub: string } | undefined {
  if (!first) return undefined
  const a = first.candidate.metrics
  const b = second.candidate.metrics

  const walkGap = a.totalWalkTimeSec - b.totalWalkTimeSec
  const distGap = a.totalWalkDistanceM - b.totalWalkDistanceM
  // 기본 문구(걷기 적은 길)를 그대로 쓴다
  if (walkGap >= 180 || distGap >= 200) return undefined

  const timeGap = a.totalTimeSec - b.totalTimeSec
  if (timeGap >= 180) {
    return { title: '빠른 길', sub: '걷는 양은 비슷하지만 더 일찍 도착하는 경로' }
  }
  return { title: '다른 길', sub: '걷는 양과 걸리는 시간이 비슷한 또 다른 경로' }
}

function itemToOption(
  item: RouteRecommendationItemDto,
  key: RouteKey,
  be: RouteRecommendationResult,
  /** 기본 문구 대신 쓸 이름 — 「걷기 적은 길」이 사실이 아닐 때 바꾼다 */
  label?: { title: string; sub: string },
): RouteOption {
  const m = item.candidate.metrics
  const text = CARD_TEXT[key]
  return {
    key,
    title: label?.title ?? text.title,
    sub: label?.sub ?? text.sub,
    time: formatTime(m.totalTimeSec),
    walk: formatWalk(m.totalWalkTimeSec),
    transfer: formatTransfer(m.transferCount),
    facilities: facilitiesFromMetrics(item),
    // BE 가 추천 사유를 주면 그것이 템플릿 문구보다 정확하다(실제 경로를 보고 쓴 문장이므로)
    notice: item.recommendationReason?.trim() || text.notice,
    guide: 'navigate',
    // 길 안내 상세 — TMAP 이 준 안내문과 좌표. 없으면 안내 화면이 그렇다고 알린다
    directions: buildDirections(be, item.routeId),
  }
}

/**
 * DRT/콜택시 카드 — 시간·환승 지표는 BE 가 주지 않으므로 템플릿 값이다.
 * 단 똑버스는 2026-08-15 부터 drtGuide 로 권역명·대표번호·이용가능 여부가 내려오므로 실값을 쓴다.
 * (콜택시 안내 대상이면 BE 가 권역을 조회하지 않아 guide 가 null 이다 → 템플릿 유지)
 */
function drtOption(key: 'drt' | 'calltaxi', guide: DrtGuideResponse | null): RouteOption {
  const text = CARD_TEXT[key]
  const isTaxi = key === 'calltaxi'

  const facilities: RouteFacility[] = isTaxi
    ? [
        { status: 'ok', label: '휠체어 탑승', value: '가능' },
        { status: 'info', label: '대기시간', value: '콜센터 확인' },
        { status: 'warn', label: '예약', value: '전화로만 가능' },
      ]
    : [
        {
          // 권역 밖이면 똑버스를 못 타므로 경고로 올린다
          status: guide?.availability === 'OUT_OF_SERVICE_AREA' ? 'warn' : 'ok',
          label: '운행 구역',
          value:
            guide?.availability === 'OUT_OF_SERVICE_AREA'
              ? '운행 구역 밖'
              : guide?.serviceAreaName || '포함 확인',
        },
        // 대표번호가 오면 자리표시자 대신 실제 번호를 보여준다
        guide?.contactNumber
          ? { status: 'ok', label: '예약 전화', value: guide.contactNumber }
          : { status: 'info', label: '대기시간', value: '기관 확인' },
        { status: 'warn', label: '배차', value: '예약 후 확정' },
      ]

  return {
    key,
    title: !isTaxi && guide?.serviceName ? `${guide.serviceName} 이용 추천` : text.title,
    sub: text.sub,
    time: '예약 후 확정',
    // 똑버스는 예약 전까지 어디서 타는지 정해지지 않는다 — 걷는 시간을 알 수 없다.
    // 여기 '4분'이 하드코딩돼 있었다(2026-08-16). 모르는 것을 아는 척하면 안 된다.
    // 콜택시는 집 앞에서 타므로 걷지 않는 것이 맞다.
    walk: isTaxi ? '0분' : '예약 후 확정',
    transfer: '없음',
    facilities,
    notice: (!isTaxi && guide?.message?.trim()) || text.notice,
    guide: key,
  }
}

/**
 * BE 추천 응답 → 화면 RouteResult.
 * @param be   POST /api/routes/recommendations 응답 (봉투 해제 후 data)
 * @param ctx  목적지·출발지 표시 이름 (BE 응답이 아니라 화면 흐름에서 온다)
 */
/**
 * 제외 사유 코드를 중복 없이 모은다.
 *
 * 사용자에게 "길을 못 찾았어요"만 말하면 다음에 무엇을 해야 할지 알 수 없다.
 * BE·AI 는 왜 걸렀는지 알고 있다(filteredResults). 그걸 그대로 옮긴다.
 */
function filterReasons(filtered: FilteredRouteDto[] | null): RouteFilterCode[] {
  const seen = new Set<RouteFilterCode>()
  for (const f of filtered ?? []) {
    for (const code of f.filterCodes ?? []) seen.add(code)
  }
  return [...seen]
}

export function mapRecommendationToRouteResult(
  be: RouteRecommendationResult,
  ctx: RouteDisplayContext,
): RouteResult {
  // 후보가 전부 Hard Filter 에 걸리면 BE 가 recommendations 를 비우거나 null 로 줄 수 있다.
  // 그대로 펼치면 TypeError 로 화면이 죽으므로, 빈 배열로 받아 '갈 수 있는 길 없음' 안내로 흘린다.
  const ranked = [...(be.recommendations ?? [])].sort((a, b) => a.rank - b.rank)

  const options: RouteOption[] = []

  // 1. rank 1 → 가장 편한 길
  const comfortItem = ranked[0]
  if (comfortItem) options.push(itemToOption(comfortItem, 'comfort', be))

  /*
   * 2. 두 번째 길 — 나머지 중 걷는 시간이 가장 짧은 것.
   *
   * 이름은 **실제로 덜 걸을 때만** 「걷기 적은 길」이라고 붙인다.
   * 1분 덜 걷는 길에 그렇게 적으면 고른 사람이 속았다고 느낀다. 어르신에게
   * 「걷기 적은」은 몸이 덜 힘들다는 약속이라, 차이가 없으면 지키지 못한 약속이 된다.
   * 차이가 크지 않으면 더 빠른지 보고 「빠른 길」, 그것도 아니면 그냥 「다른 길」이다.
   */
  const rest = ranked.slice(1)
  const shortItem = rest.reduce<RouteRecommendationItemDto | null>((best, cur) => {
    if (!best) return cur
    return cur.candidate.metrics.totalWalkTimeSec < best.candidate.metrics.totalWalkTimeSec ? cur : best
  }, null)
  if (shortItem) {
    options.push(itemToOption(shortItem, 'short', be, secondLabel(comfortItem, shortItem)))
  }

  /*
   * 3. 똑버스 / 콜택시
   *
   * drtDecision.show 만 보면 안 된다. 그건 "이 사람에게 권할 만한가"(보조기구를
   * 쓰신다 등)이고, 실제로 **탈 수 있는가**는 drtGuide 가 따로 말해준다.
   *
   * 실제로 어긋난 응답이 있었다(2026-08-16 수원시청 → 아주대병원).
   *   drtDecision.show = true              ← 권할 만하다
   *   drtGuide.show    = false             ← 그런데 못 탄다
   *   availability     = OUT_OF_SERVICE_AREA
   *   message          = "출발지와 도착지가 같은 똑버스 운행 권역에 포함되지 않아요."
   *
   * 그대로 카드를 냈더니 「똑버스 이용 방법 보기」를 눌러도 "운행 구역 밖"만 나왔다.
   * 못 타는 것을 후보로 내놓으면 고를 수 있는 것처럼 보여서 시간만 뺏는다.
   * BE 가 안 된다고 말해주는데 무시할 이유가 없다.
   *
   * 콜택시(taxiGuide)는 권역 개념이 없어 이 판정에서 뺀다 — 전화로 부르는 것이다.
   */
  const drt = be.drtDecision
  /*
   * **taxiGuide 를 show 보다 먼저 본다.**
   *
   * AI 가 show=false · taxiGuide=true 로 내려주는 경우가 있다(BE 확인, 2026-08-16).
   * show 를 먼저 보면 그때 카드가 통째로 사라져서, 휠체어를 쓰시는 분에게
   * **콜택시 안내가 아예 안 나온다.** 휠체어는 똑버스를 못 타므로(7/31 회의)
   * 콜택시가 유일한 선택지인데 그것이 사라지는 것이라 그냥 불편한 정도가 아니다.
   */
  let drtKey: 'drt' | 'calltaxi' | null = drt?.taxiGuide ? 'calltaxi' : drt?.show ? 'drt' : null
  if (drtKey === 'drt') {
    const guide = be.drtGuide
    const usable = guide == null || (guide.show !== false && guide.availability !== 'OUT_OF_SERVICE_AREA')
    if (!usable) drtKey = null
  }
  if (drtKey) options.push(drtOption(drtKey, be.drtGuide ?? null))

  // 4. 오늘 추천 — DRT 우선추천이면 그쪽, 아니면 가장 편한 길
  const recommendedKey: RouteKey =
    drtKey && drt?.priority ? drtKey : (options[0]?.key ?? 'comfort')

  return {
    destination: ctx.destination,
    origin: ctx.origin,
    options,
    // 왜 길이 줄었는지 설명할 수 있게 제외 사유를 함께 넘긴다
    filteredReasons: filterReasons(be.filteredResults),
    recommendedKey,
    // 계단 있는 길 ↔ 없는 길. 두 후보가 다 있을 때만 물어본다(위 주석 6).
    stairComparison: buildStairComparison(ranked),
    // 똑버스·콜택시 안내 화면이 자리표시자 대신 실제 값을 쓰도록 함께 넘긴다
    drtGuide: be.drtGuide ?? null,
    drtReasons: drt?.reasonCodes ?? [],
  }
}
