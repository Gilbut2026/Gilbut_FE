/**
 * BE 경로 상세 → 화면이 읽어줄 길 안내.
 *
 * 여기 있는 것은 전부 **TMAP 이 실제로 준 값**이다. 지어낸 문장이 없다.
 *   · 보행 경로 → 턴바이턴 안내문(instruction) 과 구간 거리
 *   · 대중교통 → 구간(leg) 단위로 "걷기 → 무엇을 타고 몇 정거장 → 어디서 내리기"
 *   · 지도에 그릴 좌표(routePoints)
 *
 * 왜 대중교통은 턴바이턴이 아닌가 — 버스를 타고 가는 동안 "직진 200m"는 아무 의미가 없다.
 * 어르신이 알아야 하는 것은 **어디서 타고 몇 정거장 뒤에 내리는가**다.
 * 그래서 보행 구간만 걷기로 풀고, 차량 구간은 타기/내리기로 묶는다.
 *
 * BE 가 상세를 안 주면 빈 것을 돌려준다. 화면이 "안내를 준비하지 못했어요"로 알린다 —
 * 없는 길을 지어내지 않는다.
 */
import type {
  GuideStep,
  LatLng,
  RoutePointDto,
  RouteDirections,
  RouteRecommendationResult,
  TransitLegDto,
  WalkingStepDto,
} from '../types/dto'

/** "80m" · "1.2km" */
function distanceText(m?: number | null): string {
  if (m == null || m <= 0) return ''
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
}

/** 교통수단 이름 — 모르면 '차' 로 두지 않고 그대로 보여준다 */
function modeLabel(mode?: string | null): string {
  switch ((mode ?? '').toUpperCase()) {
    case 'BUS':
      return '버스'
    case 'SUBWAY':
      return '지하철'
    case 'TRAIN':
      return '기차'
    case 'EXPRESSBUS':
      return '고속버스'
    default:
      return ''
  }
}

function toLatLng(points?: RoutePointDto[] | null): LatLng[] {
  return (points ?? [])
    .filter((p) => p?.latitude != null && p?.longitude != null)
    .map((p) => ({ latitude: p.latitude, longitude: p.longitude }))
}

/** 보행 한 단계 → 안내 한 줄 */
function walkStep(step: WalkingStepDto): GuideStep | null {
  const dist = distanceText(step.distanceM)
  const text = step.instruction?.trim()
  // 안내문도 거리도 없으면 보여줄 것이 없다
  if (!text && !dist) return null
  return {
    kind: 'walk',
    title: text || `${dist} 걷기`,
    detail: text && dist ? dist : undefined,
  }
}

/** 대중교통 한 구간 → 안내 한두 줄 (타기 + 내리기) */
function transitLeg(leg: TransitLegDto): GuideStep[] {
  const dist = distanceText(leg.distanceM)

  // 걷는 구간 — 어디까지 걷는지가 중요하다
  if ((leg.mode ?? '').toUpperCase() === 'WALK') {
    const to = leg.endName?.trim()
    return [
      {
        kind: 'walk',
        title: dist ? `${dist} 걷기` : '걷기',
        detail: to ? `${to}까지` : undefined,
      },
    ]
  }

  // 타는 구간 — 무엇을 어디서 타서 몇 정거장 뒤 어디서 내리는가
  const vehicle = [leg.routeName?.trim(), modeLabel(leg.mode)].filter(Boolean).join(' ')
  const from = leg.startName?.trim()
  const stops = leg.stationCount && leg.stationCount > 0 ? `${leg.stationCount}정거장` : ''
  const steps: GuideStep[] = [
    {
      kind: 'ride',
      title: vehicle || '차량 타기',
      detail: [from ? `${from}에서 타요` : '', stops].filter(Boolean).join(' · ') || undefined,
    },
  ]
  const to = leg.endName?.trim()
  if (to) steps.push({ kind: 'getoff', title: `${to}에서 내려요` })
  return steps
}

/**
 * 이 경로의 안내를 만든다.
 * @param routeId BE 추천 항목의 routeId — 상세는 walkingRoute·transitRoutes 에 같은 id 로 들어 있다
 */
export function buildDirections(
  be: RouteRecommendationResult,
  routeId: string,
): RouteDirections | undefined {
  const walking = be.walkingRoute?.routes?.find((r) => r.routeId === routeId)
  if (walking) {
    const steps = (walking.steps ?? []).map(walkStep).filter((s): s is GuideStep => s !== null)
    const path = toLatLng(walking.routePoints)
    if (!steps.length && !path.length) return undefined
    return { steps, path }
  }

  const transit = be.transitRoutes?.routes?.find((r) => r.routeId === routeId)
  if (transit) {
    const steps = (transit.legs ?? []).flatMap(transitLeg)
    // 구간 좌표를 다 이으면 전체 경로가 된다. 구간별 좌표가 없으면 전체 좌표를 쓴다.
    const fromLegs = (transit.legs ?? []).flatMap((l) => toLatLng(l.routePoints))
    const path = fromLegs.length ? fromLegs : toLatLng(transit.routePoints)
    if (!steps.length && !path.length) return undefined
    return { steps, path }
  }

  return undefined
}
