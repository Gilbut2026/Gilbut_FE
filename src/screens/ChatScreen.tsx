import { useMock } from '../api/mode'
import { ScriptedChatScreen } from './ScriptedChatScreen'
import { ServerChatScreen } from './ServerChatScreen'

/**
 * 대화로 길찾기 — 엔진 선택자.
 *
 * useMock('chat') 이 true 면 화면 안 스크립트(시연 안전판), false 면 BE 상태머신 실연동.
 * 두 엔진은 components/ChatView 를 함께 써서 어르신이 보는 화면은 동일하다.
 *
 * 스크립트 쪽을 지우지 않고 남긴 이유: 발표(2026-08-28) 때 BE·AI 서버가 죽거나
 * onrender 콜드스타트로 느려도 전체 흐름을 보여줄 수 있어야 하기 때문이다.
 * .env 에서 chat 을 Mock 으로 돌리면 즉시 그 안전판으로 돌아간다.
 */
export function ChatScreen(props: {
  prefill: string | null
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
  /** 대화 끝 — 목적지와 고른 출발 시각('YYYY-MM-DDTHH:mm:ss') */
  onDone: (destination: string, departureDateTime: string) => void
}) {
  return useMock('chat') ? <ScriptedChatScreen {...props} /> : <ServerChatScreen {...props} />
}
