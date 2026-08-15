/**
 * 목적지 빠른 답변 — 홈 화면과 대화 화면이 함께 쓴다.
 *
 * 어르신 대상이라 타이핑보다 **누를 수 있는 선택지**가 중요하다.
 * 그래서 첫 화면과 대화 시작 시점에 항상 보여준다.
 *
 * 지역 고정값(예: '수원역')이나 자리표시자(예: '○○병원')를 넣지 않는다.
 * 자리표시자는 검색이 0건이라 누르면 그대로 막히고, 지역 고정값은 그 지역 밖에서 쓸모가 없다.
 * 여기 있는 낱말은 전부 **현재 위치를 중심으로 검색**되므로 어디서 열든 근처 장소가 나온다.
 */
export const QUICK_DESTINATIONS = [
  { emoji: '🏥', name: '병원' },
  { emoji: '💊', name: '약국' },
  { emoji: '🛒', name: '전통시장' },
  { emoji: '🏛️', name: '주민센터' },
] as const

/** 대화 화면처럼 이름만 필요한 곳에서 */
export const QUICK_DESTINATION_NAMES: readonly string[] = QUICK_DESTINATIONS.map((d) => d.name)
