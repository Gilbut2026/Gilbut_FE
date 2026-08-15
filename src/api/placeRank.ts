/**
 * 장소 후보 정리 — 검색 결과를 어르신이 고를 수 있는 목록으로 다듬는다.
 *
 * 왜 필요한가 (2026-08-15 실데이터로 확인)
 *   "아주대학교병원" 검색 → 웰빙센터 / 지하주차장 / 2주차빌딩 / 1주차빌딩 / 건강증진센터
 *   "종합병원" 검색      → 2주차장 / 4주차장 / 본원 / 정문 / 1주차장 / 정동물병원
 *
 * TMAP POI 는 주차장·정문 같은 부속시설을 본원과 같은 비중으로 올려주고, 같은 주소가
 * 여러 번 반복된다. 그대로 보여주면 "주소까지 확인해 주세요"라고 안내해놓고
 * 정작 주소가 전부 같아 구분이 안 된다.
 *
 * 여기서 하는 일은 두 가지뿐이다 — 지우지 않고 **순서를 내리고**, 같은 주소를 **하나로 묶는다**.
 * 사용자가 정말 주차장에 가려는 경우도 있어서 목록에서 완전히 없애지는 않는다.
 */
import type { PlaceItemResponse } from '../types/dto'

/** 목적지로 고를 일이 드문 부속시설 — 순서를 뒤로 민다 */
const SUB_FACILITY = /(주차장|주차빌딩|주차타워)/

export function rankPlaceCandidates(places: PlaceItemResponse[]): PlaceItemResponse[] {
  const scored = places.map((place, index) => ({
    place,
    index,
    penalty: SUB_FACILITY.test(place.name) ? 1 : 0,
  }))

  // 부속시설을 뒤로. 그 외에는 서버가 준 순서를 지킨다(거리·정확도 반영분이라 존중한다).
  scored.sort((a, b) => a.penalty - b.penalty || a.index - b.index)

  // 같은 주소는 대표 하나만 남긴다. 주소가 비어 있으면 묶을 근거가 없으므로 그대로 둔다.
  const seen = new Set<string>()
  const result: PlaceItemResponse[] = []

  for (const { place } of scored) {
    const key = place.address?.trim()
    if (key) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    result.push(place)
  }

  return result
}
