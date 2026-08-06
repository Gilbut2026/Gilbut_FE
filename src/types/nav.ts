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
