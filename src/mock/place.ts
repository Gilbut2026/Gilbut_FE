/** Mock 장소 도메인 — 검색 / 즐겨찾기 / 집주소를 인메모리로 유지한다. */
import type {
  FavoritePlaceResponse,
  FavoritePlaceSaveRequest,
  FavoritePlaceUpdateRequest,
  HomePlaceResponse,
  HomePlaceSaveRequest,
  PlaceItemResponse,
  PlaceSearchResponse,
} from '../types/dto'
import { delay, nextId } from './_shared'
import { mockSetHomeAddress } from './user'

// 수원 인근 좌표 근처의 가짜 POI (데모용)
const SAMPLE: Omit<PlaceItemResponse, 'placeId'>[] = [
  { name: '아주대학교병원', address: '경기 수원시 영통구 월드컵로 164', latitude: 37.2792, longitude: 127.0436 },
  { name: '수원역', address: '경기 수원시 팔달구 덕영대로 924', latitude: 37.2659, longitude: 127.0003 },
  { name: '수원시청', address: '경기 수원시 팔달구 효원로 241', latitude: 37.2636, longitude: 127.0286 },
  { name: '영통구청', address: '경기 수원시 영통구 효원로 407', latitude: 37.2595, longitude: 127.0466 },
  { name: '홈플러스 영통점', address: '경기 수원시 영통구 봉영로 1605', latitude: 37.2506, longitude: 127.0713 },
]

export function mockSearchPlaces(keyword: string): Promise<PlaceSearchResponse> {
  const kw = keyword.trim()
  const matched = kw
    ? SAMPLE.filter((p) => p.name.includes(kw) || p.address.includes(kw))
    : SAMPLE
  const places: PlaceItemResponse[] = (matched.length ? matched : SAMPLE).map(
    (p, i) => ({ placeId: `mock-poi-${i}`, ...p }),
  )
  return delay({
    places,
    pagination: { page: 1, size: places.length, totalCount: places.length, hasNext: false },
  })
}

// ---- 즐겨찾기 ----
let favorites: FavoritePlaceResponse[] = [
  { id: nextId(), name: '아주대병원', address: '경기 수원시 영통구 월드컵로 164', latitude: 37.2792, longitude: 127.0436 },
  { id: nextId(), name: '홈플러스', address: '경기 수원시 영통구 봉영로 1605', latitude: 37.2506, longitude: 127.0713 },
]

export function mockListFavorites(): Promise<FavoritePlaceResponse[]> {
  return delay(favorites)
}

export function mockAddFavorite(
  req: FavoritePlaceSaveRequest,
): Promise<FavoritePlaceResponse> {
  const created: FavoritePlaceResponse = { id: nextId(), ...req }
  favorites = [...favorites, created]
  return delay(created)
}

export function mockUpdateFavorite(
  id: number,
  req: FavoritePlaceUpdateRequest,
): Promise<FavoritePlaceResponse> {
  favorites = favorites.map((f) => (f.id === id ? { ...f, name: req.name } : f))
  const updated = favorites.find((f) => f.id === id)
  return delay(updated as FavoritePlaceResponse)
}

export function mockDeleteFavorite(id: number): Promise<void> {
  favorites = favorites.filter((f) => f.id !== id)
  return delay(undefined)
}

// ---- 집주소 ----
let home: HomePlaceResponse | null = null

export function mockGetHome(): Promise<HomePlaceResponse | null> {
  return delay(home)
}

export function mockSaveHome(req: HomePlaceSaveRequest): Promise<HomePlaceResponse> {
  home = { ...req }
  mockSetHomeAddress(home.address)
  return delay(home)
}

export function mockDeleteHome(): Promise<void> {
  home = null
  mockSetHomeAddress(null)
  return delay(undefined)
}
