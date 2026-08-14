declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

import { useEffect, useRef, useState, isValidElement, type ReactElement, type ReactNode } from 'react'
import { speak } from '../state/tts'

/**
 * 대화로 길찾기 (chat) — 7차 와이어프레임 #screen-chat 이식.
 * 백엔드 AI 파트가 아직이라, 와이어프레임과 동일한 스크립트 대화로 동작한다.
 * 목적지 → 출발지 → 출발 시간을 확인한 뒤 결과(가는 길)로 넘어간다.
 *
 * 7/31 회의: '오늘 평소보다 더 불편한 곳이 있나요?'(당일 상태) 질문을 개발 범위에서 제외.
 * "오늘 상태를 세분화해 정량화하기 어렵다"는 기술적 제약으로 전원 합의(00:08:43~00:10:25).
 * → 4단계 → 3단계로 되돌리고 todayCondition 상태값을 걷어냈다.
 * ※ AI팀 Score function 문서에는 아직 A_today 계수가 남아 있어 다음 회의에서 정합 필요.
 */

type Step = 'destination' | 'origin' | 'depart' | 'analysis'

const STEP_META: Record<Step, [string, string, string]> = {
  destination: ['목적지 확인 · 1/3', 'AI가 필요한 내용만 짧게 물어봐요', '33%'],
  origin: ['출발지 확인 · 2/3', '어디서 출발할지 알려주세요', '66%'],
  depart: ['출발 시간 확인 · 3/3', '출발 시각에 맞춰 날씨를 확인해요', '100%'],
  analysis: ['편한 길 찾는 중', '대화가 끝나면 편한 길을 보여드려요', '100%'],
}

const DEST_ADDR: Record<string, string> = {
  '○○병원': '수원시 팔달구 ○○로 12',
  전통시장: '수원시 팔달구 시장길 5',
  주민센터: '수원시 권선구 행정로 9',
  수원역: '경기 수원시 팔달구 덕영대로 924',
}
const addressOf = (name: string) => DEST_ADDR[name] ?? '수원시 인근'

type MsgInput =
  | { type: 'day'; text: string }
  | { type: 'bot'; content: ReactNode }
  | { type: 'user'; text: string }
  | { type: 'actions'; content: ReactNode }
  | { type: 'card'; content: ReactNode }
  | { type: 'typing' }
type Msg = MsgInput & { id: number }

/** ReactNode(JSX) 말풍선에서 읽어줄 순수 텍스트만 뽑는다. <br> 은 공백으로 처리. */
function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>
    if (el.type === 'br') return ' '
    return nodeToText(el.props.children)
  }
  return ''
}

function ChatAvatar() {
  return (
    <div className="chat-avatar">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16v11H9l-4 3v-3H4V5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function ChatScreen({
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
  onDone: (destination: string) => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [step, setStep] = useState<Step>('destination')
  const [input, setInput] = useState('')

  const idRef = useRef(1)
  const destRef = useRef('')
  const departRef = useRef('')
  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const nextId = () => idRef.current++
  const push = (msg: MsgInput) => setMessages((m) => [...m, { ...msg, id: nextId() } as Msg])
  const botSay = (content: ReactNode) => {
    push({ type: 'bot', content })
    // 음성 안내가 켜져 있으면 말풍선을 소리로 읽어준다 (온보딩 약속: "이어지는 질문을 소리로 읽어드려요")
    speak(nodeToText(content), { auto: true })
  }
  const userSay = (text: string) => push({ type: 'user', text })
  const actions = (content: ReactNode) => push({ type: 'actions', content })
  const card = (content: ReactNode) => push({ type: 'card', content })
  const typing = (cb: () => void) => {
    push({ type: 'typing' })
    window.setTimeout(() => {
      setMessages((m) => m.filter((x) => x.type !== 'typing'))
      cb()
    }, 430)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  // ── 대화 스크립트 ──────────────────────────────
  const destinationReplies = () => (
    <>
      {['○○병원', '전통시장', '주민센터', '수원역'].map((n) => (
        <button key={n} className="chat-reply" onClick={() => chooseDestination(n)}>
          {n}
        </button>
      ))}
    </>
  )

  function placeCard(name: string) {
    return (
      <>
        <h3>이 장소가 맞나요?</h3>
        <p>비슷한 이름이 있을 수 있어 주소까지 확인해 주세요.</p>
        <div className="chat-place">
          <span className="pin">📍</span>
          <span>
            <b>{name}</b>
            <span>{addressOf(name)}</span>
          </span>
        </div>
        <div className="chat-card-actions">
          <button onClick={redoDestination}>다시 말하기</button>
          <button className="primary" onClick={confirmPlace}>
            네, 맞아요
          </button>
          <button className="full" onClick={() => onToast('지도에서 자세히 보기는 곧 준비할게요')}>
            지도에서 자세히 확인
          </button>
        </div>
      </>
    )
  }

  function chooseDestination(name: string) {
    destRef.current = name
    userSay(`${name}에 가고 싶어요`)
    typing(() => {
      botSay(
        <>
          <b>{name}</b>으로 들었어요. 장소와 주소를 한 번만 확인할게요.
        </>,
      )
      card(placeCard(name))
    })
  }

  function redoDestination() {
    userSay('다시 말할게요')
    setStep('destination')
    typing(() => {
      botSay('괜찮아요. 목적지를 다시 말씀하거나 아래에서 골라주세요.')
      actions(destinationReplies())
    })
  }

  function confirmPlace() {
    userSay('네, 맞아요')
    askOrigin()
  }

  function askOrigin() {
    setStep('origin')
    typing(() => {
      botSay(
        <>
          어디서 출발하세요? <b>현재 위치</b>에서 시작하면 가장 정확해요.
        </>,
      )
      actions(
        <>
          <button className="chat-reply" onClick={() => chooseOrigin('현재 위치')}>
            📍 현재 위치
          </button>
          <button
            className="chat-reply"
            onClick={() => {
              botSay('출발지를 아래 입력창에 적어주세요. 예: 행복아파트 정문')
            }}
          >
            ✏️ 직접 입력
          </button>
        </>,
      )
    })
  }

  function chooseOrigin(value: string) {
    userSay(`${value}에서 출발할게요`)
    askDepartTime()
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
          <button className="chat-reply" onClick={() => chooseTime('지금 바로')}>
            🚶 지금 바로 출발
          </button>
          <button className="chat-reply" onClick={pickTime}>
            🕐 시간을 정할게요
          </button>
          <button className="chat-reply" onClick={() => chooseTime('다른 날')}>
            📅 다른 날 갈 거예요
          </button>
        </>,
      )
    })
  }

  function pickTime() {
    userSay('시간을 정할게요')
    setStep('depart')
    typing(() => {
      botSay('몇 시쯤 나서실 예정인가요?')
      actions(
        <>
          {[
            ['30분 뒤', '30분 뒤'],
            ['1시간 뒤', '1시간 뒤'],
            ['2시간 뒤', '2시간 뒤'],
          ].map(([label]) => (
            <button key={label} className="chat-reply" onClick={() => chooseTime(label)}>
              {label}
            </button>
          ))}
        </>,
      )
    })
  }

  function chooseTime(label: string) {
    userSay(label === '다른 날' ? '다른 날 갈 거예요' : `${label} 출발할게요`)
    finishChat(label)
  }

  function finishChat(label: string) {
    departRef.current = label
    setStep('analysis')
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
      window.setTimeout(() => onDone(destRef.current), 1100)
    })
  }

  // 첫 진입 — 스크립트 시작
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    push({ type: 'day', text: '오늘' })
    if (prefill) {
      destRef.current = prefill
      userSay(`${prefill}에 가고 싶어요`)
      botSay(
        <>
          <b>{prefill}</b>에 가시는군요. 제가 찾은 장소가 맞는지 확인해 주세요.
        </>,
      )
      card(placeCard(prefill))
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

  function send() {
    const value = input.trim()
    if (!value) return
    setInput('')
    if (step === 'destination') {
      const name = value.replace(/(에|으로)?\s*(가고 싶어요|가고 싶어|가는 길|어떻게 가).*$/, '').trim() || value
      chooseDestination(name)
    } else if (step === 'origin') {
      const from = value.replace(/(에서|에)?\s*(출발.*)$/, '').trim() || value
      chooseOrigin(from)
    } else if (step === 'depart') {
      userSay(value)
      finishChat(value)
    } else {
      userSay(value)
      typing(() => botSay('말씀하신 내용을 반영할게요. 지금 질문에 가까운 답변을 위 버튼에서 골라도 됩니다.'))
    }
  }

  function micTap() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition

  if (!SpeechRecognition) {
    onToast('이 브라우저는 음성 인식을 지원하지 않아요. Chrome을 사용해 주세요.')
    return
  }

  const recognition = new SpeechRecognition()
  recognition.lang = 'ko-KR'
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  onToast('말씀을 듣고 있어요…')

  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript

    if (step === 'destination') {
      const name = text
        .replace(/(에|으로)?\s*(가고 싶어요|가고 싶어|가는 길|어떻게 가).*$/, '')
        .trim() || text
      chooseDestination(name)
    } else if (step === 'origin') {
      const from = text
        .replace(/(에서|에)?\s*(출발.*)$/, '')
        .trim() || text
      chooseOrigin(from)
    } else if (step === 'depart') {
      chooseTime(text)
    }
  }

  recognition.onerror = (event: any) => {
    if (event.error === 'not-allowed') {
      onToast('마이크 권한을 허용해 주세요')
    } else if (event.error === 'no-speech') {
      onToast('음성이 감지되지 않았어요. 다시 눌러주세요')
    } else {
      onToast('음성 인식 오류가 발생했어요')
    }
  }

  try {
    recognition.start()
  } catch (e) {
    onToast('마이크를 시작할 수 없어요. 다시 눌러주세요')
  }
}

  const [title, desc, width] = STEP_META[step]

  return (
    <section className="screen">
      <header className="topbar">
        <button className="back-btn" onClick={onBack} aria-label="홈으로 돌아가기">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="topbar-title">
          <span className="brand-dot" />
          대화로 길찾기
        </div>
        <button className="sos-btn-top" onClick={onSos}>
          SOS
        </button>
      </header>

      <div className="chat-step">
        <div className="copy">
          <b>{title}</b>
          <span>{desc}</span>
        </div>
        <span className="bar">
          <i style={{ width }} />
        </span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        <div className="chatlog" aria-live="polite">
          {messages.map((m) => {
            if (m.type === 'day') return <div key={m.id} className="chat-day">{m.text}</div>
            if (m.type === 'typing')
              return (
                <div key={m.id} className="chat-msg ai">
                  <ChatAvatar />
                  <div className="chat-typing">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )
            if (m.type === 'bot')
              return (
                <div key={m.id} className="chat-msg ai">
                  <ChatAvatar />
                  <div className="chat-content">
                    <div className="chat-name">AI 길벗</div>
                    <div className="chat-bubble">{m.content}</div>
                    <span className="chat-time">오전 9:41</span>
                  </div>
                </div>
              )
            if (m.type === 'user')
              return (
                <div key={m.id} className="chat-msg me">
                  <div className="chat-content">
                    <div className="chat-bubble">{m.text}</div>
                    <span className="chat-time">오전 9:41</span>
                  </div>
                </div>
              )
            if (m.type === 'actions') return <div key={m.id} className="chat-actions">{m.content}</div>
            return <div key={m.id} className="chat-card">{m.content}</div>
          })}
        </div>
      </div>

      <div className="chat-composer">
        <div className="chat-input-row">
          <div className="chat-input-wrap">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="목적지나 질문을 입력하세요"
              aria-label="AI 길벗에게 메시지 입력"
            />
            <button className="chat-mic" onClick={micTap} aria-label="음성으로 말하기">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="8.5" y="2.5" width="7" height="11.5" rx="3.5" fill="currentColor" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <button className="chat-send" onClick={send} aria-label="메시지 보내기">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m4 4 17 8-17 8 3-8-3-8Z" fill="currentColor" />
              <path d="M7 12h14" stroke="white" strokeWidth="1.7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
