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

/*
 * ── 걷는 길 묶기 ──────────────────────────────────────────────────────────
 *
 * TMAP 이 준 단계를 그대로 한 줄씩 보여주면 너무 잘게 끊긴다.
 * 실제 응답(수원시청→아주대 3.3km, 2026-08-17 확인)은 40단계였고 이랬다.
 *
 *     15m  횡단보도 후 보행자도로를 따라 15m 이동
 *    119m  직진 후 권광로를 따라 119m 이동
 *     10m  횡단보도 후 보행자도로를 따라 10m 이동
 *    261m  직진 후 권광로를 따라 261m 이동
 *
 * 세 가지가 겹쳐 있다.
 *   · 횡단보도가 매번 제 줄을 차지한다(40 중 18개). 늘 「횡단보도 10m」+「직진 261m」
 *     쌍으로 오므로, 한 번에 알아야 할 것이 항상 두 줄로 갈라진다.
 *   · 4m·5m·8m 짜리 단계가 한 줄씩 있다 — 세 걸음이다.
 *   · TMAP 이 같은 안내문을 연달아 준다. 7·8번이 둘 다 「…좌회전 후 효원로를 따라
 *     14m 이동」인데 실제 거리는 14m 와 149m 다. 같은 문장이 두 줄 뜨면 어르신은
 *     두 번 꺾으라는 말로 읽는다.
 *
 * 그래서 **꺾는 곳에서만 새 안내를 시작하고** 사이의 직진·횡단보도는 그 안으로 넣는다.
 * 회전과 계단·육교·지하보도는 절대 넣지 않는다 — 어르신께 가장 중요한 것이라
 * 사라지면 안 된다. 한 묶음이 길어지면(GROUP_MAX_M) 거기서 끊는다. 지금 어디쯤인지
 * 짚어주지 못할 만큼 길어지면 묶은 뜻이 없다.
 *
 * 위 40단계가 13단계가 된다.
 */

/** TMAP turnType — 꺾는 곳. 여기서 새 안내가 시작된다 */
const TURN_ACTION: Record<number, string> = {
  12: '좌회전',
  13: '우회전',
  14: '유턴',
  16: '8시 방향 좌회전',
  17: '10시 방향 좌회전',
  18: '2시 방향 우회전',
  19: '4시 방향 우회전',
}

/** 어르신께 가장 중요한 것들 — 흡수하지 않고 반드시 제 줄을 준다 */
const FACILITY_ACTION: Record<number, string> = {
  125: '육교를 지나',
  126: '지하보도를 지나',
  127: '계단을 지나',
  128: '경사로를 지나',
  129: '계단을 지나',
}

/** 211 직진 횡단보도 · 212 좌측 · 213 우측 */
const CROSSWALK = new Set([211, 212, 213])

/** 이만큼 걸으면 끊는다 — 더 길면 "지금 이 구간"을 짚어줄 수 없다 */
const GROUP_MAX_M = 300
/** 이보다 짧은 자투리는 제 줄을 갖지 않는다 */
const GROUP_MIN_M = 50

interface WalkGroup {
  /** 이 묶음이 무엇을 하라는 것인지는 첫 단계가 정한다 */
  head: WalkingStepDto
  steps: WalkingStepDto[]
}

function groupMeters(g: WalkGroup): number {
  return g.steps.reduce((sum, s) => sum + (s.distanceM ?? 0), 0)
}

function startsNewGroup(step: WalkingStepDto): boolean {
  const turn = step.turnType ?? 0
  return turn in TURN_ACTION || turn in FACILITY_ACTION
}

function groupWalkSteps(raw: WalkingStepDto[]): WalkGroup[] {
  const groups: WalkGroup[] = []

  for (const s of raw) {
    const last = groups[groups.length - 1]
    if (!last) {
      groups.push({ head: s, steps: [s] })
      continue
    }
    // 앞과 똑같은 안내문이면 TMAP 이 되풀이한 것이다 — 한 줄로 둔다
    const repeated = s.instruction != null && s.instruction === last.head.instruction
    if (!repeated && (startsNewGroup(s) || groupMeters(last) >= GROUP_MAX_M)) {
      groups.push({ head: s, steps: [s] })
    } else {
      last.steps.push(s)
    }
  }

  /*
   * 자투리를 앞 묶음에 붙인다. 붙일 때 **받는 쪽의 머리를 그대로 둔다** —
   * 자투리에는 꺾는 말이 없으니 잃을 것이 없지만, 받는 쪽의 머리를 자투리 것으로
   * 바꾸면 어디서 꺾어야 하는지가 사라진다.
   */
  const merged: WalkGroup[] = []
  for (const g of groups) {
    const prev = merged[merged.length - 1]
    if (prev && !startsNewGroup(g.head) && groupMeters(g) < GROUP_MIN_M) {
      prev.steps.push(...g.steps)
      continue
    }
    merged.push(g)
  }

  // 첫 묶음이 자투리면 앞이 없으니 뒤에 붙인다. 머리는 뒤엣것을 쓴다.
  const first = merged[0]
  if (merged.length > 1 && first && !startsNewGroup(first.head) && groupMeters(first) < GROUP_MIN_M) {
    merged[1].steps.unshift(...first.steps)
    merged.shift()
  }

  return merged
}

/** 안내문에 들어 있는 길 이름 — 「효원로를 따라」의 효원로. 없으면 빈 문자열 */
function roadName(g: WalkGroup): string {
  const longestFirst = [...g.steps].sort((a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0))
  for (const s of longestFirst) {
    const m = s.instruction?.match(/([가-힣A-Za-z0-9]+(?:로|길))[을를] 따라/)
    // 「보행자도로」는 길 이름이 아니다 — 어디를 걷는지 알려주지 못한다
    if (m && m[1] !== '보행자도로' && m[1] !== '자전거도로') return m[1]
  }
  return ''
}

/**
 * 「우리은행 수원시청역지점에서 좌회전」의 앞부분.
 * 어르신은 길 이름보다 눈에 보이는 건물로 길을 찾으신다 — 있으면 살린다.
 */
function landmark(step: WalkingStepDto): string {
  const m = step.instruction?.match(/^(.{2,20}?)에서 /)
  return m ? m[1] : ''
}

/** 묶음 하나 → 안내 한 줄 */
function walkGroupStep(g: WalkGroup): GuideStep | null {
  const turn = g.head.turnType ?? 0
  const action = FACILITY_ACTION[turn] ?? (TURN_ACTION[turn] ? `${TURN_ACTION[turn]} 후` : '')
  const dist = distanceText(groupMeters(g))
  const road = roadName(g)
  const where = landmark(g.head)

  // 보여줄 것이 아무것도 없으면 줄을 만들지 않는다
  if (!dist && !action && !road && !where) return null

  const via = road ? `${road}${road.endsWith('길') ? '을' : '를'} 따라` : ''
  const cross = !action && CROSSWALK.has(turn) ? '횡단보도를 건너' : ''
  const title = [where ? `${where}에서` : '', action, cross, via, dist ? `${dist} 걷기` : '걷기']
    .filter(Boolean)
    .join(' ')

  // 몇 번을 건너는지는 남긴다. 머리가 이미 횡단보도인데 한 곳뿐이면 되풀이일 뿐이다.
  const crossings = g.steps.filter((s) => CROSSWALK.has(s.turnType ?? 0)).length
  const detail =
    crossings >= 2 || (crossings === 1 && !CROSSWALK.has(turn))
      ? `횡단보도 ${crossings}곳`
      : undefined

  return { kind: 'walk', title, detail }
}

/** 묶음의 좌표. 단계 경계에서 같은 점이 두 번 들어오므로 한 번만 둔다 */
function groupPoints(g: WalkGroup): LatLng[] {
  const out: LatLng[] = []
  for (const s of g.steps) {
    for (const p of toLatLng(s.points)) {
      const last = out[out.length - 1]
      if (last && last.latitude === p.latitude && last.longitude === p.longitude) continue
      out.push(p)
    }
  }
  return out
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
  // 무엇을 타는지는 타기·내리기 두 단계가 함께 안다 — 내리는 곳 그림도 버스와 지하철이 다르다
  const mode = leg.mode ?? undefined
  const steps: GuideStep[] = [
    {
      kind: 'ride',
      title: vehicle.title,
      detail:
        [vehicle.note, from ? `${from}에서 타요` : '', stops].filter(Boolean).join(' · ') ||
        undefined,
      mode,
    },
  ]
  const to = leg.endName?.trim()
  if (to) steps.push({ kind: 'getoff', title: `${to}에서 내려요`, mode })
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
     * 걷는 길은 **묶음 하나가 곧 토막 하나**다.
     * 전체를 한 줄로 그리면 "지금 이 구간"을 짚어줄 수가 없다. 그렇다고 TMAP 단계를
     * 그대로 쓰면 12m 마다 토막이 바뀌어 깃발이 눈앞에서 옮겨다닌다.
     * 안내를 묶은 그대로 토막도 묶는다 — 깃발이 「지금 걷는 한 구간의 끝」에 선다.
     */
    const steps: GuideStep[] = []
    const segments: RouteSegment[] = []
    for (const group of groupWalkSteps(walking.steps ?? [])) {
      const step = walkGroupStep(group)
      if (!step) continue
      const points = groupPoints(group)
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
      /*
       * 0m 짜리 걷기는 버린다.
       *
       * 환승할 때 같은 정류장에서 갈아타면 TMAP 이 「0m 걷기」 구간을 하나 끼워 넣는다
       * (실제 응답: legIndex 3, distanceM 0, 좌표 1개). 사람에게는 안내가 아니다 —
       * 「걷기」라고 적힌 단계를 눌렀는데 갈 곳이 없다.
       *
       * 게다가 좌표가 하나뿐이라 지도에 그릴 토막도 없다. 그 단계에 머무는 동안
       * 지도가 「강조할 구간이 없음」 상태가 되어 다른 구간들의 모양까지 달라졌다
       * (2026-08-16 — 걷는 구간의 점 크기·모양이 앞뒤로 다르게 보이던 원인).
       */
      const isWalkLeg = (leg.mode ?? '').toUpperCase() === 'WALK'
      // 거리를 **0 이라고 말해준 경우**만 버린다. 값이 없는 것(null)은 모른다는 뜻이지
      // 0 이라는 뜻이 아니다 — 그걸 버리면 멀쩡한 걷기 구간이 사라진다.
      if (isWalkLeg && leg.distanceM != null && leg.distanceM <= 0) continue
      const points = toLatLng(leg.routePoints)
      let segmentIndex: number | undefined
      if (points.length >= 2) {
        const isWalk = isWalkLeg
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
