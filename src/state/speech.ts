/**
 * 음성 인식(STT) — 브라우저 Web Speech API 한 곳.
 *
 * 홈 화면의 큰 마이크와 대화 화면의 입력창 마이크가 같은 코드를 쓴다.
 * 두 군데에 각자 두면 오류 문구나 언어 설정이 갈라진다.
 *
 * ⚠️ 크롬에서만 제대로 동작한다. 다른 브라우저에서는 시작조차 안 되므로
 *    'unsupported' 로 알려 화면이 대신 안내하게 한다(발표 시연도 크롬으로 한다).
 */

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export type SpeechErrorKind =
  | 'unsupported' //  이 브라우저가 음성 인식을 지원하지 않음
  | 'denied' //       마이크 권한 거부
  | 'no-speech' //    아무 말도 들리지 않음
  | 'failed' //       그 밖의 실패

/**
 * 인식을 중간에 멈출 수 있는 손잡이.
 *
 * 멈추는 데 두 가지가 있고, **결과를 살리느냐 버리느냐**가 다르다.
 *   finish  지금까지 들은 것을 확정해서 넘긴다 — 「다 말했어요」
 *   cancel  통째로 버린다 — 「그만할래요」
 *
 * 왜 둘이 필요한가 — 주위가 시끄러우면 브라우저가 「말이 끝났다」를 못 잡는다.
 * 말씀은 다 하셨는데 화면은 계속 「듣고 있어요」다. 그때 버리는 것밖에 없으면
 * 다시 처음부터 말해야 하고, 시끄러운 곳에서는 몇 번을 해도 마찬가지다.
 */
export interface SpeechSession {
  /** 지금까지 들은 것을 확정해 넘긴다 */
  finish: () => void
  /** 들은 것을 버리고 멈춘다 */
  cancel: () => void
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * 한 번 듣고 끝낸다.
 *
 * @param onResult 알아들은 말 (빈 문자열은 넘기지 않는다)
 * @param onError  실패 사유
 * @param onEnd    성공·실패와 관계없이 인식이 끝났을 때 (듣는 중 표시를 내리는 용도)
 * @returns 중간에 멈출 손잡이. 지원하지 않는 브라우저면 null.
 */
export function listenOnce({
  onResult,
  onError,
  onEnd,
}: {
  onResult: (text: string) => void
  onError: (kind: SpeechErrorKind) => void
  onEnd?: () => void
}): SpeechSession | null {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    onError('unsupported')
    onEnd?.()
    return null
  }

  const recognition = new SpeechRecognition()
  recognition.lang = 'ko-KR'
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  // 취소로 멈춘 경우에는 오류 안내를 띄우지 않는다 (사용자가 스스로 그만둔 것이므로)
  let cancelled = false
  /** 결과든 오류든 한 번은 알렸는가 */
  let told = false

  recognition.onresult = (event: any) => {
    const text = String(event?.results?.[0]?.[0]?.transcript ?? '').trim()
    told = true
    if (text) onResult(text)
    else onError('no-speech')
  }

  recognition.onerror = (event: any) => {
    if (cancelled) return
    if (event?.error === 'aborted') return
    told = true
    if (event?.error === 'not-allowed') onError('denied')
    else if (event?.error === 'no-speech') onError('no-speech')
    else onError('failed')
  }

  recognition.onend = () => {
    /*
     * 「다 말했어요」로 멈췄는데 아무것도 못 알아들은 경우가 있다.
     * 그냥 조용히 닫히면 어르신에게는 눌렀는데 아무 일도 안 일어난 것으로 보인다 —
     * 말씀이 안 들렸다고 알려드려야 다시 하실지 정할 수 있다.
     */
    if (!cancelled && !told) onError('no-speech')
    onEnd?.()
  }

  try {
    recognition.start()
  } catch {
    onError('failed')
    onEnd?.()
    return null
  }

  return {
    /*
     * stop() 은 지금까지 들은 것을 확정한다 — onresult 가 뒤이어 온다.
     * abort() 와 달리 버리지 않는다. 「다 말했어요」가 하는 일이 바로 이것이다.
     * 여기서 onEnd 를 부르지 않는 이유 — 결과가 아직 오는 중이다. recognition 이
     * 끝나면서 onend 로 알려준다.
     */
    finish: () => {
      try {
        recognition.stop()
      } catch {
        /* 이미 끝났으면 무시 */
      }
    },
    cancel: () => {
      cancelled = true
      try {
        recognition.abort()
      } catch {
        /* 이미 끝났으면 무시 */
      }
      onEnd?.()
    },
  }
}

/** 실패 사유 → 어르신에게 보여줄 문구 */
export const SPEECH_ERROR_TEXT: Record<SpeechErrorKind, string> = {
  unsupported: '이 브라우저는 음성 인식을 지원하지 않아요. 크롬을 사용해 주세요.',
  denied: '마이크 사용을 허용해 주세요.',
  'no-speech': '말씀이 들리지 않았어요. 다시 한 번 눌러주세요.',
  failed: '음성을 알아듣지 못했어요. 다시 한 번 눌러주세요.',
}
