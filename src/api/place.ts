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
import { bestMatchTier, hasRelevantPlace, hasStrongMatch } from './placeRank'

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
    sort: req.sort,
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
 * ⚠️ **0건이 아니라고 해서 찾은 것이 아니다.** TMAP 은 관계없는 곳도 결과로 준다 —
 *    서울에서 "수원시청"을 찾았더니 '밤밭청개구리공원' 한 건이 왔고, 0건이 아니라는
 *    이유로 1단계에서 멈춰서 수원에서 다시 찾아보지도 못했다(2026-08-16).
 *    그래서 각 단계는 **검색어와 관계있는 결과가 하나라도 있을 때만** 성공으로 친다.
 *
 * ※ 백엔드가 **검색 결과 0건을 502 로 내려주기 때문에** 1단계 실패가 예외로 온다.
 *   여기서 삼키고 다음 단계로 넘어간다.
 *   (백엔드가 빈 목록을 정상 응답으로 주도록 고치면 catch 는 없어도 된다)
 */
/**
 * 한 번에 받아올 후보 수.
 *
 * **안 보내면 백엔드 기본값이 10이다**(PlaceSearchService.DEFAULT_SIZE). 그런데 TMAP 이
 * 주는 순서는 정확도순이 아니다 — 「아주대학교병원」을 검색했을 때 이름이 똑같은 본원이
 * 41건 중 **17위**였다(2026-08-15 실측). 10건만 받으면 정작 찾던 곳이 목록에 아예
 * 안 들어온다. 우리가 아무리 잘 정렬해도 **받지 못한 것은 못 올린다.**
 *
 * 그래서 넉넉히 받아서 우리가 고른다. 백엔드 상한은 50이다.
 * 사용자에게는 여전히 위에서 3건만 보이고 나머지는 「더 보기」로 접힌다 —
 * 많이 받는 것과 많이 보여주는 것은 다른 문제다.
 */
const SEARCH_SIZE = '30'

/**
 * 거리 기반 요청임이 분명한 말.
 * 이런 말이 붙으면 사용자가 원하는 것은 이름이 맞는 곳이 아니라 **가까운 곳**이다.
 */
const NEARBY_WORDS = /(근처|주변|가까운|인근)/

/**
 * 검색이 빗나갈 때 덜어낼 말끝.
 *
 * 사람이 붙여 부르지만 지도 이름에는 다르게 적히는 것들이다.
 * 덜어낸 뒤가 두 글자보다 짧으면 안 덜어낸다 — 「역」 하나만 남기면 아무거나 걸린다.
 */
const TRIM_SUFFIXES = ['역', '점', '지점', '캠퍼스', '본점']

function trimPlaceSuffix(keyword: string): string | null {
  const word = keyword.trim()
  for (const suffix of TRIM_SUFFIXES) {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length).trim()
    }
  }
  return null
}

export async function searchPlacesNear(
  keyword: string,
  center: LatLng | null,
  radiusKm: string,
): Promise<PlaceSearchResponse> {
  /** 좌표를 함께 보낸다 → 백엔드가 거리순(searchtypCd=R)으로 찾는다 */
  const near = async (at: LatLng, radius: string) => {
    try {
      const res = await searchPlaces({
        keyword,
        lat: String(at.latitude),
        lon: String(at.longitude),
        radiusKm: radius,
        size: SEARCH_SIZE,
      })
      return res.places?.length ? res : null
    } catch {
      return null
    }
  }

  /**
   * 이름이 잘 맞는 순으로 찾는다 — 수원 안에서.
   *
   * BE 가 `sort` 를 열어주기 전에는 **좌표를 빼야만** 정확도순이 됐다. 그러면 전국이
   * 대상이 되어서 받아온 것을 우리가 25km 로 잘라내야 했고, 수원 경계 근처가 재단됐다.
   * 이제 좌표와 함께 정확도순을 요청할 수 있어 그 낭비가 사라졌다
   * (2026-08-16 BE PlaceSearchSort 추가 — 부탁드린 그대로 열어주셨다).
   */
  const byAccuracy = async (word: string) => {
    try {
      const res = await searchPlaces({
        keyword: word,
        lat: String(SUWON_CENTER.latitude),
        lon: String(SUWON_CENTER.longitude),
        radiusKm: SERVICE_SEARCH_RADIUS_KM,
        size: SEARCH_SIZE,
        sort: 'accuracy',
      })
      return res.places?.length ? res : null
    } catch {
      return null
    }
  }

  // 1. 현재 위치 근처 (거리순)
  const found = center ? await near(center, radiusKm) : null
  const foundOk = !!(found && hasRelevantPlace(found.places, keyword))
  if (found && foundOk && hasStrongMatch(found.places, keyword)) return found

  // 2. 서비스 지역(수원) 안 (거리순) — 근처에서 관계있는 것조차 못 찾았을 때만
  let wide: PlaceSearchResponse | null = null
  let wideOk = false
  if (!foundOk) {
    wide = await near(SUWON_CENTER, SERVICE_SEARCH_RADIUS_KM)
    wideOk = !!(wide && hasRelevantPlace(wide.places, keyword))
    if (wide && wideOk && hasStrongMatch(wide.places, keyword)) return wide
  }

  /*
   * 3. 정확도순으로 다시.
   *
   * 여기까지 왔다는 것은 **찾던 그곳이 목록에 없다**는 뜻이다. 거리순으로는 그런 일이
   * 흔하다 — 「광교중앙역」을 찾으면 반경 안의 「워시프렌즈 광교중앙역점」 같은 가게들이
   * 앞을 다 채우고 정작 역은 20건 안에 들어오지도 않는다(2026-08-16 실측).
   * 같은 검색어를 정확도순으로 부르면 역이 1위로 나온다.
   *
   * 두 글자 낱말(병원·약국·마트)은 건너뛴다. 그런 이름의 장소는 없어서 어차피
   * 「찾던 그곳」이 나올 수 없고, 가까운 곳이 나오는 지금 방식이 맞다.
   *
   * 「근처」·「주변」이 붙은 말도 건너뛴다. 그건 **가까운 곳을 달라는 요청**이라
   * 정확도순으로 바꾸면 되레 엉뚱해진다 — 「근처 지하철역」에 정확도순을 쓰면
   * 이름이 그런 역을 찾게 된다.
   */
  if (keyword.replace(/\s+/g, '').length >= 3 && !NEARBY_WORDS.test(keyword)) {
    const exact = await byAccuracy(keyword)
    /*
     * 정확도순 쪽이 **더 잘 맞으면** 그것을 쓴다.
     *
     * 「딱 맞는 것이 있을 때만」으로 두면, 사람이 줄여 말한 경우(「아주대병원」 →
     * 지도에는 「아주대학교병원」)에 애써 받아온 더 나은 목록을 버리게 된다.
     * 두 목록 중 검색어에 더 가까운 쪽을 고르는 편이 언제나 낫다.
     */
    const haveTier = bestMatchTier(
      (foundOk && found ? found.places : wideOk && wide ? wide.places : []) ?? [],
      keyword,
    )
    if (exact && bestMatchTier(exact.places, keyword) < haveTier) return exact

    // 사람이 부르는 이름과 지도 이름이 다를 때 — 「광교중앙역」 → 「광교중앙」
    const trimmed = trimPlaceSuffix(keyword)
    if (trimmed) {
      const retry = await byAccuracy(trimmed)
      if (retry && hasRelevantPlace(retry.places, keyword)) return retry
    }
  }

  // 4. 딱 맞는 것은 없었다. 관계있는 것이라도 보여준다 —
  //    우리 판단이 틀렸을 수도 있고, 화면에 「다시 말하기」가 있으니 막다른 길은 아니다.
  if (found && foundOk) return found
  if (wide && wideOk) return wide
  return (
    found ??
    wide ?? { places: [], pagination: { page: 1, size: 0, totalCount: 0, hasNext: false } }
  )
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
