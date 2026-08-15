/**
 * Mock 유저 도메인 — 이동특성 / 접근성 / 통합설정.
 *
 * ⚠️ 이동특성만은 **localStorage 에 남긴다.** 나머지는 인메모리라 새로고침하면 사라진다.
 *
 * 왜 이것만 다른가 — 이동특성이 있느냐 없느냐가 곧 "온보딩을 했느냐"다.
 * 실서버는 온보딩을 저장할 때만 프로필을 만들고 없으면 404 를 준다
 * (UserMobilityProfileService.MOBILITY_PROFILE_NOT_FOUND). 그런데 Mock 은 늘 있다고
 * 답해서, 새로고침할 때마다 온보딩 7문항을 다시 하게 됐다.
 * Mock 이 실서버와 다르게 굴면 화면 쪽에 "Mock 이면 이렇게" 같은 예외를 만들어야 하고,
 * 그 예외는 진짜 동작을 가려버린다. 그래서 Mock 이 실서버 규칙을 그대로 따르게 했다.
 *
 * 처음부터 다시 보려면 브라우저 콘솔에서:  localStorage.clear()
 */
import type {
  AccessibilitySettingResponse,
  AccessibilitySettingUpdateRequest,
  MobilityProfileResponse,
  MobilityProfileSaveRequest,
  UserSettingsResponse,
} from '../types/dto'
import { delay } from './_shared'
import { ApiError } from '../api/client'

const PROFILE_KEY = 'gilbet.mock.profile'

function loadProfile(): MobilityProfileResponse | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as MobilityProfileResponse) : null
  } catch {
    return null
  }
}

function saveProfile(p: MobilityProfileResponse): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  } catch {
    /* 저장 실패는 무시 (시크릿 모드 등) */
  }
}

/** 온보딩 기본값 (BE enum 값과 동일) — 저장된 값이 없을 때 채워 넣을 바탕 */
const PROFILE_BASE: MobilityProfileResponse = {
  id: 1,
  walkingDuration: 'WITHIN_20_MINUTES',
  stairLevel: 'SLIGHTLY_DIFFICULT',
  slopeLevel: 'SLIGHTLY_DIFFICULT',
  restStopPreference: 'NO_PREFERENCE',
  transferLevel: 'FEWER_PREFERRED',
  mobilityAid: 'NOT_USED',
}

let accessibility: AccessibilitySettingResponse = {
  id: 1,
  voiceGuidanceEnabled: true,
  highContrastEnabled: false,
  fontSize: 'LARGE',
  voiceSpeed: 1.0,
}

// 설정 화면 '내 정보와 안전' 요약에 쓰는 값 (place/safety Mock 과 연동 전 임시)
let homeAddress: string | null = null
let emergencyContactCount = 0

/** 저장된 이동특성. 온보딩 전이면 실서버와 똑같이 404 를 낸다 */
export async function mockGetMobilityProfile(): Promise<MobilityProfileResponse> {
  const saved = loadProfile()
  if (!saved) throw new ApiError(404, '사용자 이동 특성 정보를 찾을 수 없습니다.')
  return delay(saved)
}

export function mockSaveMobilityProfile(
  req: MobilityProfileSaveRequest,
): Promise<MobilityProfileResponse> {
  const next = { ...(loadProfile() ?? PROFILE_BASE), ...req }
  saveProfile(next)
  return delay(next)
}

export function mockGetAccessibility(): Promise<AccessibilitySettingResponse> {
  return delay(accessibility)
}

export function mockSaveAccessibility(
  req: AccessibilitySettingUpdateRequest,
): Promise<AccessibilitySettingResponse> {
  accessibility = { ...accessibility, ...req }
  return delay(accessibility)
}

export function mockGetSettings(): Promise<UserSettingsResponse> {
  return delay({
    mobilityProfile: loadProfile() ?? PROFILE_BASE,
    accessibilitySettings: accessibility,
    safety: { homeAddress, emergencyContactCount },
  })
}

/** place/safety Mock 이 요약값을 갱신할 수 있게 열어둔다 */
export function mockSetHomeAddress(addr: string | null): void {
  homeAddress = addr
}
export function mockSetEmergencyCount(n: number): void {
  emergencyContactCount = n
}
