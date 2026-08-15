import { useEffect, useRef, useState } from 'react'
import { LocationScreen } from './LocationScreen'
import { getHome, searchPlacesNear } from '../api/place'
import { departureAfter, parseDepartureMinutes } from '../api/time'
import { SEARCH_RADIUS_KM, SUWON_CENTER, isInServiceArea } from '../api/geo'
import { areaOf, areasDiffer, rankPlaceCandidates } from '../api/placeRank'
import { ChatView, useChatLog } from '../components/ChatView'
import { QUICK_DESTINATION_NAMES } from './quickDestinations'
import type { LatLng, PlaceItemResponse } from '../types/dto'

/**
 * 대화로 길찾기 — 화면 안 스크립트 엔진 (Mock 전용).
 *
 * 7차 와이어프레임 #screen-chat 을 이식한 원본이다. 만든 시점(7/31)에 BE 챗 API 가
 * 아예 없어서, 백엔드 없이도 대화가 끝까지 굴러가도록 대본을 화면에 넣었다.
 *
 * 지금은 ServerChatScreen(실연동)이 따로 있고, 이건 **시연 안전판**으로 남긴다 —
 * BE·AI 서버가 죽거나 느려도 발표에서 전체 흐름을 보여줄 수 있어야 하기 때문이다.
 * api/mode.ts 의 useMock('chat') 이 true 일 때 이 화면이 뜬다.
 *
 * 7/31 회의: '오늘 평소보다 더 불편한 곳이 있나요?'(당일 상태) 질문을 개발 범위에서 제외.
 * "오늘 상태를 세분화해 정량화하기 어렵다"는 기술적 제약으로 전원 합의(00:08:43~00:10:25).
 * → 4단계 → 3단계로 되돌리고 todayCondition 상태값을 걷어냈다. (BE 도 8/15 배포에서 삭제 확인)
 */

type Step = 'destination' | 'origin' | 'depart' | 'analysis'

const STEP_META: Record<Step, [string, string, string]> = {
  destination: ['목적지 확인 · 1/3', 'AI가 필요한 내용만 짧게 물어봐요', '33%'],
  origin: ['출발지 확인 · 2/3', '어디서 출발할지 알려주세요', '66%'],
  depart: ['출발 시간 확인 · 3/3', '출발 시각에 맞춰 날씨를 확인해요', '100%'],
  analysis: ['편한 길 찾는 중', '대화가 끝나면 편한 길을 보여드려요', '100%'],
}

/**
 * 자연 발화에서 목적지만 추려낸다.
 * "아주대병원 가고 싶어요" → "아주대병원"
 * 홈 마이크로 들은 말과 입력창에 적은 말이 같은 방식으로 처리돼야 한다.
 */
function destinationFrom(text: string): string {
  return text.replace(/(에|으로)?\s*(가고 싶어요|가고 싶어|가는 길|어떻게 가).*$/, '').trim() || text
}

export function ScriptedChatScreen({
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
  /**
   * 대화 끝 — 목적지 이름, 고른 출발 시각, 그리고 사용자가 확인한 목적지 좌표.
   * 좌표를 함께 넘기는 이유: 결과 화면이 이름으로 다시 검색하면 같은 이름이라도
   * 1순위가 달라져 사용자가 확인한 곳과 다른 데로 안내될 수 있다.
   */
  onDone: (destination: string, departureDateTime: string, coords?: LatLng) => void
}) {
  const log = useChatLog()
  const { botSay, userSay, actions, card, typing, push } = log

  const [step, setStep] = useState<Step>('destination')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)

  const destRef = useRef('')
  // 사용자가 확인한 목적지의 실제 좌표. 결과 화면이 이 좌표로 바로 조회한다
  // (이름으로 다시 검색하면 같은 이름이라도 1순위가 달라질 수 있다).
  const destCoordsRef = useRef<LatLng | null>(null)
  const departRef = useRef('')
  const startedRef = useRef(false)
  const homeAddrRef = useRef<string | null>(null)
  const posRef = useRef<LatLng | null>(null)

  const { showTyping, hideTyping } = log

  // 저장된 집 주소와 현재 위치를 미리 읽어둔다.
  // 위치는 장소 검색의 기준점이 된다 — 백엔드가 이 좌표 반경 5km 안에서만 찾는다.
  useEffect(() => {
    let alive = true
    getHome()
      .then((h) => {
        if (alive) homeAddrRef.current = h?.address ?? null
      })
      .catch(() => {})

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (alive) posRef.current = { latitude: p.coords.latitude, longitude: p.coords.longitude }
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      )
    }
    return () => {
      alive = false
    }
  }, [])

  // ── 대화 스크립트 ──────────────────────────────
  const destinationReplies = () => (
    <>
      {QUICK_DESTINATION_NAMES.map((n) => (
        <button key={n} className="chat-reply" onClick={() => chooseDestination(n)}>
          {n}
        </button>
      ))}
    </>
  )

  /** 서비스 지역 밖일 때의 안내 — 서버 오류처럼 보이지 않게 원인과 다음 행동을 말해준다 */
  function sayOutOfArea() {
    botSay(
      <>
        <b>지금은 수원시 안에서만</b> 길을 찾아드릴 수 있어요.
        <br />
        수원에서 다시 열어주시거나, 수원 안의 장소를 말씀해 주세요.
      </>,
    )
  }

  /**
   * 실제 검색 결과로 목적지를 확인받는다.
   * 예전에는 검색 없이 하드코딩된 가짜 주소를 보여주고, 결과 화면이 이름으로 다시 검색해
   * **1순위를 말없이 채택**했다. "수원역"을 찾았는데 '팀에이치짐 수원시청역점 주차장'이
   * 1순위로 잡히는 사례가 확인돼(2026-08-15), 사용자가 직접 고르도록 바꿨다.
   */
  function placeCard(places: PlaceItemResponse[]) {
    const shown = places.slice(0, 4)
    // 후보가 다 같은 동네면 지역을 안 붙인다 — 같은 글자를 네 번 읽게 하지 않는다
    const showArea = areasDiffer(shown)
    return (
      <>
        <h3>어디로 모실까요?</h3>
        <p>가시려는 곳을 골라주세요.</p>
        {/* key 에 순번을 섞는다 — BE 응답에서 placeId 가 중복으로 온다
            (본원·정문·후문·지하주차장이 모두 "159346"). placeId 만 쓰면 React 가
            항목을 잘못 매칭해 누른 것과 다른 곳이 선택될 수 있다. */}
        {shown.map((p, i) => (
          <button key={`${p.placeId}-${i}`} className="chat-place pick" onClick={() => confirmPlace(p)}>
            <span className="pin">📍</span>
            <span>
              <b>{p.name}</b>
              {showArea && <span>{areaOf(p.address)}</span>}
            </span>
          </button>
        ))}
        <div className="chat-card-actions">
          <button className="full" onClick={redoDestination}>
            찾는 곳이 없어요 · 다시 말하기
          </button>
        </div>
      </>
    )
  }

  async function chooseDestination(name: string) {
    if (busy) return
    userSay(`${name}에 가고 싶어요`)
    setBusy(true)
    showTyping()

    const center = posRef.current ?? SUWON_CENTER
    const outside = !isInServiceArea(center)

    try {
      // 근처에서 먼저 찾고, 못 찾으면 지역 제한 없이 찾는다 (api/place searchPlacesNear 주석 참고)
      const res = await searchPlacesNear(name, posRef.current, SEARCH_RADIUS_KM)
      hideTyping()

      if (!res.places.length) {
        if (outside) sayOutOfArea()
        else botSay(`"${name}" 근처에서 장소를 찾지 못했어요. 조금 더 자세히 말씀해 주시겠어요?`)
        actions(destinationReplies())
        return
      }

      botSay(
        <>
          <b>{name}</b>으로 들었어요. 어디를 말씀하신 건지 한 번만 확인할게요.
        </>,
      )
      // TMAP 순서를 그대로 쓰면 대표 시설이 한참 아래에 온다
      // ("아주대학교병원" 검색에 본원이 17위였다) — 검색어와의 일치도로 다시 정렬한다
      card(placeCard(rankPlaceCandidates(res.places, name)))
    } catch {
      hideTyping()
      // 백엔드가 결과 0건도 502 로 내려주기 때문에, 지역 밖이면 그쪽 안내를 먼저 한다
      if (outside) sayOutOfArea()
      else botSay('장소를 찾는 중에 문제가 생겼어요. 잠시 뒤 다시 말씀해 주시겠어요?')
      actions(destinationReplies())
    } finally {
      setBusy(false)
    }
  }

  function redoDestination() {
    userSay('다시 말할게요')
    setStep('destination')
    typing(() => {
      botSay('괜찮아요. 목적지를 다시 말씀하거나 아래에서 골라주세요.')
      actions(destinationReplies())
    })
  }

  function confirmPlace(place: PlaceItemResponse) {
    destRef.current = place.name
    destCoordsRef.current = { latitude: place.latitude, longitude: place.longitude }
    userSay(`${place.name}, 맞아요`)
    askOrigin()
  }

  // 집 주소가 저장돼 있을 때만 "🏠 집" 버튼을 보여준다(없는 값을 고르게 하지 않음).
  const originReplies = () => (
    <>
      <button className="chat-reply" onClick={pickCurrentLocation}>
        📍 현재 위치
      </button>
      {homeAddrRef.current && (
        <button className="chat-reply" onClick={() => chooseOrigin('집')}>
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

  function askOrigin() {
    setStep('origin')
    typing(() => {
      botSay(
        <>
          어디서 출발하세요? <b>현재 위치</b>에서 시작하면 가장 정확해요.
        </>,
      )
      actions(originReplies())
    })
  }

  function chooseOrigin(value: string) {
    userSay(`${value}에서 출발할게요`)
    askDepartTime()
  }

  function pickCurrentLocation() {
    if (!('geolocation' in navigator)) {
      chooseOrigin('현재 위치')
      return
    }
    onToast('현재 위치를 확인하고 있어요…')
    navigator.geolocation.getCurrentPosition(
      () => chooseOrigin('현재 위치'),
      () => setLocationDenied(true),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function locationAllow() {
    if (!('geolocation' in navigator)) {
      onToast('이 기기에서는 위치를 사용할 수 없어요')
      return
    }
    onToast('현재 위치를 확인하고 있어요…')
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocationDenied(false)
        chooseOrigin('현재 위치')
      },
      () => onToast('위치가 아직 꺼져 있어요. 휴대폰 설정에서 위치를 켠 뒤 다시 눌러주세요'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function locationUseHome() {
    setLocationDenied(false)
    chooseOrigin('집')
  }

  function locationTypeOrigin() {
    setLocationDenied(false)
    setStep('origin')
    botSay('출발지를 아래 입력창에 적어주세요. 예: 행복아파트 정문')
  }

  function askDepartTime() {
    setStep('depart')
    typing(() => {
      botSay(
        <>
          <b>언제 출발하실 예정인가요?</b>
          <br />
          출발 시각에 맞춰 날씨와 교통 상황을 확인해요.
        </>,
      )
      actions(
        <>
          <button className="chat-reply" onClick={() => chooseTime('지금 바로', 0)}>
            🚶 지금 바로 출발
          </button>
          <button className="chat-reply" onClick={pickTime}>
            🕐 시간을 정할게요
          </button>
          <button className="chat-reply" onClick={() => chooseTime('내일', 24 * 60)}>
            📅 내일 갈 거예요
          </button>
        </>,
      )
    })
  }

  function pickTime() {
    userSay('시간을 정할게요')
    setStep('depart')
    typing(() => {
      botSay('몇 시쯤 나서실 예정인가요? 아래에서 고르시거나 “오후 3시”처럼 적어주셔도 돼요.')
      actions(
        <>
          {([
            ['30분 뒤', 30],
            ['1시간 뒤', 60],
            ['2시간 뒤', 120],
          ] as const).map(([label, mins]) => (
            <button key={label} className="chat-reply" onClick={() => chooseTime(label, mins)}>
              {label}
            </button>
          ))}
        </>,
      )
    })
  }

  function chooseTime(label: string, minutesFromNow: number) {
    userSay(label === '내일' ? '내일 갈 거예요' : `${label} 출발할게요`)
    finishChat(label, minutesFromNow)
  }

  function finishChat(label: string, minutesFromNow: number) {
    departRef.current = label
    setStep('analysis')
    // 화면 문구가 아니라 실제 시각을 결과 조회에 넘긴다 — 시간대에 따라 대중교통 후보가 달라진다
    const departureDateTime = departureAfter(minutesFromNow)
    typing(() => {
      botSay(
        <>
          확인했어요. <b>{departRef.current}</b> 기준으로 찾아볼게요. 이제 대화는 여기까지 하고, <b>오늘 편한 길</b>을 보여드릴게요.
        </>,
      )
      card(
        <>
          <h3>경로를 분석하고 있어요</h3>
          <p>지도 후보와 날씨·교통, 저장해두신 이동 설정을 결합합니다.</p>
        </>,
      )
      window.setTimeout(
        () => onDone(destRef.current, departureDateTime, destCoordsRef.current ?? undefined),
        1100,
      )
    })
  }

  // 첫 진입 — 스크립트 시작
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    push({ type: 'day', text: '오늘' })
    if (prefill) {
      // 홈 마이크로 들은 말이거나 자주 가는 곳에서 온 이름.
      // 자연 발화("아주대병원 가고 싶어요")가 그대로 오므로 목적지만 추려낸다 —
      // 안 그러면 "아주대병원 가고 싶어요"를 통째로 장소 이름으로 검색하게 된다.
      chooseDestination(destinationFrom(prefill))
    } else {
      botSay(
        <>
          안녕하세요. 기본 설정에서 저장한 이동 설정은 제가 기억하고 있어요. <b>오늘 어디로 가고 싶으세요?</b>
        </>,
      )
      actions(destinationReplies())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 입력창·마이크에서 들어온 말을 현재 단계에 맞게 해석한다 */
  function handleText(value: string) {
    const text = value.trim()
    if (!text) return
    if (step === 'destination') {
      chooseDestination(destinationFrom(text))
    } else if (step === 'origin') {
      const from = text.replace(/(에서|에)?\s*(출발.*)$/, '').trim() || text
      chooseOrigin(from)
    } else if (step === 'depart') {
      // 적어주신 시각을 실제로 해석한다. 못 알아들으면 되묻는다 —
      // 멋대로 '지금'으로 처리하면 사용자가 의도하지 않은 시간표의 경로가 나온다.
      const mins = parseDepartureMinutes(text)
      if (mins === null) {
        userSay(text)
        typing(() => botSay('언제 나서실지 잘 못 알아들었어요. “30분 뒤”나 “오후 3시”처럼 말씀해 주시겠어요?'))
        return
      }
      chooseTime(text, mins)
    } else {
      userSay(text)
      typing(() => botSay('말씀하신 내용을 반영할게요. 지금 질문에 가까운 답변을 위 버튼에서 골라도 됩니다.'))
    }
  }

  function send() {
    const value = input.trim()
    if (!value) return
    setInput('')
    handleText(value)
  }

  if (locationDenied) {
    return (
      <LocationScreen
        hasHome={!!homeAddrRef.current}
        onAllow={locationAllow}
        onUseHome={locationUseHome}
        onTypeOrigin={locationTypeOrigin}
        onBack={() => setLocationDenied(false)}
        onSos={onSos}
      />
    )
  }

  const [title, desc, width] = STEP_META[step]

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
