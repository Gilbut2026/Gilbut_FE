import { useCallback, useEffect, useRef, useState } from 'react'
import { LocationScreen } from './LocationScreen'
import { getHome, searchPlacesNear } from '../api/place'
import {
  confirmDepartureTime,
  confirmOrigin,
  confirmPlace,
  resetChatSession,
  sendChatMessage,
} from '../api/chat'
import { ApiError } from '../api/client'
import { departureAfter, parseDepartureMinutes } from '../api/time'
import { rankPlaceCandidates, type RankedPlaces } from '../api/placeRank'
import { destinationKeyword } from '../api/destinationKeyword'
import { PlaceCandidates } from '../components/PlaceCandidates'
import { SEARCH_RADIUS_KM } from '../api/geo'
import { QUICK_DESTINATION_NAMES } from './quickDestinations'
import { ChatView, useChatLog, askAgainVerb, type InputMode } from '../components/ChatView'
import { DepartureSheet } from '../components/DepartureSheet'
import { MapPicker } from '../components/MapPicker'
import type { ChatOutcome } from '../types/nav'
import type {
  ChatMessageResponse,
  ChatSessionResponse,
  ChatState,
  LatLng,
  PlaceItemResponse,
} from '../types/dto'

/**
 * 대화로 길찾기 — BE 상태머신 실연동 엔진.
 *
 * 설계 원칙 하나: **화면은 스스로 다음 단계를 정하지 않는다.** 무엇을 물을지는 항상
 * 서버가 준 `currentState` 가 정한다. 프론트가 단계를 예측해서 앞서가면 BE 가
 * CHAT_STATE_CONFLICT 를 던지기 때문이다(각 confirmation 이 상태를 엄격히 검사한다).
 *
 * 흐름 (2026-08-15 배포 BE 기준)
 *   POST /api/chat                        발화 → {currentState, responseType, message, places[]}
 *   POST /api/chat/place-confirmation     목적지 확정  (DESTINATION_WAITING 에서만)
 *   POST /api/chat/origin-confirmation    출발지 확정  (ORIGIN_CONFIRMATION 에서만)
 *   POST /api/chat/departure-time-confirmation  출발시각 확정 (DEPARTURE_TIME_CONFIRMATION 에서만)
 *   → ROUTE_CALCULATING 이 되면 대화 끝. 결과 화면으로 넘긴다.
 *
 * BE 계약에서 걸리기 쉬운 것 세 가지 (전부 여기서 지킨다)
 *   1. 출발지가 '현재 위치'면 좌표가 필수다 (confirmCurrentLocation → validateCoordinates)
 *   2. departureDateTime 은 LocalDateTime 이라 'Z'·오프셋이 붙으면 파싱 실패한다
 *      → toLocalDateTime() 으로 'YYYY-MM-DDTHH:mm:ss' 형식으로 보낸다
 *   3. departureDateTime 은 현재 -1분 이후여야 한다 (과거 시각이면 INVALID_REQUEST)
 */

const STEP_META: Record<string, [string, string, string]> = {
  DESTINATION_WAITING: ['목적지 확인 · 1/3', 'AI가 필요한 내용만 짧게 물어봐요', '33%'],
  ORIGIN_CONFIRMATION: ['출발지 확인 · 2/3', '어디서 출발할지 알려주세요', '66%'],
  HOME_CONFIRMATION: ['출발지 확인 · 2/3', '어디서 출발할지 알려주세요', '66%'],
  DEPARTURE_TIME_CONFIRMATION: ['출발 시간 확인 · 3/3', '출발 시각에 맞춰 날씨를 확인해요', '100%'],
  ROUTE_CALCULATING: ['편한 길 찾는 중', '대화가 끝나면 편한 길을 보여드려요', '100%'],
  RESULT_PRESENTATION: ['편한 길 찾는 중', '대화가 끝나면 편한 길을 보여드려요', '100%'],
  NAVIGATING: ['안내 중', '', '100%'],
  ARRIVED: ['도착', '', '100%'],
}

export function ServerChatScreen({
  prefill,
  onBack,
  onSos,
  onToast,
  onDone,
}: {
  prefill: string | null
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
  /** 대화 끝 — 목적지·출발지·출발 시각을 한 덩어리로 넘긴다 */
  onDone: (outcome: ChatOutcome) => void
}) {
  const log = useChatLog()
  const { botSay, userSay, actions, card, push, showTyping, hideTyping } = log

  const [state, setState] = useState<ChatState>('DESTINATION_WAITING')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [locationNeeded, setLocationNeeded] = useState(false)
  // 출발 날짜·시간 고르기 시트 — 빠른 답변만으로는 오늘 안에서만 고를 수 있다
  const [timeSheet, setTimeSheet] = useState(false)

  const startedRef = useRef(false)
  const destNameRef = useRef('')
  // 확인한 목적지 좌표 — 결과 화면이 이름으로 다시 검색하지 않도록 함께 넘긴다
  const destCoordsRef = useRef<LatLng | null>(null)
  // 마지막 발화 — 서버가 준 장소 후보를 사용자가 말한 이름 기준으로 다시 정렬하는 데 쓴다
  const lastUtteranceRef = useRef('')
  /*
   * 이번 대화에서는 목적지를 AI 에게만 맡긴다는 표시.
   *
   * 빠른 길(AI 없이 프론트가 직접 검색)이 엉뚱한 곳을 보여줬을 때 사용자가
   * 「찾는 곳이 없어요」를 누른다. 그 상태에서 같은 말을 다시 하면 빠른 길이 또
   * 같은 답을 내놓는다 — 사용자는 같은 화면을 두 번 보고 갇힌다.
   * 한 번 퇴짜를 맞으면 그다음부터는 느려도 AI 에게 물어본다.
   */
  const aiOnlyRef = useRef(false)
  const homeAddrRef = useRef<string | null>(null)
  // 서버에 확정한 출발 시각 — 결과 화면이 같은 값으로 경로를 조회해야 대화와 결과가 어긋나지 않는다
  const departureRef = useRef<string>('')
  /*
   * 서버가 확정해준 출발지. 결과 화면이 이 좌표로 길을 찾는다.
   *
   * 서버 스냅샷에서 가져오는 이유 — '집'을 골랐을 때 좌표를 아는 쪽은 서버다.
   * 화면은 집 주소 문자열만 갖고 있어서, 화면이 직접 만들면 집 출발만 좌표가 빈다.
   */
  const originRef = useRef<{ name: string; coords: LatLng } | null>(null)
  /*
   * 화면에 쓸 출발지 이름 — 서버가 붙이는 이름 대신.
   *
   * 지도에서 고른 자리는 서버가 「현재 위치」라고 이름 붙인다(ChatSessionService).
   * 그대로 두면 결과 화면에 「현재 위치 → 지동시장」이 뜨는데, 어르신이 지도에서
   * 다른 데를 짚으셨다면 그건 사실이 아니다. 우리가 아는 주소를 쓴다.
   */
  const originNameRef = useRef<string | null>(null)
  // 「지도에서 고르기」를 무엇을 고르려고 열었는가. 닫혀 있으면 null
  const [mapPicker, setMapPicker] = useState<'origin' | 'destination' | null>(null)
  // 발화에 실어 보낼 현재 좌표 — "내 근처 병원" 같은 기준 위치 검색에 쓰인다(있으면 보내고 없으면 생략)
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null)
  /*
   * 말로 하시는 중인지 자판으로 치시는 중인지(ChatView 가 알려준다).
   *
   * 되물을 때 문구를 여기에 맞춘다 — 자판으로 치시는 분께 「다시 말씀해 주시겠어요?」는
   * 엉뚱한 말이다. 무엇을 하라는 것인지 알 수 없어 그 자리에서 멈추신다.
   */
  const inputModeRef = useRef<InputMode>('text')

  /**
   * 사람이 읽을 수 있는 에러 문구로 바꾼다.
   *
   * AI 관련 실패를 한 문구로 뭉치면 안 된다 — 원인마다 사용자가 할 일이 다르다.
   *   503 AI_SERVER_UNAVAILABLE  서버에 AI 주소가 설정돼 있지 않다 → 다시 눌러도 소용없다
   *   502 AI_CHAT_FAILED         호출이 늦거나 끊겼다 → 다시 하면 대개 된다
   * (AI 서버가 잠들어 있다 깨어날 때 첫 요청이 특히 오래 걸린다)
   */
  const errorText = (e: unknown): string => {
    // 말로 하시는지 자판으로 치시는지에 맞춘다 — 자판 쓰시는 분께 「말씀해」는 어긋난다
    const again = askAgainVerb(inputModeRef.current)
    if (!(e instanceof ApiError)) return `문제가 생겼어요. 다시 한 번 ${again} 주시겠어요?`
    if (e.status === 0) return '인터넷 연결을 확인해 주세요.'
    if (e.status === 503) {
      return 'AI 상담 서버가 아직 연결되지 않았어요. 아래 버튼으로 목적지를 골라주세요.'
    }
    if (e.status === 502) {
      return `응답이 늦어지고 있어요. 한 번만 다시 ${again} 주시겠어요?`
    }
    // 409(CHAT_STATE_CONFLICT)는 여기서 문구만 만들지 않는다 — fail() 이 실제로 되돌린다
    return e.message
  }

  /**
   * 목적지부터 다시 — **서버 세션까지 함께 되돌린다.**
   *
   * 화면에서만 "어디로 가고 싶으세요?"로 돌아가면 서버는 그대로 출발지 단계에 남는다.
   * 그 상태에서 "병원"을 보내면 BE 가 CHAT_STATE_CONFLICT(409)를 던진다 —
   * `POST /api/chat` 의 목적지 처리는 DESTINATION_WAITING 에서만 받기 때문이다
   * (ChatService.validateDestinationWaitingState).
   *
   * 실제로 그렇게 막혔다(2026-08-16). 목적지를 고른 뒤 「찾는 곳이 없어요 · 다시 말하기」를
   * 누르자 화면만 목적지 질문으로 돌아갔고, 추천어 「병원」을 누를 때마다
   * "대화가 꼬였어요"가 반복됐다. 되돌리는 시늉만 하고 아무것도 되돌리지 않았던 것이다.
   *
   * 화면을 되돌릴 때는 서버도 같이 되돌린다. 둘이 서로 다른 단계를 보고 있으면
   * 사용자는 무엇을 해도 빠져나올 수 없다.
   */
  const restartDestination = useCallback(
    async (message: string) => {
      setBusy(true)
      showTyping()
      try {
        await resetChatSession()
        hideTyping()
        destNameRef.current = ''
        destCoordsRef.current = null
        departureRef.current = ''
        originRef.current = null
        originNameRef.current = null
        setState('DESTINATION_WAITING')
        botSay(message)
        actions(destinationReplies())
      } catch {
        hideTyping()
        botSay('대화를 다시 시작하지 못했어요. 잠시 뒤 한 번만 더 시도해 주세요.')
      } finally {
        setBusy(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [botSay, actions, showTyping, hideTyping],
  )

  /**
   * 실패했을 때 막다른 길을 만들지 않는다.
   * 목적지를 묻는 중이었다면 고를 수 있는 버튼을 다시 내준다 — 어르신이
   * "다시 말해보세요"만 보고 무엇을 해야 할지 몰라 멈추는 것을 막는다.
   */
  const fail = useCallback(
    (e: unknown) => {
      hideTyping()
      // 서버와 화면이 서로 다른 단계를 보고 있다. 문구만 내면 같은 말을 다시 해도
      // 또 409 라서 빠져나올 수 없다 — 말한 대로 실제로 처음부터 다시 시작한다.
      if (e instanceof ApiError && e.status === 409) {
        void restartDestination('대화가 꼬였네요. 처음부터 다시 여쭤볼게요. 어디로 가고 싶으세요?')
        return
      }
      botSay(errorText(e))
      if (state === 'DESTINATION_WAITING') actions(destinationReplies())
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [botSay, hideTyping, actions, state, restartDestination],
  )

  // ── 위치·집 주소 준비 ────────────────────────────
  useEffect(() => {
    let alive = true
    getHome()
      .then((h) => {
        if (alive) homeAddrRef.current = h?.address ?? null
      })
      .catch(() => {})

    // 좌표는 미리 조용히 받아둔다 — 실패해도 대화는 그대로 진행한다.
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (alive) {
            coordsRef.current = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      )
    }
    return () => {
      alive = false
    }
  }, [])

  // ── 단계별 질문 ─────────────────────────────────
  /**
   * 목적지 빠른 답변. 어르신에게는 타이핑보다 누르는 쪽이 훨씬 쉬워서,
   * 목적지를 물을 때마다 함께 보여준다. 누르면 그 낱말을 그대로 발화로 보낸다.
   */
  const destinationReplies = () => (
    <>
      {QUICK_DESTINATION_NAMES.map((n) => (
        <button key={n} className="chat-reply" onClick={() => sendText(n)}>
          {n}
        </button>
      ))}
    </>
  )

  const originReplies = () => (
    <>
      <button className="chat-reply" onClick={pickCurrentLocation}>
        📍 현재 위치
      </button>
      {homeAddrRef.current && (
        <button className="chat-reply" onClick={pickHome}>
          🏠 집
        </button>
      )}
      {/*
        어르신께 가장 어려운 선택지가 「직접 입력」이다 — 이름을 정확히 적어야 하고
        오타 하나에 엉뚱한 데가 나온다. 지도는 눈으로 보고 짚는 것이라 훨씬 쉽다.
        그래서 직접 입력 앞에 둔다.
      */}
      <button className="chat-reply" onClick={() => setMapPicker('origin')}>
        🗺️ 지도에서 고르기
      </button>
      <button
        className="chat-reply"
        onClick={() => botSay('출발지를 아래 입력창에 적어주세요. 예: 행복아파트 정문')}
      >
        ✏️ 직접 입력
      </button>
    </>
  )

  const timeReplies = () => (
    <>
      <button className="chat-reply" onClick={() => pickDeparture('지금 바로 출발할게요', 0)}>
        🚶 지금 바로 출발
      </button>
      <button className="chat-reply" onClick={() => pickDeparture('30분 뒤에 출발할게요', 30)}>
        30분 뒤
      </button>
      <button className="chat-reply" onClick={() => pickDeparture('1시간 뒤에 출발할게요', 60)}>
        1시간 뒤
      </button>
      <button className="chat-reply" onClick={() => pickDeparture('2시간 뒤에 출발할게요', 120)}>
        2시간 뒤
      </button>
      {/* 오늘이 아닐 수도 있다 — 병원 예약은 내일 아침인 경우가 흔하다 */}
      <button className="chat-reply" onClick={() => setTimeSheet(true)}>
        📅 날짜·시간 고르기
      </button>
    </>
  )

  /**
   * 서버가 알려준 상태에 맞는 질문을 화면에 낸다.
   * confirmation 응답에는 message 가 없어서(세션 스냅샷만 온다) 문구는 프론트가 갖는다.
   */
  const askFor = useCallback(
    (next: ChatState) => {
      if (next === 'DESTINATION_WAITING') {
        // 목적지를 (다시) 물어야 하는 상태 — 고를 수 있는 선택지를 항상 함께 준다
        actions(destinationReplies())
        return
      }
      if (next === 'ORIGIN_CONFIRMATION' || next === 'HOME_CONFIRMATION') {
        botSay(
          <>
            어디서 출발하세요? <b>현재 위치</b>에서 시작하면 가장 정확해요.
          </>,
        )
        actions(originReplies())
        return
      }
      if (next === 'DEPARTURE_TIME_CONFIRMATION') {
        botSay(
          <>
            <b>언제 출발하실 예정인가요?</b>
            <br />
            출발 시각에 맞춰 날씨와 교통 상황을 확인해요.
          </>,
        )
        actions(timeReplies())
        return
      }
      if (next === 'ROUTE_CALCULATING' || next === 'RESULT_PRESENTATION') {
        botSay(
          <>
            확인했어요. 이제 대화는 여기까지 하고, <b>오늘 편한 길</b>을 보여드릴게요.
          </>,
        )
        card(
          <>
            <h3>경로를 분석하고 있어요</h3>
            <p>지도 후보와 날씨·교통, 저장해두신 이동 설정을 결합합니다.</p>
          </>,
        )
        window.setTimeout(
          () =>
            onDone({
              destination: destNameRef.current,
              destinationCoords: destCoordsRef.current ?? undefined,
              departureDateTime: departureRef.current || departureAfter(0),
              origin: originRef.current,
            }),
          1100,
        )
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [botSay, actions, card, onDone],
  )

  /** 세션 스냅샷을 받아 상태를 옮기고 다음 질문을 낸다 */
  const advance = useCallback(
    (session: ChatSessionResponse) => {
      if (session.destination?.name) destNameRef.current = session.destination.name
      if (session.origin) {
        originRef.current = {
          // 우리가 아는 이름이 있으면 그것이 맞다 (지도에서 고른 자리 등)
          name: originNameRef.current ?? session.origin.name,
          coords: { latitude: session.origin.latitude, longitude: session.origin.longitude },
        }
      }
      setState(session.currentState)
      askFor(session.currentState)
    },
    [askFor],
  )

  // ── 장소 후보 카드 ───────────────────────────────
  /**
   * 장소 후보 — 화면 모양과 더 보기 동작은 PlaceCandidates 가 갖고 있다.
   * 스크립트 대화도 같은 것을 쓴다 — 엔진이 바뀌어도 화면은 같아야 한다.
   */
  /**
   * 장소 후보 카드.
   * @param kind 무엇을 고르는 중인지 — 목적지와 출발지는 묻는 말도, 다시 묻는 방법도 다르다
   */
  function placeCandidates(
    ranked: RankedPlaces,
    onPick: (p: PlaceItemResponse) => void,
    kind: 'destination' | 'origin' = 'destination',
  ) {
    const isOrigin = kind === 'origin'
    return (
      <PlaceCandidates
        ranked={ranked}
        onPick={onPick}
        disabled={busy}
        title={isOrigin ? '어디서 출발하세요?' : '어디로 모실까요?'}
        hint={isOrigin ? '출발하실 곳을 골라주세요.' : '가시려는 곳을 골라주세요.'}
        /*
         * 목적지는 서버 세션째 되돌린다 — 화면만 되돌리면 다음 발화가 409 다
         * (restartDestination 주석 참고).
         *
         * 출발지는 되돌리지 않는다. 서버는 이미 출발지를 묻는 단계에 있어서 다시
         * 물어보기만 하면 되고, 세션을 되돌리면 **애써 확정한 목적지까지 날아간다.**
         */
        /* 이름으로 안 나오는 곳은 몇 번을 다시 말해도 안 나온다 — 지도로 빠져나갈 길을 둔다 */
        onMap={() => setMapPicker(isOrigin ? 'origin' : 'destination')}
        onRedo={
          isOrigin
            ? () => {
                botSay('출발지를 다시 알려주세요.')
                askFor('ORIGIN_CONFIRMATION')
              }
            : () => {
                // 빠른 길이 내놓은 답에 퇴짜를 맞았다 — 다음부터는 느려도 AI 에게 물어본다
                aiOnlyRef.current = true
                void restartDestination(
                  `다시 ${askAgainVerb(inputModeRef.current)} 주세요. 어디로 가고 싶으세요?`,
                )
              }
        }
      />
    )
  }

  // ── 서버 응답 처리 ───────────────────────────────
  const handleMessage = useCallback(
    (res: ChatMessageResponse) => {
      setState(res.currentState)
      if (res.message) botSay(res.message)

      if (res.responseType === 'LOCATION_REQUIRED') {
        setLocationNeeded(true)
        return
      }

      if (res.responseType === 'PLACE_CANDIDATES' && res.places?.length) {
        const pick = (p: PlaceItemResponse) => confirmDestination(p)
        // TMAP 순서는 대표 시설이 한참 아래에 오므로 다시 정렬한다 (api/placeRank 주석 참고)
        const ranked = rankPlaceCandidates(res.places, lastUtteranceRef.current)
        card(placeCandidates(ranked, pick))
        return
      }

      // CHOICE_OPTIONS / TEXT — 무엇을 고를지는 현재 상태가 정한다
      askFor(res.currentState)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [botSay, card, actions, askFor],
  )

  /** 사용자 발화 전송 */
  const sendText = useCallback(
    async (text: string) => {
      const value = text.trim()
      if (!value || busy) return
      if (value.length > 500) {
        onToast('메시지는 500자까지 보낼 수 있어요')
        return
      }
      userSay(value)
      lastUtteranceRef.current = value
      setBusy(true)
      showTyping()
      try {
        // AI 없이 되는 말이면 여기서 끝난다 — 0.5초. 안 되면 아래 원래 길로 간다
        if (await tryFastDestination(value)) return
        const res = await sendChatMessage(value, coordsRef.current ?? undefined)
        hideTyping()
        handleMessage(res)
      } catch (e) {
        /*
         * 502 는 "AI 호출이 늦거나 끊겼다"는 뜻이다. 한 번 더 보내면 대개 된다.
         *
         * 원래는 콜드스타트 때문이었다 — 잠든 컨테이너가 깨는 데 40초, 백엔드 타임아웃은
         * 30초라 첫 요청이 반드시 실패했다. 그 실패가 서버를 깨워놔서 재시도는 6~12초에 왔다.
         * 인스턴스 업그레이드로 그 원인은 사라졌지만(2026-08-16), 이 재시도는 남긴다 —
         * 배포 직후 첫 요청, 네트워크 순간 끊김 등 502 는 다른 이유로도 난다.
         * 사용자에게 "다시 말해보세요"라고 시키지 말고 우리가 한 번 대신 눌러준다.
         */
        /*
         * 점점점을 **먼저 걷어낸다.**
         *
         * 여기서 안 걷으면 아직 떠 있는 점점점 아래로 말이 붙고, 그 아래에 점점점을
         * 하나 더 띄우게 된다. 화면에는 「… / 조금만 더 기다려 주세요… / …」 이렇게
         * 세 줄이 뜬다(2026-08-17 실기기). 점점점이 둘이면 사람은 두 가지를 기다리는
         * 줄로 읽는다.
         */
        hideTyping()
        const isTimeout = e instanceof ApiError && e.status === 502
        if (!isTimeout) {
          fail(e)
          setBusy(false)
          return
        }
        // 말끝에 「…」를 붙이지 않는다 — 바로 아래 점점점이 이미 기다리라는 뜻이다
        botSay('조금만 더 기다려 주세요.')
        showTyping()
        try {
          const res = await sendChatMessage(value, coordsRef.current ?? undefined)
          hideTyping()
          handleMessage(res)
        } catch (again) {
          fail(again)
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, state, userSay, botSay, showTyping, hideTyping, handleMessage, fail, onToast],
  )

  /**
   * AI 를 부르지 않고 목적지 후보를 찾아본다. 찾았으면 true — 부르는 쪽은 거기서 멈춘다.
   *
   * 왜 있나(2026-08-19) — 목적지 발화 한 번이 AI 를 거치는데 그게 6~59초다(실측).
   * 백엔드 타임아웃이 30초라 절반 가까이가 실패하고 재시도로 넘어간다. 그런데 AI 가
   * 하는 일은 「수원역 가고 싶어요」에서 「수원역」을 뽑는 것뿐이고, 그 뒤의 장소 검색은
   * **출발지에서 이미 우리가 직접 하고 있다**(searchOrigin). 그래서 흔한 말투는 우리가
   * 뽑아서 바로 검색한다 — 0.5초면 후보가 나온다.
   *
   * 건너뛰어도 되는 이유 — 백엔드의 `POST /api/chat` 은 세션 상태를 바꾸지 않는다.
   * 다음 단계인 confirmPlace 가 요구하는 상태(DESTINATION_WAITING)는 AI 를 거치기 전과
   * 같아서, 이 길로 와도 흐름이 어긋나지 않는다(ChatSessionService.confirmDestination).
   *
   * 못 하겠으면 조용히 false 를 준다. 억지로 뽑아 엉뚱한 곳을 보여주느니 AI 에게 넘긴다.
   */
  async function tryFastDestination(value: string): Promise<boolean> {
    if (state !== 'DESTINATION_WAITING' || aiOnlyRef.current) return false

    const keyword = destinationKeyword(value)
    if (!keyword) return false

    try {
      const res = await searchPlacesNear(keyword, coordsRef.current, SEARCH_RADIUS_KM)
      const ranked = rankPlaceCandidates(res.places ?? [], keyword)
      /*
       * 마지막 판단은 검색이 한다.
       *
       * 말끝을 걷어내는 규칙은 사람 말을 다 못 따라간다. 그래서 뽑은 단어로 찾아보고
       * 쓸 만한 것이 안 나오면 없던 일로 한다 — 그러면 아래에서 AI 가 다시 본다.
       */
      if (!ranked.primary.length) return false

      hideTyping()
      // 문구는 AI 로 갔을 때와 같게 둔다. 어느 길로 왔는지는 사용자가 알 일이 아니다
      botSay('검색 결과에서 목적지를 선택해 주세요.')
      card(placeCandidates(ranked, (p) => void confirmDestination(p)))
      return true
    } catch {
      return false
    }
  }

  // ── 각 단계 확정 ─────────────────────────────────
  async function confirmDestination(p: PlaceItemResponse) {
    if (busy) return
    userSay(`${p.name}, 맞아요`)
    destNameRef.current = p.name
    destCoordsRef.current = { latitude: p.latitude, longitude: p.longitude }
    setBusy(true)
    showTyping()
    try {
      const session = await confirmPlace({
        placeId: p.placeId,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
      })
      hideTyping()
      advance(session)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  async function submitOrigin(
    label: string,
    body: Parameters<typeof confirmOrigin>[0],
  ) {
    if (busy) return
    userSay(label)
    setBusy(true)
    showTyping()
    try {
      const session = await confirmOrigin(body)
      hideTyping()
      advance(session)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  /**
   * 지도에서 짚은 자리에서 출발.
   *
   * originType 은 CURRENT_LOCATION 으로 보낸다. BE 의 PLACE 는 placeId·이름·주소를
   * 셋 다 요구하는데(ChatSessionService.confirmPlace) 지도에서 짚은 점에는 placeId 가
   * 없다. 없는 것을 지어내느니 좌표만 요구하는 쪽으로 보낸다 — 이 뒤로 쓰이는 것도
   * 좌표뿐이다. 화면에 보일 이름만 우리가 따로 들고 간다.
   */
  function pickFromMap(place: { coords: LatLng; address: string | null }) {
    /*
     * 주소를 못 알아낸 자리는 받지 않는다.
     *
     * 그 이름은 결과 화면과 길 안내에 **글자로** 계속 보인다. 「지도에서 고른 곳 가는 길」이라고
     * 적혀 있으면 맞게 골랐는지 확인할 방법이 없고, 지난 기록에서 다시 찾을 수도 없다.
     * 사람이 오가는 자리면 도로명 주소가 거의 다 있다 — 없으면 조금 옮기면 된다.
     */
    if (!place.address) {
      onToast('이 자리는 주소를 찾지 못했어요. 조금 옮겨서 다시 해주세요')
      return
    }
    const forWhat = mapPicker
    setMapPicker(null)

    if (forWhat === 'destination') {
      confirmDestination({
        /*
         * 지도에서 짚은 점에는 TMAP placeId 가 없다. BE 는 @NotBlank 라 빈 값을 받지 않는데,
         * 이 값은 대화 세션에 적히기만 하고 어디서도 다시 조회되지 않는다(ChatSession —
         * 저장하고 응답에 돌려줄 뿐이다). 그래서 어디서 온 것인지 알아볼 수 있는 형태로 만든다.
         * 진짜 장소 ID 인 척하는 문자열을 지어내지는 않는다.
         */
        placeId: `map:${place.coords.latitude.toFixed(6)},${place.coords.longitude.toFixed(6)}`,
        name: place.address,
        address: place.address,
        latitude: place.coords.latitude,
        longitude: place.coords.longitude,
      })
      return
    }

    originNameRef.current = place.address
    submitOrigin(`${place.address}에서 출발할게요`, {
      originType: 'CURRENT_LOCATION',
      latitude: place.coords.latitude,
      longitude: place.coords.longitude,
    })
  }

  /** 현재 위치 출발 — BE 가 좌표를 필수로 검사하므로 없으면 위치 화면으로 보낸다 */
  function pickCurrentLocation() {
    originNameRef.current = null
    const c = coordsRef.current
    if (c) {
      submitOrigin('현재 위치에서 출발할게요', {
        originType: 'CURRENT_LOCATION',
        latitude: c.latitude,
        longitude: c.longitude,
      })
      return
    }
    if (!('geolocation' in navigator)) {
      onToast('이 기기에서는 위치를 사용할 수 없어요')
      setLocationNeeded(true)
      return
    }
    onToast('현재 위치를 확인하고 있어요…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        submitOrigin('현재 위치에서 출발할게요', {
          originType: 'CURRENT_LOCATION',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      },
      () => setLocationNeeded(true),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function pickHome() {
    originNameRef.current = null
    submitOrigin('집에서 출발할게요', { originType: 'HOME' })
  }

  function pickPlaceOrigin(p: PlaceItemResponse) {
    originNameRef.current = null
    submitOrigin(`${p.name}에서 출발할게요`, {
      originType: 'PLACE',
      placeId: p.placeId,
      name: p.name,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
    })
  }

  async function pickDeparture(label: string, minutesFromNow: number) {
    return submitDeparture(label, departureAfter(minutesFromNow))
  }

  /** 확정한 시각을 서버에 보낸다. 빠른 답변도 날짜·시간 고르기도 여기로 모인다 */
  async function submitDeparture(label: string, departureDateTime: string) {
    if (busy) return
    userSay(label)
    setBusy(true)
    showTyping()
    try {
      const session = await confirmDepartureTime({ departureDateTime })
      // 결과 화면이 같은 시각으로 조회하도록 기억해둔다
      departureRef.current = departureDateTime
      hideTyping()
      advance(session)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  /** 출발지를 직접 적었을 때 — 장소를 검색해 후보를 고르게 한다(BE 가 좌표를 요구하므로) */
  async function searchOrigin(keyword: string) {
    if (busy) return
    userSay(keyword)
    setBusy(true)
    showTyping()
    try {
      // 근처에서 먼저 찾고, 못 찾으면 지역 제한 없이 찾는다.
      // 서울에서 "수원시청"을 출발지로 정하는 경우가 있다 — 발표 시연이 그렇다.
      const res = await searchPlacesNear(keyword, coordsRef.current, SEARCH_RADIUS_KM)
      hideTyping()
      if (!res.places?.length) {
        botSay('그 이름으로는 장소를 찾지 못했어요. 조금 더 자세히 적어주시겠어요?')
        return
      }
      botSay('찾은 장소예요. 출발지가 맞는 것을 골라주세요.')
      card(placeCandidates(rankPlaceCandidates(res.places, keyword), pickPlaceOrigin, 'origin'))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // ── 위치 안내 화면의 세 갈래 ──────────────────────
  function locationAllow() {
    if (!('geolocation' in navigator)) {
      onToast('이 기기에서는 위치를 사용할 수 없어요')
      return
    }
    onToast('현재 위치를 확인하고 있어요…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordsRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        setLocationNeeded(false)
        // 출발지를 묻던 중이었다면 바로 확정한다
        if (state === 'ORIGIN_CONFIRMATION' || state === 'HOME_CONFIRMATION') {
          submitOrigin('현재 위치에서 출발할게요', {
            originType: 'CURRENT_LOCATION',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
        }
      },
      () => onToast('위치가 아직 꺼져 있어요. 휴대폰 설정에서 위치를 켠 뒤 다시 눌러주세요'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function locationUseHome() {
    setLocationNeeded(false)
    pickHome()
  }

  function locationTypeOrigin() {
    setLocationNeeded(false)
    botSay('출발지를 아래 입력창에 적어주세요. 예: 행복아파트 정문')
  }

  // ── 첫 진입 — 세션 초기화 후 시작 ─────────────────
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    push({ type: 'day', text: '오늘' })

    let alive = true
    ;(async () => {
      setBusy(true)
      try {
        // 이전 대화가 남아 있으면 상태가 어긋나 CHAT_STATE_CONFLICT 가 난다 → 항상 새로 시작한다
        await resetChatSession()
        if (!alive) return
        if (prefill) {
          setBusy(false)
          await sendText(prefill)
          return
        }
        botSay(
          <>
            안녕하세요. 기본 설정에서 저장한 이동 설정은 제가 기억하고 있어요. <b>오늘 어디로 가고 싶으세요?</b>
          </>,
        )
        actions(destinationReplies())
      } catch (e) {
        if (alive) fail(e)
      } finally {
        if (alive) setBusy(false)
      }
    })()

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 입력창·마이크에서 들어온 말을 현재 단계에 맞게 보낸다.
   *
   * 출발지·출발시각 단계의 자유 입력은 /api/chat 으로 보내지 않는다 —
   * BE 의 AI 동작은 SEARCH_DESTINATION · SEARCH_NEARBY_PLACE · OUT_OF_SCOPE 셋뿐이라
   * 그대로 보내면 목적지 검색으로 잘못 해석된다.
   */
  function handleText(text: string) {
    const value = text.trim()
    if (!value) return

    if (state === 'ORIGIN_CONFIRMATION' || state === 'HOME_CONFIRMATION') {
      searchOrigin(value)
      return
    }

    if (state === 'DEPARTURE_TIME_CONFIRMATION') {
      const mins = parseDepartureMinutes(value)
      if (mins === null) {
        userSay(value)
        botSay(
          `언제 나서실지 잘 못 알아들었어요. “30분 뒤”나 “오후 3시”처럼 ${askAgainVerb(inputModeRef.current)} 주시겠어요?`,
        )
        return
      }
      pickDeparture(value, mins)
      return
    }

    sendText(value)
  }

  function send() {
    const value = input.trim()
    if (!value) return
    setInput('')
    handleText(value)
  }

  if (locationNeeded) {
    return (
      <LocationScreen
        hasHome={!!homeAddrRef.current}
        onAllow={locationAllow}
        onUseHome={locationUseHome}
        onTypeOrigin={locationTypeOrigin}
        onBack={() => setLocationNeeded(false)}
        onSos={onSos}
      />
    )
  }

  const [title, desc, width] = STEP_META[state] ?? STEP_META.DESTINATION_WAITING

  return (
    <>
      <ChatView
        title={title}
        desc={desc}
        width={width}
        messages={log.messages}
        scrollRef={log.scrollRef}
        input={input}
        onInputChange={setInput}
        onSend={send}
        onTranscript={handleText}
        onBack={onBack}
        onSos={onSos}
        onToast={onToast}
        busy={busy}
        /* 되물을 때 「말씀해」와 「입력해」를 가르려면 지금 어느 쪽인지 알아야 한다 */
        onInputModeChange={(m) => (inputModeRef.current = m)}
      />
      <MapPicker
        open={mapPicker !== null}
        center={coordsRef.current}
        title={mapPicker === 'destination' ? '지도에서 갈 곳 고르기' : '지도에서 출발지 고르기'}
        hint={
          mapPicker === 'destination'
            ? '지도를 움직여 가시려는 곳에 맞춰주세요'
            : '지도를 움직여 출발할 곳에 맞춰주세요'
        }
        confirmLabel={mapPicker === 'destination' ? '여기로 갈게요' : '여기서 출발할게요'}
        onPick={pickFromMap}
        onClose={() => setMapPicker(null)}
      />
      <DepartureSheet
        open={timeSheet}
        onClose={() => setTimeSheet(false)}
        onToast={onToast}
        onPick={(dateTime, label) => void submitDeparture(`${label}에 출발할게요`, dateTime)}
      />
    </>
  )
}
