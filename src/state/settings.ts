/**
 * 접근성 설정 — BE AccessibilitySetting 계약과 동일한 형태로 유지한다.
 * 앱 셸이 글자 크기·고대비를 즉시 적용할 수 있게 localStorage 에 캐시한다.
 * (Mock 모드에선 이게 사실상의 저장소, 실서버 모드에선 서버값의 로컬 미러)
 */
import type { FontSize } from '../types/dto'

export interface Settings {
  fontSize: FontSize //          글자 크기 5단계 (와이어프레임 --ui-scale 과 매핑)
  highContrast: boolean //       고대비 모드
  voiceGuide: boolean //         음성 안내 on/off
  voiceSpeed: number //          음성 속도 0.7 ~ 1.4
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 'NORMAL', // 기본 '보통' (설정에서 크게로 키울 수 있음)
  highContrast: false,
  voiceGuide: true,
  voiceSpeed: 1.0,
}

/** 글자 크기 5단계 (설정 화면 표시용) */
export const FONT_SIZES: { value: FontSize; label: string }[] = [
  { value: 'EXTRA_SMALL', label: '아주 작게' },
  { value: 'SMALL', label: '작게' },
  { value: 'NORMAL', label: '보통' },
  { value: 'LARGE', label: '크게' },
  { value: 'EXTRA_LARGE', label: '아주 크게' },
]

const KEY = 'gilbet.settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 저장 실패는 무시 (시크릿 모드 등) */
  }
}
