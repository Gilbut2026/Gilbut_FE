/**
 * 서비스 지역 판단.
 *
 * 왜 필요한가 — 백엔드 장소 검색은 좌표를 넘기면 **반경 5km 를 강제**한다
 * (`PlaceSearchService.DEFAULT_RADIUS_KM = 5`). 그래서 수원 밖에서 앱을 켜면
 * 수원 목적지가 반경 밖이 되어 결과가 0건이 되고, 그 0건이 502 서버오류로 내려온다
 * (2026-08-15 확인: 서울에서 "수원역" 검색 → 502 "장소 검색에 실패했습니다").
 *
 * 사용자에게는 원인 모를 서버 오류로 보인다. 어르신 대상이라 더 나쁘다 —
 * 무엇을 잘못했는지 알 수 없고 다음에 뭘 해야 할지도 모른다.
 * 그래서 서버에 묻기 전에 프론트가 먼저 "지금은 수원에서만 됩니다"라고 알려준다.
 *
 * ※ 근본 해결은 백엔드가 0건을 정상 응답으로 내려주고 반경을 넓히는 것이다(노션 고도화 목록).
 *   여기 있는 건 그때까지의 안내이고, 고쳐진 뒤에도 안내 자체는 남을 값어치가 있다.
 */
import type { LatLng } from '../types/dto'

/** 수원시청 — 서비스 지역 기준점 */
export const SUWON_CENTER: LatLng = { latitude: 37.2636, longitude: 127.0286 }

/**
 * 서비스 지역으로 볼 반경(km).
 * 수원시는 동서로 약 20km 라 25km 로 잡으면 시 경계와 인접 생활권까지 들어온다.
 * 경계를 칼같이 자르기보다, 확실히 먼 곳(서울·타 시도)만 걸러내는 것이 목적이다.
 */
export const SERVICE_RADIUS_KM = 25

/** 두 좌표 사이 거리(km) — 하버사인 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 이 좌표가 서비스 지역(수원) 안인가 */
export function isInServiceArea(coords: LatLng): boolean {
  return distanceKm(coords, SUWON_CENTER) <= SERVICE_RADIUS_KM
}

/**
 * 장소 검색에 함께 보낼 반경(km).
 *
 * 백엔드는 이 값을 안 보내면 5km 를 강제한다(DEFAULT_RADIUS_KM). 그런데 수원 시내
 * 주요 지점끼리도 3분의 1이 5km 를 넘어서(영통역↔권선구청 8.9km, 수원역↔영통역 6.5km),
 * 같은 시 안의 이동조차 검색 단계에서 막혔다.
 *
 * 20km 로 잡으면 수원 전역(동서 약 13km)에 여유를 두고 덮으면서, 반경을 지나치게 넓혀
 * 먼 동네 결과가 섞이는 것도 피할 수 있다. 백엔드 상한은 33km 라 여유가 있다.
 *
 * ※ 문자열인 이유 — 백엔드 PlaceSearchRequest 가 쿼리 파라미터를 문자열로 받는다.
 */
export const SEARCH_RADIUS_KM = '20'
