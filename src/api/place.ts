/**
 * 장소 API — 검색 / 즐겨찾기 / 집주소.
 * 화면은 이 파일의 함수만 호출한다. (Mock ↔ 실서버 스위칭)
 */
import { api, toQuery } from './client'
import type {
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
