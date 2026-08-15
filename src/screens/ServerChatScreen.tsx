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
import { rankPlaceCandidates } from '../api/placeRank'
import { SEARCH_RADIUS_KM } from '../api/geo'
import { QUICK_DESTINATION_NAMES } from './quickDestinations'
import { ChatView, useChatLog } from '../components/ChatView'
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
  /** 대화 끝 — 목적지 이름·확정한 출발 시각·확인한 목적지 좌표 */
  onDone: (destination: string, departureDateTime: string, coords?: LatLng) => void
}) {
  const log = useChatLog()
  const { botSay, userSay, actions, card, push, showTyping, hideTyping } = log

  const [state, setState] = useState<ChatState>('DESTINATION_WAITING')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [locationNeeded, setLocationNeeded] = useState(false)

  const startedRef = useRef(false)
  const destNameRef = useRef('')
  // 확인한 목적지 좌표 — 결과 화면이 이름으로 다시 검색하지 않도록 함께 넘긴다
  const destCoordsRef = useRef<LatLng | null>(null)
  // 마지막 발화 — 서버가 준 장소 후보를 사용자가 말한 이름 기준으로 다시 정렬하는 데 쓴다
  const lastUtteranceRef = useRef('')
  const homeAddrRef = useRef<string | null>(null)
  // 서버에 확정한 출발 시각 — 결과 화면이 같은 값으로 경로를 조회해야 대화와 결과가 어긋나지 않는다
  const departureRef = useRef<string>('')
  // 발화에 실어 보낼 현재 좌표 — "내 근처 병원" 같은 기준 위치 검색에 쓰인다(있으면 보내고 없으면 생략)
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null)

  /**
   * 사람이 읽을 수 있는 에러 문구로 바꾼다.
   *
   * AI 관련 실패를 한 문구로 뭉치면 안 된다 — 원인마다 사용자가 할 일이 다르다.
   *   503 AI_SERVER_UNAVAILABLE  서버에 AI 주소가 설정돼 있지 않다 → 다시 눌러도 소용없다
   *   502 AI_CHAT_FAILED         호출이 늦거나 끊겼다 → 다시 하면 대개 된다
   * (AI 서버가 잠들어 있다 깨어날 때 첫 요청이 특히 오래 걸린다)
   */
  const errorText = (e: unknown): string => {
    if (!(e instanceof ApiError)) return '문제가 생겼어요. 다시 한 번 말씀해 주시겠어요?'
    if (e.status === 0) return '인터넷 연결을 확인해 주세요.'
    if (e.status === 503) {
      return 'AI 상담 서버가 아직 연결되지 않았어요. 아래 버튼으로 목적지를 골라주세요.'
    }
    if (e.status === 502) {
      return '응답이 늦어지고 있어요. 한 번만 다시 말씀해 주시겠어요?'
    }
    if (e.status === 409) {
      // 대화 상태가 어긋났다 — 다시 시작하면 풀린다
      return '대화가 꼬였어요. 처음부터 다시 여쭤볼게요.'
    }
    return e.message
  }

  /**
   * 실패했을 때 막다른 길을 만들지 않는다.
   * 목적지를 묻는 중이었다면 고를 수 있는 버튼을 다시 내준다 — 어르신이
   * "다시 말해보세요"만 보고 무엇을 해야 할지 몰라 멈추는 것을 막는다.
   */
  const fail = useCallback(
    (e: unknown) => {
      hideTyping()
      botSay(errorText(e))
      if (state === 'DESTINATION_WAITING') actions(destinationReplies())
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [botSay, hideTyping, actions, state],
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
            onDone(
              destNameRef.current,
              departureRef.current || departureAfter(0),
              destCoordsRef.current ?? undefined,
            ),
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
      setState(session.currentState)
      askFor(session.currentState)
    },
    [askFor],
  )

  // ── 장소 후보 카드 ───────────────────────────────
  function placeCandidates(places: PlaceItemResponse[], onPick: (p: PlaceItemResponse) => void) {
    return (
      <>
        <h3>이 장소가 맞나요?</h3>
        <p>비슷한 이름이 있을 수 있어 주소까지 확인해 주세요.</p>
        {/* key 에 순번을 섞는다 — BE 응답의 placeId 가 중복으로 온다(본원·정문·후문이 같은 ID) */}
        {places.map((p, i) => (
          <div key={`${p.placeId}-${i}`} className="chat-place" style={{ marginTop: 10 }}>
            <span className="pin">📍</span>
            <span>
              <b>{p.name}</b>
              <span>{p.address}</span>
            </span>
          </div>
        ))}
        <div className="chat-card-actions">
          {places.slice(0, 1).map((p, i) => (
            <button key={`${p.placeId}-${i}`} className="primary full" onClick={() => onPick(p)}>
              네, 맞아요
            </button>
          ))}
          <button
            className="full"
            onClick={() => {
              botSay('다시 말씀해 주세요. 어디로 가고 싶으세요?')
              actions(destinationReplies())
            }}
          >
            찾는 곳이 없어요 · 다시 말하기
          </button>
        </div>
      </>
    )
  }

  /** 후보가 여럿이면 하나씩 고르게 한다(주소가 달라 사람이 봐야 구분된다) */
  function placeChoiceList(places: PlaceItemResponse[], onPick: (p: PlaceItemResponse) => void) {
    return (
      <>
        {places.map((p, i) => (
          <button key={`${p.placeId}-${i}`} className="chat-reply" onClick={() => onPick(p)}>
            {p.name} · {p.address}
          </button>
        ))}
      </>
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
        if (ranked.length === 1) card(placeCandidates(ranked, pick))
        else actions(placeChoiceList(ranked, pick))
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
        const res = await sendChatMessage(value, coordsRef.current ?? undefined)
        hideTyping()
        handleMessage(res)
      } catch (e) {
        fail(e)
      } finally {
        setBusy(false)
      }
    },
    [busy, userSay, showTyping, hideTyping, handleMessage, fail, onToast],
  )

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

  /** 현재 위치 출발 — BE 가 좌표를 필수로 검사하므로 없으면 위치 화면으로 보낸다 */
  function pickCurrentLocation() {
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
    submitOrigin('집에서 출발할게요', { originType: 'HOME' })
  }

  function pickPlaceOrigin(p: PlaceItemResponse) {
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
    if (busy) return
    userSay(label)
    setBusy(true)
    showTyping()
    try {
      const departureDateTime = departureAfter(minutesFromNow)
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
      actions(placeChoiceList(rankPlaceCandidates(res.places, keyword), pickPlaceOrigin))
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
        botSay('언제 나서실지 잘 못 알아들었어요. “30분 뒤”나 “오후 3시”처럼 말씀해 주시겠어요?')
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
    />
  )
}
