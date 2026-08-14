/** Mock 유저 도메인 — 이동특성 / 접근성 / 통합설정을 인메모리로 유지한다. */
import type {
  AccessibilitySettingResponse,
  AccessibilitySettingUpdateRequest,
  MobilityProfileResponse,
  MobilityProfileSaveRequest,
  UserSettingsResponse,
} from '../types/dto'
import { delay } from './_shared'

// 온보딩 기본값 (BE enum 값과 동일)
let mobilityProfile: MobilityProfileResponse = {
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

export function mockGetMobilityProfile(): Promise<MobilityProfileResponse> {
  return delay(mobilityProfile)
}

export function mockSaveMobilityProfile(
  req: MobilityProfileSaveRequest,
): Promise<MobilityProfileResponse> {
  mobilityProfile = { ...mobilityProfile, ...req }
  return delay(mobilityProfile)
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
    mobilityProfile,
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
