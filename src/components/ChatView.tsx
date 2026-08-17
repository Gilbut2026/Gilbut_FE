import { SPEECH_ERROR_TEXT, listenOnce, type SpeechSession } from '../state/speech'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { speak, whenSpeakingEnds } from '../state/tts'
import { TopBar } from './TopBar'

/**
 * 대화 화면의 "보이는 부분" — 말풍선 목록·단계 진행바·입력창·마이크.
 *
 * 대화를 굴리는 엔진은 두 가지다(둘 다 이 뷰를 쓴다):
 *  · ScriptedChatScreen — 화면 안 스크립트. 백엔드 없이 도는 시연 안전판.
 *  · ServerChatScreen   — BE /api/chat 상태머신을 따라가는 실연동.
 *
 * 엔진이 바뀌어도 어르신이 보는 화면은 똑같아야 해서 여기로 분리했다.
 */

export type MsgInput =
  | { type: 'day'; text: string }
  | { type: 'bot'; content: ReactNode }
  | { type: 'user'; text: string }
  | { type: 'actions'; content: ReactNode }
  | { type: 'card'; content: ReactNode }
  | { type: 'typing' }

export type Msg = MsgInput & { id: number }

/**
 * 지금 어르신이 말로 하시는지 자판으로 치시는지.
 *
 * 화면(엔진)도 알아야 한다 — 되물을 때 문구가 달라지기 때문이다.
 * 자판으로 치시는 분에게 「다시 말씀해 주시겠어요?」라고 하면 엉뚱한 말이 된다.
 */
export type InputMode = 'voice' | 'text'

/** 되물을 때 쓸 동사 — 「다시 ○○ 주시겠어요?」 */
export function askAgainVerb(mode: InputMode): string {
  return mode === 'voice' ? '말씀해' : '입력해'
}

/** ReactNode(JSX) 말풍선에서 읽어줄 순수 텍스트만 뽑는다. <br> 은 공백으로 처리. */
export function nodeToText(node: ReactNode): string {
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

export function ChatAvatar() {
  return (
    <div className="chat-avatar">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16v11H9l-4 3v-3H4V5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </div>
  )
}

/**
 * 말풍선 목록 상태.
 * 스크립트 엔진은 typing(cb) 으로 "잠깐 점점점 → 다음 말"을 쓰고,
 * 서버 엔진은 응답을 기다리는 동안 showTyping/hideTyping 을 직접 여닫는다(응답 시간이 미리 정해져 있지 않으므로).
 */
export function useChatLog() {
  const [messages, setMessages] = useState<Msg[]>([])
  const idRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const push = useCallback((msg: MsgInput) => {
    setMessages((m) => [...m, { ...msg, id: idRef.current++ } as Msg])
  }, [])

  const botSay = useCallback(
    (content: ReactNode) => {
      push({ type: 'bot', content })
      // 음성 안내가 켜져 있으면 말풍선을 소리로 읽어준다 (온보딩 약속: "이어지는 질문을 소리로 읽어드려요")
      speak(nodeToText(content), { auto: true })
    },
    [push],
  )

  const userSay = useCallback((text: string) => push({ type: 'user', text }), [push])
  const actions = useCallback((content: ReactNode) => push({ type: 'actions', content }), [push])
  const card = useCallback((content: ReactNode) => push({ type: 'card', content }), [push])

  const showTyping = useCallback(() => push({ type: 'typing' }), [push])
  const hideTyping = useCallback(() => {
    setMessages((m) => m.filter((x) => x.type !== 'typing'))
  }, [])

  /** 스크립트 엔진용 — 정해진 시간만큼 점점점을 보여준 뒤 다음 말을 잇는다. */
  const typing = useCallback(
    (cb: () => void) => {
      showTyping()
      window.setTimeout(() => {
        hideTyping()
        cb()
      }, 430)
    },
    [showTyping, hideTyping],
  )

  /** 이전 대화를 지우고 처음부터 (세션 초기화와 짝) */
  const clear = useCallback(() => setMessages([]), [])

  return { messages, scrollRef, push, botSay, userSay, actions, card, typing, showTyping, hideTyping, clear }
}

export interface ChatViewProps {
  /** 단계 표시줄 — [제목, 설명, 진행률(%)] */
  title: string
  desc: string
  width: string
  messages: Msg[]
  scrollRef: React.RefObject<HTMLDivElement>
  input: string
  onInputChange: (v: string) => void
  /** 입력창의 글을 보낼 때 */
  onSend: () => void
  /** 마이크로 받아낸 말 — 엔진이 알아서 처리한다 */
  onTranscript: (text: string) => void
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
  /** 서버 응답을 기다리는 중이면 입력을 잠근다(같은 말을 두 번 보내는 것 방지) */
  busy?: boolean
  placeholder?: string
  /**
   * 말로 하시는지 자판으로 치시는지 바뀔 때 알려준다.
   * 엔진이 되물을 문구를 그에 맞게 쓴다 — 자판 쓰시는 분께 「말씀해 주세요」는 어긋난다.
   */
  onInputModeChange?: (mode: InputMode) => void
}

export function ChatView({
  title,
  desc,
  width,
  messages,
  scrollRef,
  input,
  onInputChange,
  onSend,
  onTranscript,
  onBack,
  onSos,
  onToast,
  busy = false,
  placeholder = '목적지나 질문을 입력하세요',
  onInputModeChange,
}: ChatViewProps) {
  /*
   * 마이크 — 홈 화면과 **같은 모듈**을 쓴다(state/speech).
   *
   * 예전에는 여기만 SpeechRecognition 을 직접 다뤘다. 그래서 두 가지가 갈렸다.
   *   · 오류 문구가 서로 달랐다
   *   · 홈에는 「듣고 있어요」 화면이 뜨는데 여기는 토스트뿐이라, 정작 말을 많이 하는
   *     대화 화면에서 지금 듣고 있는지 알기 어려웠다. 토스트는 몇 초 뒤 사라진다
   *   · 두 번 누르면 인식이 두 개 돌았다 — 막는 코드가 없었다
   */
  const [listening, setListening] = useState(false)
  const sessionRef = useRef<SpeechSession | null>(null)

  /*
   * **말로 하시는 중인가.**
   *
   * 봇이 「한 번만 다시 말씀해 주시겠어요?」라고 해놓고 마이크를 안 열고 있었다
   * (2026-08-17). 말로 대화하시던 분은 마이크가 닫힌 줄 모르니, 대답을 해도
   * 아무 일도 일어나지 않는다. 앱이 먼저 물어놓고 안 듣고 있는 것이다.
   *
   * 그래서 한 번 마이크를 쓰신 분에게는 **봇이 말할 때마다 마이크를 다시 연다.**
   *   · 켜짐 — 마이크를 누르셨을 때
   *   · 꺼짐 — 「그만두기」를 누르거나 자판으로 보내셨을 때
   *
   * 처음부터 자판으로 치시는 분에게는 켜지 않는다. 묻지도 않고 마이크를
   * 들이미는 것은 도움이 아니라 방해다.
   *
   * 「그만두기」가 곧 「이제 자판으로 할게요」라는 뜻이 되는 것이 중요하다 —
   * 마이크가 계속 열리는 게 싫을 때 빠져나갈 길이 없으면 갇힌 것이 된다.
   */
  const [voiceMode, setVoiceMode] = useState(false)
  /** 이 말풍선에는 이미 마이크를 열어봤다. 같은 말에 두 번 열지 않게 */
  const answeredRef = useRef(0)

  /** 지금까지 나온 마지막 봇 말풍선 번호 */
  const lastBotId = (): number => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].type === 'bot') return messages[i].id
    }
    return 0
  }

  // 화면을 떠날 때 듣던 것을 정리한다 — 마이크가 열린 채 남으면 안 된다
  useEffect(() => () => sessionRef.current?.cancel(), [])

  // 어느 쪽으로 하시는지 엔진에도 알린다 — 되물을 문구가 달라진다
  const modeChangeRef = useRef(onInputModeChange)
  modeChangeRef.current = onInputModeChange
  useEffect(() => {
    modeChangeRef.current?.(voiceMode ? 'voice' : 'text')
  }, [voiceMode])

  const micTap = useCallback(() => {
    if (listening || busy) return
    setVoiceMode(true)
    /*
     * 지금 화면에 떠 있는 말은 이미 답한 것으로 친다.
     * 안 그러면 이 말에 답하는 사이(듣기가 끝나고 봇이 답하기 전 짧은 틈)에
     * 아직 답 안 한 말로 보여서 마이크가 한 번 더 열린다.
     */
    answeredRef.current = lastBotId()
    setListening(true)
    sessionRef.current = listenOnce({
      onResult: (text) => {
        sessionRef.current = null
        setListening(false)
        onTranscript(text)
      },
      onError: (kind) => {
        sessionRef.current = null
        setListening(false)
        onToast(SPEECH_ERROR_TEXT[kind])
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, busy, messages, onTranscript, onToast])

  const micTapRef = useRef(micTap)
  micTapRef.current = micTap

  /**
   * **다 말했어요** — 지금까지 들은 것을 확정해서 보낸다.
   *
   * 왜 필요한가 — 주위가 시끄러우면 브라우저가 「말이 끝났다」를 못 잡는다. 말씀은
   * 다 하셨는데 화면은 계속 「듣고 있어요」다. 그때 버리는 것(그만두기)밖에 없으면
   * 다시 처음부터 말해야 하고, 시끄러운 곳에서는 몇 번을 해도 마찬가지다.
   *
   * 여기서 화면을 닫지 않는다 — 결과가 뒤이어 오고, 그때 onResult 가 닫는다.
   * 먼저 닫아버리면 알아들은 말이 어디로 갔는지 모르게 된다.
   */
  function finishListen() {
    sessionRef.current?.finish()
  }

  /**
   * 지금 듣던 것만 멈춘다. **말하기 모드는 그대로 둔다.**
   *
   * 듣는 중에 빠른 답변(「다시 말하기」·「병원」)을 누르셨을 때 쓴다.
   * 버튼을 눌렀다고 해서 「이제 자판으로 하겠다」는 뜻은 아니다.
   */
  function cancelListen() {
    sessionRef.current?.cancel()
    sessionRef.current = null
    setListening(false)
  }

  /** 「자판으로 할게요」 = 앞으로 마이크를 열지 않는다 */
  function switchToTyping() {
    cancelListen()
    setVoiceMode(false)
  }

  /** 자판으로 보내셨다 = 마이크를 더 열지 않는다 */
  function sendTyped() {
    setVoiceMode(false)
    onSend()
  }

  /*
   * 봇이 새로 말했으면 마이크를 다시 연다.
   *
   * **말이 끝난 뒤에** 연다 — 읽는 도중에 열면 우리 목소리를 우리가 받아 적는다
   * (state/tts whenSpeakingEnds).
   *
   * 점점점이 떠 있거나 답을 기다리는 중이면 아직이다. 그때 열어봐야 곧 다시
   * 닫히고, 어르신에게는 마이크가 깜빡이는 것처럼 보인다.
   */
  useEffect(() => {
    if (!voiceMode || busy || listening) return
    if (messages.some((m) => m.type === 'typing')) return
    const id = lastBotId()
    if (!id || answeredRef.current === id) return
    answeredRef.current = id
    return whenSpeakingEnds(() => micTapRef.current())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy, listening, voiceMode])

  return (
    <section className="screen">
      {/* 듣는 중에는 화면 전체로 알린다. 홈과 같은 모양이라 처음 보는 화면이 아니다 */}
      {listening && (
        <div className="listening" role="status" aria-live="assertive">
          <div className="listening-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <h2>듣고 있어요</h2>
          <p>천천히 말씀해 주세요</p>
          <span className="listening-help">
            말씀이 끝나면 저절로 넘어가요. 안 넘어가면 아래를 눌러주세요
          </span>

          {/* 시끄러우면 「말이 끝났다」를 브라우저가 못 잡는다. 그때 말씀하신 것을
              버리지 않고 보낼 수 있어야 한다 — 버리는 길만 있으면 처음부터 다시다 */}
          <button className="btn primary listening-done" onClick={finishListen}>
            다 말했어요
          </button>

          <button className="btn neutral listening-cancel" onClick={switchToTyping}>
            자판으로 할게요
          </button>
        </div>
      )}
      <TopBar title="대화로 길찾기" onBack={onBack} backLabel="홈으로 돌아가기" onSos={onSos} />

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
            if (m.type === 'day')
              return (
                <div key={m.id} className="chat-day">
                  {m.text}
                </div>
              )
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
                  </div>
                </div>
              )
            if (m.type === 'user')
              return (
                <div key={m.id} className="chat-msg me">
                  <div className="chat-content">
                    <div className="chat-bubble">{m.text}</div>
                  </div>
                </div>
              )
            if (m.type === 'actions')
              return (
                <div key={m.id} className="chat-actions">
                  {m.content}
                </div>
              )
            return (
              <div key={m.id} className="chat-card">
                {m.content}
              </div>
            )
          })}
        </div>
      </div>

      <div className="chat-composer">
        <div className="chat-input-row">
          <div className="chat-input-wrap">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && sendTyped()}
              placeholder={busy ? '답변을 기다리는 중이에요…' : placeholder}
              aria-label="AI 길벗에게 메시지 입력"
              disabled={busy}
            />
            <button className="chat-mic" onClick={micTap} aria-label="음성으로 말하기" disabled={busy}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="8.5" y="2.5" width="7" height="11.5" rx="3.5" fill="currentColor" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <button className="chat-send" onClick={sendTyped} aria-label="메시지 보내기" disabled={busy}>
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
