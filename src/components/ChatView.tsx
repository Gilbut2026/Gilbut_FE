declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { speak } from '../state/tts'
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
}: ChatViewProps) {
  function micTap() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

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
      if (text) onTranscript(text)
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
    } catch {
      onToast('마이크를 시작할 수 없어요. 다시 눌러주세요')
    }
  }

  return (
    <section className="screen">
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
              onKeyDown={(e) => e.key === 'Enter' && !busy && onSend()}
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
          <button className="chat-send" onClick={onSend} aria-label="메시지 보내기" disabled={busy}>
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
