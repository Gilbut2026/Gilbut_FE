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
 *   1. 현재 위치 근처(반경 SEARCH_RADIUS_KM)에서 먼저 찾는다.
 *      "병원"·"약국" 처럼 어디에나 있는 낱말은 가까운 곳이 나와야 한다.
 *   2. 근처에서 못 찾으면 **지역 제한 없이** 다시 찾는다.
 *      "수원시청" 처럼 멀리 있는 특정 장소는 반경 안에 없어서 1단계가 실패한다.
 *      서울에서 수원 목적지를 정하는 경우가 실제로 있다(발표 시연도 그렇다).
 *
 * ※ 2단계가 필요한 또 다른 이유 — 백엔드가 **검색 결과 0건을 502 로 내려준다.**
 *   그래서 1단계 실패는 예외로 오고, 여기서 삼키고 넘어간다.
 *   (백엔드가 빈 목록을 정상 응답으로 주도록 고치면 catch 는 없어도 된다)
 */
export async function searchPlacesNear(
  keyword: string,
  center: LatLng | null,
  radiusKm: string,
): Promise<PlaceSearchResponse> {
  if (center) {
    try {
      const near = await searchPlaces({
        keyword,
        lat: String(center.latitude),
        lon: String(center.longitude),
        radiusKm,
      })
      if (near.places?.length) return near
    } catch {
      /* 0건이 502 로 오므로 여기서 멈추지 않고 전국 검색으로 넘어간다 */
    }
  }
  return searchPlaces({ keyword })
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
