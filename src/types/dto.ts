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

/**
 * 한 번에 걸을 수 있는 시간 (20~30 사이 구간 없음에 주의).
 * 2026-08-06 BE 중간 배포에서 `UNABLE_TO_WALK` 가 추가됐다 —
 * "'보행 불가'가 BE enum 에 없어 10분이내로 수렴 중" 이던 회의 안건이 해소됐다.
 */
export type WalkingDuration =
  | 'UNABLE_TO_WALK'
  | 'WITHIN_10_MINUTES'
  | 'WITHIN_20_MINUTES'
  | 'OVER_30_MINUTES'

/** 계단 이용 정도 */
export type StairLevel = 'AVAILABLE' | 'SLIGHTLY_DIFFICULT' | 'DIFFICULT'

/**
 * 오르막(경사) 이동 정도. ✅ 2026-08-13 BE 확정 (Gilbut_BE SlopeLevel enum, 재형님).
 * 계단(StairLevel)과 동일한 3값. AI 스코어링이 이 값으로 경사 민감도(LOW/MEDIUM/HIGH)를 정한다.
 *   AVAILABLE(괜찮음)→LOW · SLIGHTLY_DIFFICULT(조금 힘듦)→MEDIUM · DIFFICULT(많이 힘듦)→HIGH
 */
export type SlopeLevel = 'AVAILABLE' | 'SLIGHTLY_DIFFICULT' | 'DIFFICULT'

/** 쉬어 갈 곳 필요 여부 */
export type RestStopPreference = 'REQUIRED' | 'NO_PREFERENCE'

/** 환승 선호 정도 */
export type TransferLevel = 'AVAILABLE' | 'FEWER_PREFERRED' | 'AVOID_PREFERRED'

/**
 * 이동 보조기구.
 * 7/31 회의: "휠체어 이용자에게는 똑버스 대신 콜택시를 안내한다" → 휠체어 식별이 필수.
 * 2026-08-07 BE 리팩토링으로 enum 이 3값으로 정리됐다 — 여기에 맞춘다.
 *   NOT_USED(사용 안 함) · CANE_OR_WALKER(지팡이·보행기) · WHEELCHAIR(휠체어)
 * (BE 초기 배포의 NOT_USED|USED 2값 불일치는 해소됨. OTHER·mobilityAidDetail 은 BE 에 없어 제거.)
 */
export type MobilityAid = 'NOT_USED' | 'CANE_OR_WALKER' | 'WHEELCHAIR'

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
  slopeLevel: SlopeLevel // ✅ BE @NotNull 필수 — 온보딩에서 반드시 함께 보낸다
  restStopPreference: RestStopPreference
  transferLevel: TransferLevel
  mobilityAid: MobilityAid
}

/** GET /api/users/me/mobility-profile */
export interface MobilityProfileResponse {
  id: number
  walkingDuration: WalkingDuration
  stairLevel: StairLevel
  slopeLevel: SlopeLevel
  restStopPreference: RestStopPreference
  transferLevel: TransferLevel
  mobilityAid: MobilityAid
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
 *  6. ✅ 상담(chat) — 2026-08-07 BE 배포 확정 계약 (chat-controller)
 *     서버가 상태를 끌고 가는 방식: POST /api/chat 에 발화를 보내면
 *     서버가 {현재 상태, 응답 타입, 메시지, 장소 후보} 를 돌려주고,
 *     각 단계는 *-confirmation 엔드포인트로 확정한다.
 * ============================================================ */

/** 상담 진행 상태 (서버 주도 상태머신) */
export type ChatState =
  | 'DESTINATION_WAITING'
  | 'ORIGIN_CONFIRMATION'
  | 'HOME_CONFIRMATION'
  | 'DEPARTURE_TIME_CONFIRMATION'
  | 'TODAY_CONDITION_CONFIRMATION'
  | 'ROUTE_CALCULATING'
  | 'STAIR_ROUTE_CONFIRMATION'
  | 'RESULT_PRESENTATION'
  | 'NAVIGATING'
  | 'ARRIVED'

/** 응답을 화면에 어떻게 그릴지 — 일반 텍스트 / 장소 후보 목록 / 선택 버튼 */
export type ChatResponseType = 'TEXT' | 'PLACE_CANDIDATES' | 'CHOICE_OPTIONS'

/** 출발지 종류 */
export type OriginType = 'CURRENT_LOCATION' | 'HOME' | 'PLACE'

/**
 * 당일 상태. ⚠️ 7/31 회의에서 프론트는 '당일 상태' 질문을 뺐는데,
 * BE 챗봇은 TODAY_CONDITION_CONFIRMATION 단계를 두고 이 값을 받는다 → 팀 정합 필요.
 * WHEELCHAIR 가 여기 섞여 있어(온보딩 mobilityAid 와 별개) 확인이 더 필요하다.
 */
export type TodayCondition = 'NORMAL' | 'INCREASED_DISCOMFORT' | 'WHEELCHAIR'

/** 상담 문맥 속 장소 (목적지·출발지) */
export interface PlaceContext {
  placeId: string
  name: string
  address: string
  latitude: number
  longitude: number
}

/** POST /api/chat — 사용자 발화 */
export interface ChatMessageRequest {
  message: string
}

/** POST /api/chat 응답 — 다음에 화면이 뭘 보여줄지 */
export interface ChatMessageResponse {
  sessionId: string
  currentState: ChatState
  responseType: ChatResponseType
  message: string
  /** responseType === 'PLACE_CANDIDATES' 일 때 채워짐 */
  places: PlaceItemResponse[]
}

/** GET /api/chat/session — 현재 세션 스냅샷 */
export interface ChatSessionResponse {
  sessionId: string
  currentState: ChatState
  destination: PlaceContext | null
  originType: OriginType | null
  origin: PlaceContext | null
  selectedRouteId: string | null
  activeRequestId: string | null
  departureDateTime: string | null
  todayCondition: TodayCondition | null
}

/** POST /api/chat/place-confirmation — 목적지 후보 확정 */
export interface PlaceConfirmationRequest {
  placeId: string
  name: string
  address: string
  latitude: number
  longitude: number
}

/** POST /api/chat/origin-confirmation — 출발지 확정 */
export interface OriginConfirmationRequest {
  originType: OriginType
  placeId?: string
  name?: string
  address?: string
  latitude?: number
  longitude?: number
}

/** POST /api/chat/departure-time-confirmation — 출발 시각 확정 (ISO 8601) */
export interface DepartureTimeConfirmationRequest {
  departureDateTime: string
}

/** POST /api/chat/today-condition-confirmation — 당일 상태 확정 */
export interface TodayConditionConfirmationRequest {
  todayCondition: TodayCondition
}

/* ------------------------------------------------------------
 *  6-legacy. 🗑️ 피벗 이전(판단카드) 상담 모델 — mock/counseling.ts 전용.
 *     실서버는 위 §6 계약을 쓴다. 화면 마이그레이션 후 제거 예정.
 * ------------------------------------------------------------ */

export type InputType = 'TEXT' | 'VOICE'

/**
 * 경로 종류 — 가장 편한 길 / 걷기 적은 길 / 똑버스 / 장애인 콜택시.
 * `calltaxi` 는 7/31 회의 결정: 수원 똑버스는 휠체어를 탄 채로 탈 수 없어, 휠체어 이용자에게는
 * 똑버스 자리에 장애인 콜택시 콜센터 안내를 대신 노출한다.
 */
export type RouteKey = 'comfort' | 'short' | 'drt' | 'calltaxi'

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
  /** 주 버튼이 어디로 가는지 — 길 안내 / 똑버스 안내 / 콜택시 안내 */
  guide: 'navigate' | 'drt' | 'calltaxi'
}

/**
 * 계단 회피 경로 ↔ 계단 포함 경로 비교.
 * 7/31 회의: 시스템이 한 경로를 일방적으로 고르지 않고, 두 경로의 보행 거리·시간 차이를 보여준 뒤
 * 사용자가 직접 고르게 한다. (계단 '조금 어려움'일 때만 물어봄)
 */
export interface StairRouteOption {
  /** 예상 소요 시간(분) */
  minutes: number
  /** 걷는 시간(분) */
  walkMinutes: number
  /** 걷는 거리(m) */
  meters: number
}

export interface StairComparison {
  withStairs: StairRouteOption & { stairFact: string }
  noStairs: StairRouteOption
}

/**
 * 경로를 못 불러왔을 때의 원인 — 원인마다 사용자에게 안내할 다음 행동이 다르다.
 * `quota` 가 실제로 잦다: TMAP 대중교통 API 무료 플랜이 하루 10건이라
 * 백엔드 PoC 에서 20건 중 12건이 429 QUOTA_EXCEEDED 로 실패했다.
 */
export type RouteErrorKind =
  | 'quota' //   API 한도 초과 (429)
  | 'none' //    조건에 맞는 경로 없음
  | 'outside' // 서비스 지역(수원) 밖
  | 'offline' // 네트워크 끊김
  | 'server' //  그 밖의 서버 오류

/** 경로 추천 결과 (여러 경로 비교 + 오늘 추천) */
export interface RouteResult {
  destination: string
  origin: string
  options: RouteOption[]
  recommendedKey: RouteKey
  /** 계단 선택을 물어야 하는 경우에만 채워진다 (아니면 null) */
  stairComparison: StairComparison | null
}

/** 지난 길찾기 기록 한 건 — 화면용(프론트가 만든 형태). BE 응답은 아래 RouteHistoryResponse. */
export interface RouteHistoryItem {
  id: number
  destination: string
  when: string
  routeKey: RouteKey
  badgeLabel: string
  badgeTone: 'default' | 'drt' | 'warn'
}

/**
 * ✅ BE 「상담 이력」 실계약 (GET /api/routes/history) — 목록 한 건.
 *    2026-08-14 Gilbut_BE #32 RouteHistoryResponse 에서 옮김.
 *    화면용 RouteHistoryItem 으로의 번역은 api/mapHistory.ts 어댑터가 담당한다.
 *    (route 실호출이 있어야 BE에 기록이 쌓이므로, 스위치는 경사도/route 준비 후 켠다.)
 */
export interface RouteHistoryResponse {
  historyId: number
  originName: string
  destinationName: string
  recommendedRouteId: string
  recommendedRouteType: RouteType
  recommendedRouteOption: WalkingRouteOption | null
  totalTimeSec: number
  totalWalkTimeSec: number
  totalWalkDistanceM: number
  transferCount: number
  drtRecommended: boolean
  drtServiceArea: string | null
  createdAt: string
}

/* ============================================================
 *  6-BE. ✅ BE 「맞춤 경로 추천」 실계약 (POST /api/routes/recommendations)
 *     2026-08-14 Gilbut_BE 실코드에서 그대로 옮김 (RouteRecommendationResult 외).
 *     위쪽 RouteResult 는 화면용(편집형 4카드), 이건 BE 가 실제로 주는 원본이다.
 *     둘 사이 번역은 api/mapRecommendation.ts 의 어댑터가 담당한다.
 *     ⚠️ 아직 FORCED_MOCK 에 'route' 가 있어 실호출은 안 한다 — 스위치 뺄 때 어댑터를 붙인다.
 * ============================================================ */

/** 좌표 (BE PlaceRequest) */
export interface LatLng {
  latitude: number
  longitude: number
}

/** POST /api/routes/recommendations 요청 — 출발지·목적지 좌표 + 출발시각(ISO 8601) */
export interface RouteRecommendationRequest {
  origin: LatLng
  destination: LatLng
  departureDateTime: string
}

/** 경로 이동 유형 */
export type RouteType = 'WALKING' | 'TRANSIT'

/** 보행 경로 탐색 조건 (TRANSIT 후보에서는 null) */
export type WalkingRouteOption = 'DEFAULT' | 'AVOID_STAIRS'

/** 경로 후보 지표 (초·미터 단위 원본) */
export interface RouteMetricsDto {
  totalTimeSec: number
  totalWalkTimeSec: number
  totalWalkDistanceM: number
  transferCount: number
}

/** 경로 후보 (BE RouteCandidate — walkSegments 는 @JsonIgnore 라 응답에 없음) */
export interface RouteCandidateDto {
  routeId: string
  routeType: RouteType
  routeOption: WalkingRouteOption | null
  providerRank: number
  metrics: RouteMetricsDto
}

/** 점수 세부 (AI ScoreBreakdown) — 항목별 감점 */
export interface ScoreBreakdown {
  walkTimePenalty: number
  walkDistancePenalty: number
  obstaclePenalty: number
  transferPenalty: number
  weatherPenalty: number
  slopePenalty: number
}

/** 경사 분석 상태 (NOT_REQUESTED = 경사 계산 미실행) */
export type SlopeAnalysisStatus = 'NOT_REQUESTED' | 'SUCCESS' | 'PARTIAL' | 'FAILED'

/** 경사 요약 (AI SlopeSummary) */
export interface SlopeSummary {
  status: SlopeAnalysisStatus
  sampleIntervalM: number | null
  analyzedSegmentCount: number | null
  totalEligibleSegmentCount: number | null
  maxUphillGradePercent: number | null
  maxDownhillGradePercent: number | null
  totalAscentM: number | null
  totalDescentM: number | null
}

/** 추천 경로 한 건 (rank 순) */
export interface RouteRecommendationItemDto {
  routeId: string
  candidate: RouteCandidateDto
  score: number
  rank: number
  scoreBreakdown: ScoreBreakdown | null
  slopeSummary: SlopeSummary | null
}

/** DRT/콜택시 판단 근거 코드 */
export type DrtReasonCode =
  | 'ASSISTIVE_DEVICE'
  | 'LONG_WALK_DISTANCE'
  | 'MANY_TRANSFERS'
  | 'SEVERE_WEATHER'
  | 'NO_PASSABLE_ROUTE'

/** DRT/콜택시 안내 판단 (show=노출 · priority=우선추천 · taxiGuide=콜택시로 안내) */
export interface DrtDecision {
  show: boolean
  priority: boolean
  taxiGuide: boolean
  reasonCodes: DrtReasonCode[]
  basedOnRouteId: string | null
}

/**
 * POST /api/routes/recommendations 응답.
 * walkingRoute/transitRoutes/filteredResults 는 지도·상세용 큰 구조라 지금 화면이 안 써서
 * unknown 으로 둔다(붙일 때 walking/transit 응답 타입을 별도 이식). recommendations·drtDecision 만 어댑터가 쓴다.
 */
export interface RouteRecommendationResult {
  requestId: string
  scoringVersion: string
  recommendations: RouteRecommendationItemDto[]
  filteredResults: unknown[] | null
  drtDecision: DrtDecision | null
  walkingRoute: unknown | null
  transitRoutes: unknown | null
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
