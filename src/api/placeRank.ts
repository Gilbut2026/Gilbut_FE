/**
 * 장소 후보 정리 — 검색 결과를 어르신이 고를 수 있는 목록으로 다듬는다.
 *
 * TMAP POI 순서를 믿을 수 없다는 것이 출발점이다.
 * "아주대학교병원"으로 검색한 실제 결과(2026-08-15, 41건 중 앞 30건):
 *
 *    1. 스마트버스정류장(아주대.아주대학교병원) 무더위/한파쉼터
 *    2. 아주대학교병원 웰빙센터        3~7.  웰빙센터의 주차장·주차빌딩·정문
 *    9. 아주대학교병원 별관           10~11. 별관 주차장·제1주차빌딩
 *   17. 아주대학교병원                 ← 검색어와 정확히 같은 이름인데 17위
 *   18~19. 정문·후문
 *
 * 거리순도 아니고(2.14 → 2.42 → 2.39 → 2.33 → 2.61) 정확도순도 아니다.
 * 건물 묶음이 통째로 나열되는데 묶음끼리의 순서에는 규칙이 보이지 않는다.
 * 게다가 41건이 전부 같은 주소(월드컵로 164)라, 주소만으로는 서로 구분되지도 않는다.
 *
 * 그래서 프론트가 직접 순서를 정한다.
 *   1) 검색어와 얼마나 같은지  2) 목적지로 고를 만한 이름인지  3) 이름이 짧은지
 *
 * 3번이 의외로 잘 듣는다 — 같은 건물의 POI 들 중에서는 이름이 짧은 쪽이 대표 시설이다
 * ("아주대학교병원" < "아주대학교병원 웰빙센터 2주차빌딩").
 */
import type { PlaceItemResponse } from '../types/dto'

/**
 * 목적지로 고를 일이 드문 부속시설 — 순서를 뒤로 민다.
 * 지우지는 않는다. 정말 주차장이나 정문에서 만나기로 한 경우도 있다.
 * 식당·카페는 그 자체가 목적지일 수 있어 넣지 않았다.
 */
const SUB_FACILITY = /(주차장|주차빌딩|주차타워|충전소|대피소|정문|후문)/

const normalize = (s: string): string => s.replace(/\s+/g, '')

/**
 * 주소에서 행정구역만 짧게 뽑는다.
 * "경기 수원시 영통구 월드컵로 164" → "수원시 영통구"
 *
 * 어르신에게 상세 주소는 읽을 것만 많고 판단에는 도움이 안 된다.
 * 실제 응답을 보면 후보 넷이 전부 같은 도로명이라 주소로는 아무것도 구분되지 않았다.
 */
export function areaOf(address?: string | null): string {
  if (!address) return ''
  return address
    .trim()
    .split(/\s+/)
    .filter((token) => /[시군구읍면동]$/.test(token))
    .slice(-2)
    .join(' ')
}

/**
 * 후보들끼리 지역이 갈리는지.
 * 다 같은 동네면 지역을 보여줄 이유가 없다 — 같은 글자를 네 번 읽게 하는 것은
 * 도움이 아니라 방해다. 갈릴 때만 붙인다.
 */
export function areasDiffer(places: { address?: string | null }[]): boolean {
  const set = new Set(places.map((p) => areaOf(p.address)).filter(Boolean))
  return set.size > 1
}

/**
 * 검색어와 조금이라도 관계가 있는 이름인가.
 *
 * 검색어의 글자가 **순서대로** 이름 안에 나오면 관계가 있다고 본다.
 *   "아주대병원"  → "아주대**학교**병원"   ○ (아·주·대·병·원이 순서대로 있다)
 *   "수원시청"    → "밤밭청개구리공원"     ✗ ('수'가 아예 없다)
 *
 * 왜 이렇게 느슨한가 — 사람은 줄여 말한다. "아주대병원"이라 하지 "아주대학교병원"이라
 * 하지 않는다. 글자가 그대로 들어있는지만 보면(includes) 이런 것들이 전부 탈락한다.
 *
 * 왜 이게 필요한가 — TMAP 은 관계없는 곳도 결과로 준다. 서울에서 "수원시청"을 찾으면
 * '밤밭청개구리공원'이 왔다(2026-08-16). 0건이 아니라고 해서 찾은 것이 아니다.
 * 이 판단이 있어야 "여기서는 못 찾았으니 수원에서 다시 찾자"로 넘어갈 수 있다.
 */
export function isRelevantPlace(name: string, keyword: string): boolean {
  const n = normalize(name)
  const k = normalize(keyword)
  if (!k) return true
  let i = 0
  for (const ch of n) {
    if (ch === k[i]) i += 1
    if (i === k.length) return true
  }
  return false
}

/** 이 결과들 중에 검색어와 관계있는 것이 하나라도 있는가 */
export function hasRelevantPlace(places: { name: string }[], keyword: string): boolean {
  return places.some((p) => isRelevantPlace(p.name, keyword))
}

/**
 * 검색어와의 일치 정도. 낮을수록 먼저.
 * 0 완전히 같음 · 1 검색어로 시작 · 2 검색어를 품음 · 3 그 밖
 */
function matchTier(name: string, keyword: string): number {
  const n = normalize(name)
  const k = normalize(keyword)
  if (!k) return 3
  if (n === k) return 0
  if (n.startsWith(k)) return 1
  if (n.includes(k)) return 2
  return 3
}

/**
 * 정리된 후보.
 *
 *   primary — 주소가 서로 다른 대표 장소. 처음에 보여줄 것들이다
 *   more    — 같은 주소라 대표에 가려진 것들("아주대학교병원 별관"·"웰빙센터"·"정문")
 *
 * 예전에는 `more` 를 **버렸다.** 같은 주소가 넷씩 나열되면 구분이 안 돼서였는데,
 * 그러다 보니 아주대병원 검색 41건이 2건으로 줄었다(2026-08-16). 「더 보기」를 만들
 * 여지도 사라졌고, 정말 별관에 가려던 사람은 갈 방법이 없었다.
 * 지금은 버리지 않고 접어둔다 — 첫 화면은 여전히 대표만, 필요하면 펼쳐서 본다.
 */
export interface RankedPlaces {
  primary: PlaceItemResponse[]
  more: PlaceItemResponse[]
}

/**
 * 후보 목록을 사람이 고를 수 있게 정리한다.
 * @param keyword 사용자가 말한 목적지. 넘기면 일치 정도로 먼저 정렬한다.
 */
export function rankPlaceCandidates(
  places: PlaceItemResponse[],
  keyword?: string,
): RankedPlaces {
  const scored = places.map((place, index) => ({
    place,
    index,
    tier: keyword ? matchTier(place.name, keyword) : 0,
    penalty: SUB_FACILITY.test(place.name) ? 1 : 0,
    length: normalize(place.name).length,
  }))

  scored.sort(
    (a, b) =>
      a.tier - b.tier || // 검색어와 같은 이름이 먼저
      a.penalty - b.penalty || // 주차장·정문 같은 부속시설은 뒤로
      a.length - b.length || // 같은 조건이면 짧은 이름이 대표 시설이다
      a.index - b.index, // 그래도 같으면 서버 순서를 지킨다
  )

  // 같은 주소에서는 대표 하나만 앞에 세우고, 나머지는 뒤로 접어둔다.
  // ※ 반드시 정렬 뒤에 해야 한다. 먼저 묶으면 서버 순서상 앞이라는 이유만으로
  //   웰빙센터가 본원의 자리를 차지해버린다(실제로 그렇게 밀려났었다).
  const seen = new Set<string>()
  const primary: PlaceItemResponse[] = []
  const more: PlaceItemResponse[] = []

  for (const { place } of scored) {
    const key = place.address?.trim()
    if (key) {
      if (seen.has(key)) {
        more.push(place)
        continue
      }
      seen.add(key)
    }
    primary.push(place)
  }

  return { primary, more }
}
