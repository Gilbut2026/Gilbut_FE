/**
 * 경로 API — 화면은 이 파일의 함수만 호출한다. (Mock ↔ 실서버 스위칭)
 *
 * 2026-08-14 실연동 배선: BE 「맞춤 경로 추천」 배포 + AI 스코어링 서버(gilbut-ai.onrender.com) 배포로
 *   실호출이 가능해졌다. mode.ts 의 FORCED_MOCK 에서 route 를 뺐고, 스위치는 useMock('route') 가 한다.
 *   · 배포본: VITE_REAL_DOMAINS=auth,place,safety (route 없음) → 여전히 Mock (시연 안전).
 *   · 실서버 테스트: VITE_REAL_DOMAINS 에 route 추가 + 로그인(JWT) 필요. place 도 실서버여야 좌표를 얻는다.
 *
 * 좌표 배선 — BE 는 목적지/출발지의 위경도를 요구하는데 화면 흐름은 "목적지 이름(문자열)"만 넘긴다.
 *   그래서 getRoutesReal 안에서 좌표를 만든다:
 *     · 목적지 이름 → searchPlaces(place 실서버) 첫 결과의 위경도
 *     · 출발지 "현재 위치" → 브라우저 geolocation (거부/미지원 시 수원 기본 좌표로 폴백)
 *   BE 응답(RouteRecommendationResult)은 mapRecommendation.ts 어댑터가 화면 RouteResult 로 번역한다.
 *
 * 🚨 남은 것: 대화에서 고른 출발 시각을 실제로 전달(지금은 '지금' 고정). BE 접근성 신호 노출 시 어댑터 보강.
 */
import type { LatLng, RouteRecommendationRequest, RouteRecommendationResult, RouteResult } from '../types/dto'
import { api, ApiError } from './client'
import { useMock } from './mode'
import { searchPlacesNear } from './place'
import { departureAfter } from './time'
import { SEARCH_RADIUS_KM } from './geo'
import { mockGetRoutes } from '../mock/route'
import { mapRecommendationToRouteResult } from './mapRecommendation'

// 서비스 지역이 수원 — geolocation 을 못 잡을 때의 안전 기본 출발지(수원시청 인근).
const DEFAULT_ORIGIN: LatLng = { latitude: 37.2636, longitude: 127.0286 }

/** 브라우저 현재 위치 (권한 거부·미지원·시간초과 시 null → 기본 좌표로 폴백) */
function getCurrentPosition(): Promise<LatLng | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    )
  })
}

/** 목적지 이름 → 좌표 (place 검색 첫 결과). center 를 기준점으로 검색. 못 찾으면 null. */
async function resolveDestination(
  keyword: string,
  center: LatLng,
): Promise<{ coords: LatLng; name: string } | null> {
  // 근처에서 먼저 찾고, 못 찾으면 지역 제한 없이 (api/place searchPlacesNear 주석 참고)
  const res = await searchPlacesNear(keyword, center, SEARCH_RADIUS_KM)
  const first = res.places[0]
  if (!first) return null
  return { coords: { latitude: first.latitude, longitude: first.longitude }, name: first.name }
}

/**
 * 경로 조회에 필요한 것들.
 * 화면이 위치별로 인자를 세는 대신 이름으로 넘긴다 — 좌표가 두 개(출발지·목적지)라
 * 자리만 바뀌어도 조용히 엉뚱한 경로가 나온다.
 */
export interface RouteQuery {
  destination: string
  /** 대화에서 확인한 목적지 좌표. 있으면 이름으로 다시 검색하지 않는다 */
  destinationCoords?: LatLng
  /** 대화에서 고른 출발 시각. 없으면 '지금' */
  departureDateTime?: string
  /** 대화에서 확정한 출발지. 없으면 현재 위치에서 출발하는 것으로 본다 */
  origin?: { name: string; coords: LatLng } | null
}

/** BE 「맞춤 경로 추천」 실호출 → 어댑터로 화면 RouteResult 번역 */
async function getRoutesReal(query: RouteQuery): Promise<RouteResult> {
  const { destination, destinationCoords, departureDateTime } = query

  /*
   * 출발지는 **대화에서 확정한 것이 먼저다.**
   *
   * 예전에는 이 줄이 무조건 브라우저 현재 위치였다. 그래서 대화에서 "수원시청에서
   * 출발할게요"라고 확정해도 결과는 지금 서 있는 자리(서울)에서 출발하는 경로가 나왔고,
   * 그 좌표로 똑버스 권역을 물으니 "이 지역은 운행하지 않아요"가 떴다(2026-08-16).
   * 대화에서 정한 것이 결과에 반영되지 않으면 대화를 할 이유가 없다.
   *
   * 대화를 거치지 않고 온 경우(즐겨찾기·최근 기록)에만 현재 위치를 쓴다.
   */
  const originName = query.origin?.name ?? '현재 위치'
  const origin = query.origin?.coords ?? (await getCurrentPosition()) ?? DEFAULT_ORIGIN

  // 대화에서 사용자가 직접 고른 좌표가 있으면 다시 검색하지 않는다.
  // 같은 이름이라도 검색 1순위가 달라져 확인한 곳과 다른 데로 안내될 수 있기 때문이다
  // (예: "수원역" 검색 1순위가 '팀에이치짐 수원시청역점 주차장'으로 잡힌 사례).
  const dest = destinationCoords
    ? { coords: destinationCoords, name: destination }
    : await resolveDestination(destination, origin)

  // 목적지를 못 찾으면 갈 수 있는 길이 없는 것과 같게 처리 (ResultsScreen 이 404 → 'none' 안내)
  if (!dest) throw new ApiError(404, '해당 목적지를 찾지 못했어요.')

  const request: RouteRecommendationRequest = {
    origin,
    destination: dest.coords,
    // 대화에서 고른 출발 시각. 없으면 '지금'.
    // 로컬 시각으로 보낸다 — toISOString().slice(0,19) 은 UTC 라 한국에서 9시간 과거가 되고,
    // 그 값이 그대로 TMAP 대중교통 조회로 들어가 엉뚱한 시간표의 경로가 나온다.
    departureDateTime: departureDateTime ?? departureAfter(0),
  }
  const be = await api.post<RouteRecommendationResult>('/api/routes/recommendations', request)
  return mapRecommendationToRouteResult(be, { destination: dest.name, origin: originName })
}

/**
 * 목적지 기준 추천 경로(편한 길·걷기 적은 길·똑버스/콜택시) 조회.
 * @param departureDateTime 대화에서 고른 출발 시각('YYYY-MM-DDTHH:mm:ss'). 없으면 지금 기준.
 *   Mock 은 시각을 쓰지 않는다(고정 데이터라 시각별 차이가 없다).
 */
export function getRoutes(query: RouteQuery): Promise<RouteResult> {
  return useMock('route') ? mockGetRoutes(query.destination) : getRoutesReal(query)
}
