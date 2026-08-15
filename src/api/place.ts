/**
 * 장소 API — 검색 / 즐겨찾기 / 집주소.
 * 화면은 이 파일의 함수만 호출한다. (Mock ↔ 실서버 스위칭)
 */
import { api, toQuery } from './client'
import type {
  LatLng,
  FavoritePlaceResponse,
  FavoritePlaceSaveRequest,
  FavoritePlaceUpdateRequest,
  HomePlaceResponse,
  HomePlaceSaveRequest,
  PlaceSearchRequest,
  PlaceSearchResponse,
} from '../types/dto'
import {
  mockAddFavorite,
  mockDeleteFavorite,
  mockDeleteHome,
  mockGetHome,
  mockListFavorites,
  mockSaveHome,
  mockSearchPlaces,
  mockUpdateFavorite,
} from '../mock/place'

import { useMock } from './mode'
import { SERVICE_SEARCH_RADIUS_KM, SUWON_CENTER } from './geo'

const USE_MOCK = () => useMock('place')

const FAVORITES = '/api/users/me/favorites'
const HOME = '/api/users/me/home'

/** 장소 검색 (키워드 + 선택적 현재위치/반경) */
export function searchPlaces(req: PlaceSearchRequest): Promise<PlaceSearchResponse> {
  if (USE_MOCK()) return mockSearchPlaces(req.keyword)
  const qs = toQuery({
    keyword: req.keyword,
    lat: req.lat,
    lon: req.lon,
    radiusKm: req.radiusKm,
    page: req.page,
    size: req.size,
  })
  return api.get<PlaceSearchResponse>(`/api/places/search${qs}`)
}

/**
 * 장소 검색 (2단계) — 화면에서는 이걸 쓴다.
 *
 *   1. 현재 위치 근처에서 먼저 찾는다.
 *      "병원"·"약국" 처럼 어디에나 있는 낱말은 가까운 곳이 나와야 한다.
 *   2. 근처에서 못 찾으면 **서비스 지역(수원)에서** 다시 찾는다.
 *      "수원시청" 처럼 멀리 있는 특정 장소는 1단계 반경 밖이라 실패한다.
 *      서울에서 수원 목적지·출발지를 정하는 경우가 실제로 있다(발표 시연이 그렇다).
 *
 * ⚠️ 2단계에서 **좌표를 아예 빼면 안 된다.** 기준점 없이 검색하면 TMAP 이 엉뚱한 것을 준다 —
 *    서울에서 "수원시청"을 찾았더니 '밤밭청개구리공원'이 왔다(2026-08-16 확인).
 *    이 앱은 수원 서비스이므로, 못 찾았을 때 갈 곳은 "전국"이 아니라 "수원"이다.
 *
 * ※ 백엔드가 **검색 결과 0건을 502 로 내려주기 때문에** 1단계 실패가 예외로 온다.
 *   여기서 삼키고 다음 단계로 넘어간다.
 *   (백엔드가 빈 목록을 정상 응답으로 주도록 고치면 catch 는 없어도 된다)
 */
export async function searchPlacesNear(
  keyword: string,
  center: LatLng | null,
  radiusKm: string,
): Promise<PlaceSearchResponse> {
  const attempt = async (at: LatLng, radius: string) => {
    try {
      const res = await searchPlaces({
        keyword,
        lat: String(at.latitude),
        lon: String(at.longitude),
        radiusKm: radius,
      })
      return res.places?.length ? res : null
    } catch {
      return null
    }
  }

  // 1. 현재 위치 근처
  if (center) {
    const near = await attempt(center, radiusKm)
    if (near) return near
  }

  // 2. 서비스 지역(수원) 안 — 수원 밖에서 앱을 열어도 수원 장소를 찾을 수 있어야 한다
  const inService = await attempt(SUWON_CENTER, SERVICE_SEARCH_RADIUS_KM)
  if (inService) return inService

  // 어느 쪽에서도 못 찾았다 — 빈 목록으로 돌려주고 화면이 안내하게 한다
  return { places: [], pagination: { page: 1, size: 0, totalCount: 0, hasNext: false } }
}

/** 즐겨찾기 목록 */
export function listFavorites(): Promise<FavoritePlaceResponse[]> {
  return USE_MOCK() ? mockListFavorites() : api.get<FavoritePlaceResponse[]>(FAVORITES)
}

/** 즐겨찾기 등록 */
export function addFavorite(
  req: FavoritePlaceSaveRequest,
): Promise<FavoritePlaceResponse> {
  return USE_MOCK()
    ? mockAddFavorite(req)
    : api.post<FavoritePlaceResponse>(FAVORITES, req)
}

/** 즐겨찾기 별칭 수정 */
export function updateFavorite(
  id: number,
  req: FavoritePlaceUpdateRequest,
): Promise<FavoritePlaceResponse> {
  return USE_MOCK()
    ? mockUpdateFavorite(id, req)
    : api.patch<FavoritePlaceResponse>(`${FAVORITES}/${id}`, req)
}

/** 즐겨찾기 삭제 */
export function deleteFavorite(id: number): Promise<void> {
  return USE_MOCK() ? mockDeleteFavorite(id) : api.del<void>(`${FAVORITES}/${id}`)
}

/**
 * 집주소 조회 (없으면 null)
 * ⚠️ 실서버는 미등록일 때 응답 봉투에서 `data` 를 아예 생략한다(= undefined).
 *    선언한 타입과 맞추려고 여기서 null 로 정규화한다. (2026-08-04 로컬 실연결로 확인)
 *    또한 `data` 가 빈 객체({address:null})로 오는 경우도 있어(설정은 미등록인데 프롬프트가
 *    안 뜨던 원인) 주소가 실제로 있을 때만 집으로 취급한다. (2026-08-14)
 */
export async function getHome(): Promise<HomePlaceResponse | null> {
  if (USE_MOCK()) return mockGetHome()
  const res = (await api.get<HomePlaceResponse | null>(HOME)) ?? null
  return res?.address ? res : null
}

/** 집주소 저장/수정 */
export function saveHome(req: HomePlaceSaveRequest): Promise<HomePlaceResponse> {
  return USE_MOCK() ? mockSaveHome(req) : api.put<HomePlaceResponse>(HOME, req)
}

/** 집주소 삭제 */
export function deleteHome(): Promise<void> {
  return USE_MOCK() ? mockDeleteHome() : api.del<void>(HOME)
}
