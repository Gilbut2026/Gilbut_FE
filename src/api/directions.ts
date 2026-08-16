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
  RouteSegment,
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

/**
 * 탈 것 이름 — TMAP 원문을 사람이 읽는 말로.
 *
 * TMAP 은 노선 이름을 `일반:81` 처럼 준다. 그대로 내보내면 화면에 「일반:81 버스」가
 * 찍히는데(2026-08-16 스크린샷), 어르신이 정류장에서 이 글자를 보고 탈 버스를
 * 알아보기 어렵다. 정류장 전광판에 뜨는 것은 **81** 이다.
 *
 * 그래서 번호를 크게 올리고, 일반/좌석 같은 종류는 아래 설명으로 내린다.
 * 좌석버스는 요금이 다르므로 버리지는 않는다.
 */
function vehicleLabel(leg: TransitLegDto): { title: string; note: string } {
  const raw = leg.routeName?.trim() ?? ''
  const mode = (leg.mode ?? '').toUpperCase()
  const [head, tail] = raw.includes(':') ? raw.split(':') : ['', raw]
  const type = head.trim()
  const name = tail.trim()

  if (mode === 'BUS') {
    return { title: name ? `${name}번 버스` : '버스', note: type ? `${type}버스` : '' }
  }
  if (mode === 'SUBWAY') {
    // 「수도권1호선」처럼 이미 노선 이름이면 '지하철'을 덧붙이지 않는다
    return { title: name || '지하철', note: name.includes('호선') ? '' : '지하철' }
  }
  const label = modeLabel(leg.mode)
  return { title: [name, label].filter(Boolean).join(' ') || '차량 타기', note: '' }
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
  const vehicle = vehicleLabel(leg)
  const from = leg.startName?.trim()
  const stops = leg.stationCount && leg.stationCount > 0 ? `${leg.stationCount}정거장` : ''
  const steps: GuideStep[] = [
    {
      kind: 'ride',
      title: vehicle.title,
      detail:
        [vehicle.note, from ? `${from}에서 타요` : '', stops].filter(Boolean).join(' · ') ||
        undefined,
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
    /*
     * 걷는 길은 **단계 하나가 곧 토막 하나**다.
     * 전체를 한 줄로 그리면 "지금 이 구간"을 짚어줄 수가 없는데, 걷는 길은 마흔 단계가
     * 넘어서 지금 어디를 걷고 있는지가 가장 알기 어렵다. TMAP 이 단계마다 좌표를 주므로
     * 그대로 나눠 둔다.
     */
    const steps: GuideStep[] = []
    const segments: RouteSegment[] = []
    for (const raw of walking.steps ?? []) {
      const step = walkStep(raw)
      if (!step) continue
      const points = toLatLng(raw.points)
      if (points.length >= 2) {
        step.segmentIndex = segments.length
        segments.push({ kind: 'walk', points })
      }
      steps.push(step)
    }
    const path = toLatLng(walking.routePoints)
    if (!steps.length && !path.length) return undefined
    return { steps, path, segments }
  }

  const transit = be.transitRoutes?.routes?.find((r) => r.routeId === routeId)
  if (transit) {
    /*
     * 대중교통은 **구간(leg) 하나가 토막 하나**다 — 걷기와 타기의 경계가 곧 leg 경계다.
     * 한 leg 에서 나온 안내(타기 + 내리기)는 같은 토막을 가리킨다.
     *
     * BE 가 leg 좌표를 안 주면 그 단계에는 토막을 달지 않는다. 그때는 어디까지가
     * 걷기인지 알 수 없으므로 색도 나누지 않는다 — 모르는 것을 아는 척 칠하지 않는다.
     */
    const steps: GuideStep[] = []
    const segments: RouteSegment[] = []
    for (const leg of transit.legs ?? []) {
      const points = toLatLng(leg.routePoints)
      let segmentIndex: number | undefined
      if (points.length >= 2) {
        const isWalk = (leg.mode ?? '').toUpperCase() === 'WALK'
        segmentIndex = segments.length
        /*
         * 노선색은 **지하철에만** 쓴다.
         *
         * 지하철은 「2호선 초록」처럼 색이 곧 노선 이름이라 사람들이 이미 안다.
         * 버스는 다르다 — TMAP 이 주는 색은 노선이 아니라 등급(일반 초록·좌석 파랑)이고,
         * 정류장에서 그 색으로 버스를 찾지는 않는다. 색이 매번 달라지면 오히려
         * "이 색은 무슨 뜻이지"가 되므로 버스는 우리 청색으로 고정한다.
         *
         * BE 는 '53B332' 처럼 # 없이 준다. 값이 이상하면 쓰지 않는다.
         */
        const raw = (leg.routeColor ?? '').trim().replace(/^#/, '')
        const isSubway = (leg.mode ?? '').toUpperCase() === 'SUBWAY'
        const color = isSubway && /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : undefined

        segments.push({
          kind: isWalk ? 'walk' : 'ride',
          mode: leg.mode ?? undefined,
          color: isWalk ? undefined : color,
          points,
          // 정류장은 타는 구간에만 있다. 좌표가 없는 것은 찍을 수 없으니 거른다.
          stops: isWalk
            ? undefined
            : (leg.stops ?? [])
                .filter((s) => s?.latitude != null && s?.longitude != null)
                .map((s) => ({
                  name: s.name ?? null,
                  at: { latitude: s.latitude, longitude: s.longitude },
                })),
        })
      }
      for (const step of transitLeg(leg)) {
        step.segmentIndex = segmentIndex
        steps.push(step)
      }
    }

    const fromLegs = segments.flatMap((s) => s.points)
    const path = fromLegs.length ? fromLegs : toLatLng(transit.routePoints)
    if (!steps.length && !path.length) return undefined
    return { steps, path, segments }
  }

  return undefined
}
