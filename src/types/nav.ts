import type { LatLng } from './dto'

/**
 * 화면 식별자 — App 의 화면 전환에 사용. 7차 와이어프레임 화면 구성과 대응한다.
 * (✅ 이식 완료 / ⬜ 이식 예정)
 */
export type Screen =
  | 'signup' //      ✅ 시작 · 카카오 회원가입
  | 'onboarding' //  ✅ 나에게 맞는 길 설정
  | 'home' //        ✅ 홈
  | 'chat' //        ✅ 대화로 길찾기
  | 'confirm' //     ⬜ 목적지 확인
  | 'location' //    ⬜ 위치 권한
  | 'stairs' //      ✅ 계단 있는 길 ↔ 없는 길 선택
  | 'results' //     ✅ 가는 길(결과)
  | 'drt' //         ✅ 똑버스 안내
  | 'calltaxi' //    ✅ 장애인 콜택시 안내 (7/31 회의 신규)
  | 'navigate' //    ⬜ 길 안내
  | 'arrive' //      ⬜ 도착
  | 'settings' //    ⬜ 내 정보와 안전
  | 'contacts' //    ⬜ 비상 연락처
  | 'favorites' //   ⬜ 자주 가는 곳
  | 'history' //     ⬜ 최근 기록
  | 'help' //        ⬜ 도움말

/** 하단 탭이 보이는 화면 */
export const TAB_SCREENS: Screen[] = ['home', 'chat', 'results', 'settings']

/**
 * 대화가 끝나고 결과 화면으로 넘기는 것.
 *
 * `origin` 이 여기 있는 이유 — 예전에는 대화에서 출발지를 확정해도 결과 화면이 그걸
 * 받지 못하고 **무조건 브라우저 현재 위치로** 길을 찾았다. 서울에서 "수원시청 출발"로
 * 정해도 서울에서 출발하는 경로가 나왔고, 그 좌표로 똑버스 권역을 물으니
 * "이 지역은 운행하지 않아요"가 떴다(2026-08-16). 물어본 위치가 틀렸던 것이다.
 *
 * 사용자가 대화에서 정한 것은 결과에 그대로 반영돼야 한다. 아니면 대화를 왜 하는가.
 */
export interface ChatOutcome {
  destination: string
  /** 사용자가 확인한 목적지 좌표. 이름으로 다시 검색하면 다른 곳이 잡힐 수 있다 */
  destinationCoords?: LatLng
  /** 대화에서 고른 출발 시각 'YYYY-MM-DDTHH:mm:ss' */
  departureDateTime: string
  /** 확정한 출발지. null 이면 결과 화면이 현재 위치로 찾는다 */
  origin: { name: string; coords: LatLng } | null
}
