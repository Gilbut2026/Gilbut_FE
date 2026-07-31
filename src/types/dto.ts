/**
 * ============================================================
 *  백엔드 ↔ 프론트 데이터 계약 (DTO)
 * ============================================================
 *  이 파일이 두 팀의 "약속"이며, 여기만 맞으면 Mock → 실서버 교체가 자유롭다.
 *
 *  ⭐ 아래 "실서버 계약" 섹션은 Gilbut_BE 저장소의 실제 구현
 *     (Spring Boot, github.com/Gilbut2026/Gilbut_BE)을 그대로 옮긴 것이다.
 *     자바 enum/DTO 필드명·값과 100% 일치해야 한다.
 *
 *  ✅ = BE에 이미 구현된 필드      (실제 API 존재)
 *  🟡 = 노션 명세서 스텁만 있고 BE 컨트롤러 미구현 → 당분간 Mock 전용
 *  🗑️ = 피벗 이전(판단카드) 레거시 — 화면 마이그레이션 후 제거 예정
 * ------------------------------------------------------------
 */

/* ============================================================
 *  0. 공통 응답 봉투  ✅  (global/common/api/ApiResponse)
 * ============================================================ */

/** 모든 실서버 응답은 이 봉투로 감싸진다. data 는 null 이면 생략됨. */
export interface ApiResponse<T> {
  success: boolean
  message: string
  data?: T
}

/* ============================================================
 *  1. 온보딩 = 이동특성 enum  ✅  (domain/user/type/*)
 *     ⚠️ 값 문자열은 BE 자바 enum 과 반드시 동일해야 한다.
 * ============================================================ */

/** 한 번에 걸을 수 있는 시간 (20~30 사이 구간 없음에 주의) */
export type WalkingDuration =
  | 'WITHIN_10_MINUTES'
  | 'WITHIN_20_MINUTES'
  | 'OVER_30_MINUTES'

/** 계단 이용 정도 */
export type StairLevel = 'AVAILABLE' | 'SLIGHTLY_DIFFICULT' | 'DIFFICULT'

/** 쉬어 갈 곳 필요 여부 */
export type RestStopPreference = 'REQUIRED' | 'NO_PREFERENCE'

/** 환승 선호 정도 */
export type TransferLevel = 'AVAILABLE' | 'FEWER_PREFERRED' | 'AVOID_PREFERRED'

/**
 * 이동 보조기구.
 * ⚠️ 6차 와이어프레임은 2옵션(사용안함/사용해요)로 단순화했으나,
 *    BE·AI(휠체어 시 경로 필터)는 종류 구분이 필요 → 회의 재조정 안건.
 *    OTHER 선택 시 mobilityAidDetail(≤100자) 필수.
 */
export type MobilityAid = 'NONE' | 'CANE' | 'WHEELCHAIR' | 'OTHER'

/** 글자 크기 5단계 (프론트 fontScale 0~100 과의 매핑은 settings 에서 처리) */
export type FontSize =
  | 'EXTRA_SMALL'
  | 'SMALL'
  | 'NORMAL'
  | 'LARGE'
  | 'EXTRA_LARGE'

/* ============================================================
 *  2. 인증  ✅  (dto/auth) — 카카오 로그인 + JWT
 * ============================================================ */

/** POST /api/auth/kakao-login — 카카오 인가 코드 전달 */
export interface LoginRequest {
  code: string
}

/** POST /api/auth/refresh — 리프레시 토큰으로 재발급 */
export interface TokenRequest {
  refreshToken: string
}

/** 액세스/리프레시 토큰 응답 */
export interface TokenResponse {
  accessToken: string
  refreshToken: string
}

/* ============================================================
 *  3. 사용자 / 이동특성 / 접근성  ✅  (dto/user)
 * ============================================================ */

/** 기본 사용자 정보 */
export interface UserResponse {
  id: number
  username: string
}

/** PUT /api/users/me/mobility-profile — 이동특성 저장·수정 */
export interface MobilityProfileSaveRequest {
  walkingDuration: WalkingDuration
  stairLevel: StairLevel
  restStopPreference: RestStopPreference
  transferLevel: TransferLevel
  mobilityAid: MobilityAid
  /** mobilityAid === 'OTHER' 일 때만 필요 (≤100자) */
  mobilityAidDetail?: string | null
}

/** GET /api/users/me/mobility-profile */
export interface MobilityProfileResponse {
  id: number
  walkingDuration: WalkingDuration
  stairLevel: StairLevel
  restStopPreference: RestStopPreference
  transferLevel: TransferLevel
  mobilityAid: MobilityAid
  mobilityAidDetail?: string | null
}

/** PUT /api/users/me/accessibility-settings */
export interface AccessibilitySettingUpdateRequest {
  voiceGuidanceEnabled: boolean
  highContrastEnabled: boolean
  fontSize: FontSize
  /** 음성 안내 속도 0.7 ~ 1.4 (소수 둘째 자리까지) */
  voiceSpeed: number
}

/** GET /api/users/me/accessibility-settings */
export interface AccessibilitySettingResponse {
  id: number
  voiceGuidanceEnabled: boolean
  highContrastEnabled: boolean
  fontSize: FontSize
  voiceSpeed: number
}

/** GET /api/users/me/settings — 설정 화면 한 번에 조회 */
export interface UserSettingsResponse {
  /** 경로 추천 기준 */
  mobilityProfile: MobilityProfileResponse
  /** 보기와 듣기 */
  accessibilitySettings: AccessibilitySettingResponse
  /** 내 정보와 안전(요약) */
  safety: {
    homeAddress: string | null
    emergencyContactCount: number
  }
}

/* ============================================================
 *  4. 장소 검색 / 즐겨찾기 / 집주소  ✅  (dto/place)
 * ============================================================ */

/** GET /api/places/search 쿼리 파라미터 (BE 는 문자열로 수신) */
export interface PlaceSearchRequest {
  keyword: string
  lat?: string
  lon?: string
  radiusKm?: string
  page?: string
  size?: string
}

/** 장소 한 건 */
export interface PlaceItemResponse {
  placeId: string
  name: string
  address: string
  latitude: number
  longitude: number
}

/** 장소 검색 결과 (페이지네이션 포함) */
export interface PlaceSearchResponse {
  places: PlaceItemResponse[]
  pagination: {
    page: number
    size: number
    totalCount: number
    hasNext: boolean
  }
}

/** POST /api/users/me/favorites — 즐겨찾기 등록 */
export interface FavoritePlaceSaveRequest {
  name: string
  address: string
  latitude: number
  longitude: number
}

/** PATCH /api/users/me/favorites/{favoriteId} — 별칭 수정 */
export interface FavoritePlaceUpdateRequest {
  name: string
}

/** 즐겨찾기 장소 */
export interface FavoritePlaceResponse {
  id: number
  name: string
  address: string
  latitude: number
  longitude: number
}

/** PUT /api/users/me/home — 집주소 저장 */
export interface HomePlaceSaveRequest {
  address: string
  latitude: number
  longitude: number
}

/** GET /api/users/me/home */
export interface HomePlaceResponse {
  address: string
  latitude: number
  longitude: number
}

/* ============================================================
 *  5. 안전 / 비상연락처  ✅  (dto/user - EmergencyContact)
 * ============================================================ */

/** POST·PUT /api/users/me/emergency-contacts */
export interface EmergencyContactSaveRequest {
  name: string
  relationship: string
  /** ^[0-9-]{8,20}$ */
  phoneNumber: string
  /** 우선순위 1 이상 */
  priority: number
}

/** 비상 연락처 */
export interface EmergencyContactResponse {
  id: number
  name: string
  relationship: string
  phoneNumber: string
  priority: number
}

/* ============================================================
 *  6. 🟡 상담(chat) — BE 컨트롤러 미구현, 노션 명세서 기준. Mock 전용.
 *     실제 붙일 때 이 섹션을 BE 최종 DTO 로 교체한다.
 * ============================================================ */

export type InputType = 'TEXT' | 'VOICE'

/** 경로 종류 — 가장 편한 길 / 걷기 적은 길 / 똑버스 */
export type RouteKey = 'comfort' | 'short' | 'drt'

/** 편의시설·이동조건 한 줄 (status = 확인/주의/정보) */
export interface RouteFacility {
  status: 'ok' | 'warn' | 'info'
  label: string
  value: string
}

/** 추천 경로 한 건 */
export interface RouteOption {
  key: RouteKey
  title: string
  sub: string
  time: string
  walk: string
  transfer: string
  facilities: RouteFacility[]
  notice: string
  guide: 'navigate' | 'drt' // '이 길로 안내받기' vs '똑버스 이용 방법 보기'
}

/** 경로 추천 결과 (여러 경로 비교 + 오늘 추천) */
export interface RouteResult {
  destination: string
  origin: string
  options: RouteOption[]
  recommendedKey: RouteKey
}

/** 지난 길찾기 기록 한 건 (BE RouteSearchHistory 컨트롤러 미구현 → 현재 Mock) */
export interface RouteHistoryItem {
  id: number
  destination: string
  when: string
  routeKey: RouteKey
  badgeLabel: string
  badgeTone: 'default' | 'drt' | 'warn'
}

/* ============================================================
 *  7. 🗑️ 레거시 (피벗 이전 · 판단카드 화면 전용)
 *     ── ResultScreen/ChatScreen/HistoryScreen/ShareScreen 이 아직 참조.
 *        경로추천 화면으로 마이그레이션 완료되면 이 블록 전체 삭제.
 * ============================================================ */

/** 🗑️ 백엔드 → 프론트 응답의 종류 */
export type ResponseType = 'QUESTION' | 'RESULT' | 'NEED_CHECK' | 'ERROR'

/** 🗑️ 결과 카드 5종 (판단카드 모델) */
export type ResultType =
  | 'ALONE_OK'
  | 'DRT_RECOMMENDED'
  | 'GUARDIAN_RECOMMENDED'
  | 'STAFF_CHECK'
  | 'NEED_CHECK'

/** 🗑️ 상담 진행 단계 */
export type CurrentStep =
  | 'ASK_DESTINATION'
  | 'ASK_DEPARTURE'
  | 'ASK_TIME'
  | 'ASK_COMPANION'
  | 'ASK_WALKING_DIFFICULTY'
  | 'ASK_DRT_PREFERENCE'
  | 'CONFIRM_SUMMARY'
  | 'READY_TO_RESULT'
  | 'COMPLETED'

/** 🗑️ 상담 중 수집되는 상태값 */
export interface CounselingSlots {
  departure: string | null
  departureRegion: string | null
  destination: string | null
  destinationRegion: string | null
  travelDateOrTime: string | null
  hasCompanion: boolean | null
  hasWalkingDifficulty: boolean | null
  prefersDRT: boolean | null
  confirmed: boolean
  currentStep: CurrentStep | null
}

/** 🗑️ 결과 이후 다음 행동 */
export type NextAction =
  | 'MAP'
  | 'CALL_DRT'
  | 'CALL_STAFF'
  | 'STAFF_CHECK'
  | 'SHARE_GUARDIAN'
  | 'RETRY'

/** 🗑️ DRT 부가 안내 */
export interface DrtInfo {
  serviceName: string
  area: string
  reservePhone: string
}

/** 🗑️ 최종 결과 카드 (판단카드) */
export interface ResultCard {
  resultType: ResultType
  title: string
  summary: string
  reasons: string[]
  caution?: string
  needStaffCheck: boolean
  nextActions: NextAction[]
  drtInfo?: DrtInfo
}

/** 🗑️ 빠른 답변 버튼 */
export interface QuickReply {
  label: string
  value: string
}

/** 🗑️ 상담 시작 응답 */
export interface StartSessionResponse {
  sessionId: string
}

/** 🗑️ 상담 메시지 요청 */
export interface CounselingRequest {
  sessionId: string
  message: string
  inputType: InputType
}

/** 🗑️ 백엔드 → 프론트 통합 응답 (판단카드) */
export interface CounselingResponse {
  sessionId: string
  type: ResponseType
  message: string
  missingSlots?: string[]
  quickReplies?: QuickReply[]
  resultCard?: ResultCard | null
}
