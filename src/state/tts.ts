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

/** 한국어 음성 중 Google(가장 자연스러움) → 그 외 ko → null 순으로 고른다. */
function pickKoreanVoice(): SpeechSynthesisVoice | null {
  if (!hasTTS()) return null
  const ko = window.speechSynthesis.getVoices().filter((v) => /^ko/i.test(v.lang))
  return ko.find((v) => /google/i.test(v.name)) ?? ko[0] ?? null
}

function currentVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  cachedVoice = pickKoreanVoice()
  return cachedVoice
}

// 크롬 등은 getVoices() 가 비동기라 처음 호출 때 빈 배열일 수 있다 → 목록이 로드되면 다시 고른다.
if (hasTTS()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = pickKoreanVoice()
  }
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
