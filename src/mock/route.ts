/**
 * Mock 경로 추천 — 7차 와이어프레임 routeData 를 그대로 옮김.
 * BE 경로추천 엔드포인트는 아직 미구현(🟡)이라 당분간 이 Mock 만 사용한다.
 *
 * 7/31 회의 반영
 *  · 쉼터는 스코어링 요소에서 빼고 "가는 길 지도에 표시"만 한다 → facility status 를 info 로 낮추고
 *    미니맵에 쉼터 마커를 그린다.
 *  · 계단 회피 경로와 계단 포함 경로를 모두 후보로 내려보내, 우회 거리·시간을 사용자가 직접 비교하게 한다.
 *  · 수원 똑버스는 휠체어 탑승 불가 → 휠체어 이용자에게는 똑버스 대신 장애인 콜택시 안내를 노출한다.
 * 시설 데이터 기준: 계단·육교·지하보도·횡단보도 = TMAP 확인 가능, 엘리베이터·경사 = 제외.
 */
import type {
  LatLng,
  RouteDirections,
  RouteKey,
  RouteOption,
  RouteResult,
  StairComparison,
} from '../types/dto'
import { delay } from './_shared'
import { mockGetMobilityProfile } from './user'

/**
 * Mock 길 안내 — 수원시청 → 아주대학교병원.
 *
 * 좌표는 두 지점을 잇는 대략의 선이다. **실제 TMAP 경로가 아니다.**
 * 실서버에서는 BE 가 준 routePoints 를 그대로 쓴다(api/directions).
 * 여기 있는 것은 Mock 에서도 안내 화면과 지도가 굴러가게 하려는 최소한의 자료다 —
 * 화면 배치·글자 크기를 API 호출 없이 다듬으려면 이만큼은 있어야 한다.
 *
 * 시연 안전판(ScriptedChatScreen)으로 돌 때도 길 안내까지 보여줄 수 있게 된다.
 */
const MOCK_PATH: LatLng[] = [
  { latitude: 37.2636, longitude: 127.0286 },
  { latitude: 37.2661, longitude: 127.0312 },
  { latitude: 37.2698, longitude: 127.0345 },
  { latitude: 37.2724, longitude: 127.0371 },
  { latitude: 37.2753, longitude: 127.0398 },
  { latitude: 37.2776, longitude: 127.0421 },
  { latitude: 37.2794, longitude: 127.0436 },
]

/** 대중교통 경로 안내 — 걷기 → 타기 → 내리기 → 걷기 */
const MOCK_TRANSIT_DIRECTIONS: RouteDirections = {
  path: MOCK_PATH,
  steps: [
    { kind: 'walk', title: '350m 걷기', detail: '수원시청 정류장까지' },
    { kind: 'ride', title: '3-1번 버스', detail: '수원시청에서 타요 · 6정거장' },
    { kind: 'getoff', title: '아주대학교병원에서 내려요' },
    { kind: 'walk', title: '200m 걷기', detail: '아주대학교병원 정문까지' },
  ],
  // 앞뒤로 걷고 가운데를 버스로 간다. 토막이 겹치는 점을 공유해야 선이 끊겨 보이지 않는다.
  segments: [
    { kind: 'walk', points: MOCK_PATH.slice(0, 2) },
    { kind: 'ride', mode: 'BUS', points: MOCK_PATH.slice(1, 6) },
    { kind: 'walk', points: MOCK_PATH.slice(5) },
  ],
}

/** 걷는 경로 안내 — TMAP 턴바이턴을 흉내 낸 형태 */
const MOCK_WALK_DIRECTIONS: RouteDirections = {
  path: MOCK_PATH,
  steps: [
    { kind: 'walk', title: '직진', detail: '120m' },
    { kind: 'walk', title: '횡단보도 건너기', detail: '30m' },
    { kind: 'walk', title: '왼쪽으로 돌아 직진', detail: '260m' },
    { kind: 'walk', title: '아주대학교병원 정문 도착', detail: '80m' },
  ],
  segments: [{ kind: 'walk', points: MOCK_PATH }],
}

const COMFORT: RouteOption = {
  key: 'comfort',
  title: '가장 편한 길',
  sub: '계단과 육교를 피해 걷는 부담을 줄인 경로',
  time: '48분',
  walk: '11분',
  transfer: '1회',
  facilities: [
    { status: 'ok', label: '계단', value: '없음 확인' },
    { status: 'ok', label: '육교', value: '없음 확인' },
    { status: 'ok', label: '지하보도', value: '없음 확인' },
    { status: 'ok', label: '횡단보도', value: '2곳 확인' },
    { status: 'ok', label: '환승', value: '1회' },
    { status: 'info', label: '쉼터', value: '지도에 표시' },
  ],
  notice: '계단·육교·지하보도·횡단보도는 확인된 정보예요.',
  guide: 'navigate',
  directions: MOCK_TRANSIT_DIRECTIONS,
}

const SHORT: RouteOption = {
  key: 'short',
  title: '걷기 적은 길',
  sub: '걷는 시간은 줄이고 대중교통 환승을 늘린 경로',
  time: '55분',
  walk: '6분',
  transfer: '2회',
  facilities: [
    { status: 'ok', label: '보행거리', value: '420m' },
    { status: 'ok', label: '횡단보도', value: '1곳 확인' },
    { status: 'info', label: '환승', value: '2회 필요' },
    { status: 'warn', label: '계단', value: '2곳 있음' },
    { status: 'warn', label: '지하보도', value: '1곳 있음' },
  ],
  notice: '계단 2곳과 지하보도 1곳이 포함돼 있어요. 지하보도는 계단을 함께 이용해야 할 수 있어요.',
  guide: 'navigate',
  directions: MOCK_WALK_DIRECTIONS,
}

const DRT: RouteOption = {
  key: 'drt',
  title: '똑버스 이용 추천',
  sub: '보행 부담을 줄이고 예약 차량으로 이동하는 방법',
  time: '약 38분',
  walk: '4분',
  transfer: '없음',
  facilities: [
    { status: 'ok', label: '운행 구역', value: '포함 확인' },
    { status: 'info', label: '대기시간', value: '기관 확인' },
    { status: 'ok', label: '보조기구', value: '요청 가능' },
    { status: 'warn', label: '배차', value: '예약 후 확정' },
  ],
  notice: '실제 배차 가능 여부와 대기시간은 운영기관에서 최종 확인해야 해요.',
  guide: 'drt',
}

/** 7/31 회의: 휠체어 이용자는 똑버스를 탈 수 없어, 그 자리에 콜택시 안내를 놓는다. */
const CALL_TAXI: RouteOption = {
  key: 'calltaxi',
  title: '장애인 콜택시 안내',
  sub: '휠체어를 탄 채로 탈 수 있는 차량을 전화로 부르는 방법',
  time: '예약 후 확정',
  walk: '0분',
  transfer: '없음',
  facilities: [
    { status: 'ok', label: '휠체어 탑승', value: '가능' },
    { status: 'info', label: '이용 대상', value: '콜센터 확인' },
    { status: 'info', label: '대기시간', value: '콜센터 확인' },
    { status: 'warn', label: '예약', value: '전화로만 가능' },
  ],
  notice: '이용 대상과 요금, 대기시간은 콜센터에서 확인해 주세요.',
  guide: 'calltaxi',
}

/**
 * 계단 회피의 대가 — PoC 실측: 화성행궁→서장대 +1,123m(+13분), 화서역→서호노인복지관 +1,083m(+16분).
 * 계단을 '조금 어려움'으로 답한 분에게는 앱이 임의로 정하지 않고 두 경로를 나란히 보여준다.
 */
const STAIR_COMPARISON: StairComparison = {
  withStairs: { minutes: 28, walkMinutes: 9, meters: 850, stairFact: '계단 1곳 · 12칸을 오르내려야 해요' },
  noStairs: { minutes: 41, walkMinutes: 22, meters: 1973 },
}

/** 미니맵 경로 곡선 (viewBox 300×120) */
export const MINI_PATHS: Record<RouteKey, string> = {
  comfort: 'M18 94 C58 86 72 60 108 56 C150 51 168 40 210 42 C250 44 268 40 284 34',
  short: 'M18 94 C46 80 58 56 94 60 C120 63 128 42 150 40 C186 36 210 56 246 44 C266 39 276 36 284 34',
  drt: 'M18 94 C70 90 122 88 168 76 C214 64 250 48 284 34',
  calltaxi: 'M18 94 C70 90 122 88 168 76 C214 64 250 48 284 34',
}

/**
 * 미니맵 쉼터 마커 좌표 — 스코어에는 넣지 않고 '가는 길에 보이게'만 하는 용도(7/31 회의).
 * 걷는 구간이 있는 경로에만 찍는다. 차량 경로는 도보가 거의 없어 표시할 의미가 없음.
 */
export const MINI_RESTS: Record<RouteKey, [number, number][]> = {
  comfort: [
    [108, 56],
    [210, 42],
  ],
  short: [[150, 40]],
  drt: [],
  calltaxi: [],
}

/** 계단 선택 결과를 '가장 편한 길' 카드에 실제로 반영한다 */
export function applyStairChoice(option: RouteOption, pick: 'with' | 'none'): RouteOption {
  const w = STAIR_COMPARISON.withStairs
  const n = STAIR_COMPARISON.noStairs
  const gap = n.minutes - w.minutes
  if (pick === 'with') {
    return {
      ...option,
      time: `${w.minutes}분`,
      walk: `${w.walkMinutes}분`,
      sub: '계단을 지나지만 걷는 거리가 가장 짧은 경로',
      facilities: [
        { status: 'warn', label: '계단', value: '1곳 (12칸)' },
        { status: 'ok', label: '육교', value: '없음 확인' },
        { status: 'ok', label: '지하보도', value: '없음 확인' },
        { status: 'ok', label: '횡단보도', value: '2곳 확인' },
        { status: 'ok', label: '걷는 거리', value: `${w.meters.toLocaleString()}m` },
        { status: 'info', label: '쉼터', value: '지도에 표시' },
      ],
      notice: '계단 12칸을 오르내려야 해요. 난간을 잡고 천천히 이동해 주세요.',
    }
  }
  return {
    ...option,
    time: `${n.minutes}분`,
    walk: `${n.walkMinutes}분`,
    sub: '계단과 육교를 피해 걷는 부담을 줄인 경로',
    facilities: [
      { status: 'ok', label: '계단', value: '없음 확인' },
      { status: 'ok', label: '육교', value: '없음 확인' },
      { status: 'ok', label: '지하보도', value: '없음 확인' },
      { status: 'ok', label: '횡단보도', value: '2곳 확인' },
      { status: 'warn', label: '걷는 거리', value: `${n.meters.toLocaleString()}m` },
      { status: 'info', label: '쉼터', value: '지도에 표시' },
    ],
    notice: `계단이 있는 길보다 ${gap}분 더 걸어요. 중간에 쉬어가셔도 괜찮아요.`,
  }
}

export async function mockGetRoutes(destination: string): Promise<RouteResult> {
  const profile = await mockGetMobilityProfile()
  const isWheelchair = profile.mobilityAid === 'WHEELCHAIR'

  // 휠체어면 똑버스 대신 콜택시를 후보에 넣는다 (7/31 회의: 똑버스는 휠체어 탑승 불가)
  const options: RouteOption[] = [COMFORT, SHORT, isWheelchair ? CALL_TAXI : DRT]

  // AI Score function 3단계와 같은 갈래. drt_recommended 가 내려오면 이 임시 트리거는 걷어낸다.
  const recommendedKey: RouteKey = isWheelchair
    ? 'calltaxi'
    : profile.walkingDuration === 'UNABLE_TO_WALK' || profile.walkingDuration === 'WITHIN_10_MINUTES'
      ? 'drt'
      : 'comfort'

  // 계단이 '조금 어려움'일 때만 두 경로를 함께 물어본다.
  // '이용 어려움'·휠체어는 계단 경로를 애초에 빼고, '이용 가능'은 우회할 이유가 없다.
  const stairComparison =
    profile.stairLevel === 'SLIGHTLY_DIFFICULT' && !isWheelchair ? STAIR_COMPARISON : null

  return delay({ destination, origin: '현재 위치', options, recommendedKey, stairComparison })
}
