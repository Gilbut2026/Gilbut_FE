/**
 * 사용자 API — 이동특성(온보딩) / 접근성 설정 / 통합설정.
 * 화면은 이 파일의 함수만 호출한다. (Mock ↔ 실서버 스위칭)
 */
import { api } from './client'
import type {
  AccessibilitySettingResponse,
  AccessibilitySettingUpdateRequest,
  MobilityProfileResponse,
  MobilityProfileSaveRequest,
  UserSettingsResponse,
} from '../types/dto'
import {
  mockGetAccessibility,
  mockGetMobilityProfile,
  mockGetSettings,
  mockSaveAccessibility,
  mockSaveMobilityProfile,
} from '../mock/user'

import { useMock } from './mode'

const USE_MOCK = () => useMock('user')

const MOBILITY = '/api/users/me/mobility-profile'
const ACCESS = '/api/users/me/accessibility-settings'
const SETTINGS = '/api/users/me/settings'

/** 이동특성 조회 */
export function getMobilityProfile(): Promise<MobilityProfileResponse> {
  return USE_MOCK()
    ? mockGetMobilityProfile()
    : api.get<MobilityProfileResponse>(MOBILITY)
}

/** 이동특성 저장/수정 (온보딩 완료 시) */
export function saveMobilityProfile(
  req: MobilityProfileSaveRequest,
): Promise<MobilityProfileResponse> {
  return USE_MOCK()
    ? mockSaveMobilityProfile(req)
    : api.put<MobilityProfileResponse>(MOBILITY, req)
}

/** 접근성 설정 조회 */
export function getAccessibility(): Promise<AccessibilitySettingResponse> {
  return USE_MOCK()
    ? mockGetAccessibility()
    : api.get<AccessibilitySettingResponse>(ACCESS)
}

/** 접근성 설정 저장/수정 */
export function saveAccessibility(
  req: AccessibilitySettingUpdateRequest,
): Promise<AccessibilitySettingResponse> {
  return USE_MOCK()
    ? mockSaveAccessibility(req)
    : api.put<AccessibilitySettingResponse>(ACCESS, req)
}

/** 설정 화면 한 번에 조회 (이동특성 + 접근성 + 안전요약) */
export function getSettings(): Promise<UserSettingsResponse> {
  return USE_MOCK() ? mockGetSettings() : api.get<UserSettingsResponse>(SETTINGS)
}
