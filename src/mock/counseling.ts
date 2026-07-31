/**
 * ============================================================
 *  Mock 상담 엔진 (백엔드 대역) — 기획서 6장 기준으로 재구성
 * ============================================================
 *  · 질문 흐름  : 기획서 6-1 (목적지→출발지→시간→동행→보행→DRT선호→최종확인)
 *  · 판단 로직  : 기획서 6-2 (지역위험 / 통학로위험 / DRT구역 / 보행상태 조합)
 *  · 데이터     : 실제로는 region_mobility_score.csv / school_route_risk.csv /
 *                drt_zone.geojson 를 조회. 지금은 Mock 신호로 대체.
 *  · 설계 원칙  : 최종 판단은 '규칙 기반'(아래 decideResult). LLM 은 문구만 담당.
 *
 *  응답 형식(CounselingResponse)은 실서버와 100% 동일하게 유지한다.
 * ------------------------------------------------------------
 */
import type {
  CounselingRequest,
  CounselingResponse,
  CounselingSlots,
  QuickReply,
  ResultCard,
  ResultType,
  StartSessionResponse,
} from '../types/dto'

type Severity = 'none' | 'mild' | 'severe'

/** Mock 내부 상태 = DTO 슬롯 + 화면엔 안 보내는 보조값 */
interface MockState extends CounselingSlots {
  _walkSeverity: Severity
}

/** 세션별 상태 저장소 (실서버에선 MySQL 이 담당) */
const sessions = new Map<string, MockState>()

function emptyState(): MockState {
  return {
    departure: null,
    departureRegion: null,
    destination: null,
    destinationRegion: null,
    travelDateOrTime: null,
    hasCompanion: null,
    hasWalkingDifficulty: null,
    prefersDRT: null,
    confirmed: false,
    currentStep: 'ASK_DESTINATION',
    _walkSeverity: 'none',
  }
}

/** 살짝 지연을 줘서 실제 네트워크처럼 보이게 한다 */
function delay<T>(value: T, ms = 550): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export function mockStartSession(): Promise<StartSessionResponse> {
  const sessionId = `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  sessions.set(sessionId, emptyState())
  return delay({ sessionId }, 250)
}

export function mockSendMessage(
  req: CounselingRequest,
): Promise<CounselingResponse> {
  const s = sessions.get(req.sessionId) ?? emptyState()
  sessions.set(req.sessionId, s)
  const text = req.message.trim()

  switch (s.currentStep) {
    // 1. 목적지
    case 'ASK_DESTINATION': {
      if (isUnclear(text)) return delay(needCheck(req.sessionId)) // 목적지 불명확 → 확인 필요
      s.destination = text
      s.destinationRegion = guessRegion(text)
      s.currentStep = 'ASK_DEPARTURE'
      return delay(
        ask(req.sessionId, '지금 계신 곳에서 출발하시나요?', [
          { label: '네, 여기서요', value: '여기서 출발' },
          { label: '다른 곳에서요', value: '다른 곳' },
        ], ['departure']),
      )
    }

    // 2. 출발지
    case 'ASK_DEPARTURE': {
      s.departure = /다른/.test(text) ? '다른 출발지' : '현재 위치'
      s.departureRegion = s.destinationRegion
      s.currentStep = 'ASK_TIME'
      return delay(
        ask(req.sessionId, '오늘 가시나요?', [
          { label: '네, 오늘요', value: '오늘' },
          { label: '다른 날이요', value: '다른 날' },
        ], ['travelDateOrTime']),
      )
    }

    // 3. 시간
    case 'ASK_TIME': {
      s.travelDateOrTime = /다른/.test(text) ? '다른 날' : '오늘'
      s.currentStep = 'ASK_COMPANION'
      return delay(
        ask(req.sessionId, '혼자 가시나요, 함께 가시는 분이 있나요?', [
          { label: '혼자 가요', value: '혼자 가요' },
          { label: '같이 가는 사람 있어요', value: '같이 가요' },
        ], ['hasCompanion']),
      )
    }

    // 4. 동행 여부
    case 'ASK_COMPANION': {
      s.hasCompanion = /같이|함께|동행|있/.test(text)
      s.currentStep = 'ASK_WALKING_DIFFICULTY'
      return delay(
        ask(req.sessionId, '걷는 데 불편함이 있으신가요?', [
          { label: '괜찮아요', value: '괜찮아요' },
          { label: '다리가 조금 아파요', value: '조금 아파요' },
          { label: '많이 불편해요', value: '많이 불편해요' },
        ], ['hasWalkingDifficulty']),
      )
    }

    // 5. 보행 상태
    case 'ASK_WALKING_DIFFICULTY': {
      s._walkSeverity = walkingSeverity(text)
      s.hasWalkingDifficulty = s._walkSeverity !== 'none'
      s.currentStep = 'ASK_DRT_PREFERENCE'
      return delay(
        ask(req.sessionId, 'DRT나 이동지원 차량을 알아볼까요?', [
          { label: '네, 알아봐 주세요', value: '네 알아봐주세요' },
          { label: '아니요, 괜찮아요', value: '아니요' },
        ], ['prefersDRT']),
      )
    }

    // 6. DRT/이동지원 선호 → 최종 확인으로
    case 'ASK_DRT_PREFERENCE': {
      s.prefersDRT = /네|알아|응|예|좋/.test(text) && !/아니|괜찮/.test(text)
      s.currentStep = 'CONFIRM_SUMMARY'
      return delay(ask(req.sessionId, summaryText(s), [
        { label: '네, 맞아요', value: '네 맞아요' },
        { label: '다시 할게요', value: '다시 할게요' },
      ]))
    }

    // 최종 확인 ("제가 이렇게 이해했어요, 맞나요?")
    case 'CONFIRM_SUMMARY': {
      if (isNo(text)) {
        Object.assign(s, emptyState())
        return delay(
          ask(req.sessionId, '다시 여쭤볼게요. 어디로 가고 싶으세요?', [
            { label: '🏥 병원', value: '병원' },
            { label: '🛒 시장', value: '시장' },
            { label: '🏛 주민센터', value: '주민센터' },
          ]),
        )
      }
      s.confirmed = true
      s.currentStep = 'COMPLETED'
      const signals = lookupRegionData(s.destinationRegion ?? '', s.destination ?? '')
      const resultType = decideResult(signals, s)
      return delay(result(req.sessionId, resultType, s.destination ?? '○○'), 1300)
    }

    // 상담이 끝난 세션에 또 말하면 새로 시작
    default: {
      Object.assign(s, emptyState())
      return delay(
        ask(req.sessionId, '새로 상담을 시작할게요. 어디로 가고 싶으세요?', [
          { label: '🏥 병원', value: '병원' },
          { label: '🛒 시장', value: '시장' },
          { label: '🏛 주민센터', value: '주민센터' },
        ]),
      )
    }
  }
}

/* ================= 판단 로직 (기획서 6-2) ================= */

interface RegionSignals {
  regionRisk: 'low' | 'medium' | 'high' // 지역 위험도 (region_mobility_score.csv)
  hasRouteRisk: boolean //                통학로/보행 위험요소 (school_route_risk.csv)
  inDrtZone: boolean //                   DRT 운행구역 포함 (drt_zone.geojson)
}

/**
 * 기획서 6-2 최종 판단 로직 (규칙 기반).
 * 표의 조건을 위에서부터 우선순위대로 검사한다.
 */
function decideResult(sig: RegionSignals, s: MockState): ResultType {
  const severity = s._walkSeverity
  const alone = !s.hasCompanion

  // ① 보행 불편 있음 + DRT 구역 포함 → DRT 문의 권장
  if (severity !== 'none' && sig.inDrtZone) return 'DRT_RECOMMENDED'

  // ② DRT 구역 밖 + 보행 불편 큼 → 이동지원/직원 확인 권장
  if (severity === 'severe' && !sig.inDrtZone) return 'STAFF_CHECK'

  // ③ 지역 위험 보통 이상 또는 통학로 위험요소 존재 + 혼자 이동 → 보호자 동행 권장
  if ((sig.regionRisk !== 'low' || sig.hasRouteRisk) && alone) return 'GUARDIAN_RECOMMENDED'

  // ④ 지역 위험 낮음 + 보행 불편 없음 + 위험요소 적음 → 혼자 이동 가능
  if (sig.regionRisk === 'low' && severity === 'none' && !sig.hasRouteRisk) return 'ALONE_OK'

  // 경계 케이스(안전 우선): 보행 불편이 남아있으면 보호자 동행 권장
  if (severity !== 'none') return 'GUARDIAN_RECOMMENDED'

  // 동행자가 있어 위험이 상쇄되는 경우 → 이동 가능
  return 'ALONE_OK'
}

/**
 * 지역/DRT/보행 위험 신호 조회.
 * 실제로는 3종 데이터 파일을 조회한다. 지금은 Mock (목적지 텍스트 기반, 결정적).
 */
function lookupRegionData(region: string, destination: string): RegionSignals {
  const table: Record<string, RegionSignals> = {
    강서구: { regionRisk: 'medium', hasRouteRisk: true, inDrtZone: true },
    '○○구': { regionRisk: 'low', hasRouteRisk: false, inDrtZone: true },
  }
  if (table[region]) return table[region]

  // 미등록 지역 기본값: 목적지 글자 합으로 임시 분기 (Mock — 데모에서 여러 결과가 나오도록)
  const h = [...destination].reduce((a, c) => a + c.charCodeAt(0), 0)
  return {
    regionRisk: h % 3 === 0 ? 'high' : h % 3 === 1 ? 'medium' : 'low',
    hasRouteRisk: h % 2 === 0,
    inDrtZone: h % 2 === 1,
  }
}

/* ================= 입력 해석 ================= */

function walkingSeverity(text: string): Severity {
  if (/많이|힘들|심하게|못/.test(text)) return 'severe'
  if (/조금|약간|아파|불편/.test(text)) return 'mild'
  return 'none'
}
function isUnclear(text: string): boolean {
  return text.length < 2 || /몰라|글쎄|모르|아무/.test(text)
}
function isNo(text: string): boolean {
  return /아니|다시|틀|아뇨|아녀/.test(text)
}
function guessRegion(text: string): string {
  const m = text.match(/([가-힣]+구|[가-힣]+동|[가-힣]+시)/)
  return m ? m[1] : '○○구'
}

/** 최종 확인 문구 */
function summaryText(s: MockState): string {
  const comp = s.hasCompanion ? '동행이 있으심' : '혼자 이동'
  const walk =
    s._walkSeverity === 'none'
      ? '걷는 건 괜찮으심'
      : s._walkSeverity === 'mild'
        ? '다리가 조금 불편하심'
        : '많이 불편하심'
  return `${s.destination}에 ${s.travelDateOrTime ?? '오늘'} 가시고, ${comp}, ${walk}으로 이해했어요. 맞나요?`
}

/* ================= 응답 빌더 ================= */

function ask(
  sessionId: string,
  message: string,
  quickReplies: QuickReply[],
  missingSlots: string[] = [],
): CounselingResponse {
  return { sessionId, type: 'QUESTION', message, quickReplies, missingSlots }
}

function needCheck(sessionId: string): CounselingResponse {
  return {
    sessionId,
    type: 'RESULT',
    message: '조금 더 확인이 필요해요.',
    resultCard: buildCard('NEED_CHECK', '○○'),
  }
}

function result(sessionId: string, resultType: ResultType, dest: string): CounselingResponse {
  return {
    sessionId,
    type: 'RESULT',
    message: '이동 상담 결과가 나왔어요.',
    resultCard: buildCard(resultType, dest),
  }
}

/** 결과 카드 5종 — 실제로는 response_template.json 이 이 문구를 제공 */
export function buildCard(resultType: ResultType, dest: string): ResultCard {
  switch (resultType) {
    case 'ALONE_OK':
      return {
        resultType,
        title: '혼자 이동 가능합니다',
        summary: '지역 위험이 낮고 보행 여건이 양호해요.',
        reasons: [
          '횡단보도 턱이 낮고 보도블록이 평탄합니다.',
          '출구 방향 공사 중 — 우회를 권장합니다.',
        ],
        needStaffCheck: false,
        nextActions: ['MAP', 'SHARE_GUARDIAN'],
      }
    case 'DRT_RECOMMENDED':
      return {
        resultType,
        title: 'DRT 문의를 권장합니다',
        summary:
          '현재 조건에서는 혼자 이동보다 DRT(수요응답형 버스) 또는 보호자 동행이 더 안전할 수 있어요.',
        reasons: ['보행 불편이 있습니다.', 'DRT 운행구역에 포함될 가능성이 있습니다.'],
        caution: '실제 예약 가능 여부는 반드시 운영기관에 확인해 주세요.',
        needStaffCheck: true,
        nextActions: ['CALL_DRT', 'STAFF_CHECK', 'SHARE_GUARDIAN'],
        drtInfo: { serviceName: '○○ 행복버스', area: '○○동 · △△동', reservePhone: '1600-0000' },
      }
    case 'GUARDIAN_RECOMMENDED':
      return {
        resultType,
        title: '보호자 동행을 권장합니다',
        summary: `${dest} 가시는 길에 보행 위험요소가 있어, 보호자와 함께 이동하시길 권해드려요.`,
        reasons: ['지역 위험도가 보통 이상이거나 통학로 위험요소가 있습니다.', '혼자 이동 시 안전 우려가 있습니다.'],
        needStaffCheck: false,
        nextActions: ['SHARE_GUARDIAN', 'STAFF_CHECK'],
      }
    case 'STAFF_CHECK':
      return {
        resultType,
        title: '이동지원 · 직원 확인을 권장합니다',
        summary:
          '보행이 많이 불편한데 DRT 운행구역 밖이에요. 교통약자 이동지원 서비스나 복지관 직원의 확인을 받아보세요.',
        reasons: ['보행 불편이 큽니다.', 'DRT 운행구역에 포함되지 않습니다.'],
        caution: '대상 여부와 이용 방법은 운영기관에 확인해 주세요.',
        needStaffCheck: true,
        nextActions: ['CALL_STAFF', 'STAFF_CHECK', 'SHARE_GUARDIAN'],
        drtInfo: {
          serviceName: '○○ 교통약자 이동지원센터',
          area: '보행 불편·장애 등록자',
          reservePhone: '1666-0000',
        },
      }
    case 'NEED_CHECK':
    default:
      return {
        resultType: 'NEED_CHECK',
        title: '조금 더 확인이 필요해요',
        summary:
          '지금 정보만으로는 안전 여부를 정확히 판단하기 어려워요. 목적지를 다시 확인하거나 직원의 도움을 받아보세요.',
        reasons: ['목적지 주소가 명확하지 않아요.', '보행 상태·동행 여부 정보가 부족해요.'],
        needStaffCheck: true,
        nextActions: ['RETRY', 'STAFF_CHECK'],
      }
  }
}
