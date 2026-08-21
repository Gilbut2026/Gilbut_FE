/**
 * 공용 음성 안내(TTS) — Web Speech API `speechSynthesis` 를 한 곳에서 다룬다.
 * 7차 와이어프레임의 speak(text, auto) 설계를 이식·통합했다:
 *  · 목소리: getVoices() 에서 "Google 한국의" 같은 자연스러운 한국어 음성을 우선 선택(없으면 기본).
 *    (지금까지는 목소리를 안 골라 기기 기본 음성 — 로봇 같은 소리 — 이 나왔다.)
 *  · 속도: 설정(voiceSpeed) 반영. auto=true(자동 발화)면 음성 안내 off 일 때 읽지 않는다.
 *
 * 이 파일 전에는 6개 화면(Chat·StairChoice·Results·CallTaxi·Drt·Help)이 제각각
 * SpeechSynthesisUtterance 를 직접 만들어 목소리·설정 연동이 없었다 → 여기로 통일한다.
 */
import { loadSettings } from './settings'

const hasTTS = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window

let cachedVoice: SpeechSynthesisVoice | null = null

/**
 * 한국어인가.
 *
 * `/^ko/` 로는 안 된다 — **코카니어(Konkani, 인도)의 언어 코드가 `kok`** 이라 같이 걸린다.
 * 갤럭시 폴드 8 에서 「한국어 목소리」 3개 중 2개가 코카니어였다(2026-08-21). 이름에
 * google 이 든 목소리가 없는 기기에서는 아래 규칙이 ko[0] — 목록 맨 앞 하나 — 로
 * 떨어지는데, 목록 순서는 브라우저가 정한다. 코카니어가 앞에 오는 브라우저에서는
 * **인도 목소리가 한국어를 읽는다.**
 *
 * 안드로이드는 로케일을 ko_KR 처럼 밑줄로 주기도 해서 둘 다 받는다.
 */
const isKorean = (v: SpeechSynthesisVoice): boolean => /^ko([-_]|$)/i.test(v.lang)

/** 한국어 음성 중 Google(가장 자연스러움) → 그 외 ko → null 순으로 고른다. */
function pickKoreanVoice(): SpeechSynthesisVoice | null {
  if (!hasTTS()) return null
  const ko = window.speechSynthesis.getVoices().filter(isKorean)
  return ko.find((v) => /google/i.test(v.name)) ?? ko[0] ?? null
}

function currentVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  cachedVoice = pickKoreanVoice()
  return cachedVoice
}

const voiceListeners = new Set<() => void>()

// 크롬 등은 getVoices() 가 비동기라 처음 호출 때 빈 배열일 수 있다 → 목록이 로드되면 다시 고른다.
if (hasTTS()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickKoreanVoice()
    voiceListeners.forEach((l) => l())
  }
  /*
   * 앱이 뜰 때 목록을 미리 부른다.
   *
   * getVoices() 를 한 번 불러 줘야 브라우저가 목록을 채우기 시작한다. 첫 발화 때가
   * 되어서야 부르면 그 순간엔 아직 비어 있어서 목소리를 못 고르고, utter.voice 를
   * 비운 채 내보내게 된다. 그러면 **그 한 마디만 브라우저가 알아서 고른 목소리**로
   * 나간다 — 같은 폰, 같은 설정인데 크롬과 APK 소리가 달랐던 이유일 수 있다.
   * 여기서 미리 불러 두면 사용자가 말을 걸 때쯤엔 목록이 준비돼 있다.
   */
  cachedVoice = pickKoreanVoice()
}

export interface SpeakOptions {
  /** true=자동 발화(음성 안내 off 면 읽지 않음). 생략/false=사용자가 직접 요청 → 설정과 무관하게 재생. */
  auto?: boolean
}

/**
 * 텍스트를 소리로 읽는다.
 * @returns 미지원 브라우저면 false (호출부가 "이 기기에선 음성 안내를 쓸 수 없어요" 토스트 등 처리).
 *          auto 발화가 설정상 생략된 경우는 정상이므로 true.
 */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  if (!hasTTS()) return false
  const settings = loadSettings()
  if (opts.auto && !settings.voiceGuide) return true
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ko-KR'
  utter.rate = settings.voiceSpeed || 1
  const voice = currentVoice()
  if (voice) utter.voice = voice
  window.speechSynthesis.speak(utter)
  return true
}

/** 재생 중인 음성 중단 */
export function stopSpeaking(): void {
  if (hasTTS()) window.speechSynthesis.cancel()
}

/**
 * 지금 읽고 있는 말이 **끝나면** 알려준다. 읽는 중이 아니면 곧바로 알린다.
 *
 * 왜 필요한가 — 말이 끝나기 전에 마이크를 열면 우리 목소리를 우리가 받아 적는다.
 * 「다시 말씀해 주시겠어요?」를 읽는 도중에 마이크를 열면 그 문장이 사용자의 말로
 * 들어간다.
 *
 * Web Speech 에는 「다 읽었다」를 알리는 전역 신호가 없다. utterance 마다 onend 가
 * 있지만 speak() 는 그것을 밖으로 내주지 않고, 여러 곳에서 부르므로 어느 utterance 를
 * 기다려야 하는지도 알 수 없다. 그래서 speaking 을 지켜본다.
 *
 * 상한을 둔다 — 브라우저가 speaking 을 참인 채로 두고 멈추는 경우가 있는데
 * (탭이 백그라운드로 가거나 음성이 끊겼을 때), 그러면 영영 안 열린다.
 * 못 기다렸으면 그냥 여는 편이 낫다.
 *
 * @returns 그만 기다리게 하는 함수. 화면을 떠날 때 부른다.
 */
export function whenSpeakingEnds(cb: () => void): () => void {
  if (!hasTTS() || !window.speechSynthesis.speaking) {
    const t = window.setTimeout(cb, 0)
    return () => window.clearTimeout(t)
  }
  const started = performance.now()
  const id = window.setInterval(() => {
    if (!window.speechSynthesis.speaking || performance.now() - started > 12_000) {
      window.clearInterval(id)
      cb()
    }
  }, 180)
  return () => window.clearInterval(id)
}

/* ------------------------------------------------------------
 *  지금 무슨 목소리로 읽고 있는가 — 설정 화면에서 눈으로 확인하기 위한 것.
 *
 *  왜 필요한가 — 목소리를 고르는 규칙(pickKoreanVoice)은 이름에 「google」이 들어가는지
 *  하나로 갈린다. 그런데 getVoices() 가 주는 목록은 브라우저가 안드로이드 TTS 에 저마다
 *  다른 방식으로 물어본 결과라, **같은 폰에서도** 크롬과 삼성인터넷이 서로 다른 목소리를
 *  냈다(갤럭시 폴드 8, 2026-08-21). 규칙이 걸리지 않으면 조용히 ko[0] 으로 떨어지는데
 *  화면에는 아무 흔적이 없어서, 발표 무대에서야 목소리가 바뀐 걸 알게 된다.
 *  이름을 띄워 두면 시연 직전에 확인할 수 있고, 예비 기기에서 같은 목소리를 다시
 *  찾아낼 수도 있다(기종이 아니라 목소리를 맞춰야 한다).
 * ------------------------------------------------------------ */

/**
 * 목소리 하나를 가리키는 값들.
 *
 * name 만으로는 부족하다 — 이름은 엔진이 붙인 라벨일 뿐이라 **서로 다른 목소리가 같은
 * 이름을 달고 나올 수 있다.** 크롬으로 설치한 앱과 APK 가 둘 다 「한국어 대한민국」이라고
 * 표시하면서 실제로는 다른 소리를 냈다(갤럭시 폴드 8, 2026-08-21). 진짜 식별자는
 * voiceURI 고, 소리가 갈리는 흔한 이유가 하나 더 있어서 local 도 같이 본다 —
 * 기기 안에 든 음성과 서버에서 받아 오는 음성은 같은 이름이어도 소리가 다르다.
 */
export interface VoiceRef {
  name: string
  lang: string
  /** 진짜 식별자. 이름이 같아도 이게 다르면 다른 목소리다. */
  uri: string
  /** true = 기기에 설치된 음성, false = 네트워크로 받아 오는 음성 */
  local: boolean
}

export interface VoiceInfo {
  /** 이 기기에서 음성 안내를 쓸 수 있는가 */
  supported: boolean
  /** 지금 고른 목소리. null 이면 못 골라서 **기기 기본 목소리**로 읽고 있다는 뜻. */
  picked: VoiceRef | null
  /** 이 기기가 가진 한국어 목소리 전부 (고를 수 있었던 후보들) */
  korean: VoiceRef[]
}

const toRef = (v: SpeechSynthesisVoice): VoiceRef => ({
  name: v.name,
  lang: v.lang,
  uri: v.voiceURI,
  local: v.localService,
})

export function getVoiceInfo(): VoiceInfo {
  if (!hasTTS()) return { supported: false, picked: null, korean: [] }
  const voice = currentVoice()
  return {
    supported: true,
    picked: voice ? toRef(voice) : null,
    korean: window.speechSynthesis.getVoices().filter(isKorean).map(toRef),
  }
}

/**
 * 목소리 목록이 채워지면 알려준다. 화면을 떠날 때 돌려받은 함수를 부른다.
 *
 * onvoiceschanged 만 믿을 수는 없다 — 목록을 늦게 채우면서 이 신호를 끝내 주지 않는
 * 브라우저가 있다. 그러면 설정 화면에 「기기 기본 목소리」라고 영영 떠 있어서, 확인하러
 * 들어온 사람이 잘못된 답을 보고 나간다. 그래서 구독하는 동안 잠깐(3초) 목록 길이를
 * 지켜보다가 달라지면 다시 고르고 알린다. 3초면 충분하고, 그 뒤로는 타이머를 놓는다.
 */
export function subscribeVoices(cb: () => void): () => void {
  voiceListeners.add(cb)
  if (!hasTTS()) return () => voiceListeners.delete(cb)

  let seen = window.speechSynthesis.getVoices().length
  const started = performance.now()
  const id = window.setInterval(() => {
    const now = window.speechSynthesis.getVoices().length
    if (now !== seen) {
      seen = now
      cachedVoice = pickKoreanVoice()
      cb()
    }
    if (performance.now() - started > 3000) window.clearInterval(id)
  }, 300)

  return () => {
    voiceListeners.delete(cb)
    window.clearInterval(id)
  }
}
