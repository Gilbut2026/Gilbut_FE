/**
 * 안전 API — 비상 연락처 (SOS).
 * 화면은 이 파일의 함수만 호출한다. (Mock ↔ 실서버 스위칭)
 */
import { api } from './client'
import type {
  EmergencyContactResponse,
  EmergencyContactSaveRequest,
} from '../types/dto'
import {
  mockAddContact,
  mockDeleteContact,
  mockListContacts,
  mockUpdateContact,
} from '../mock/safety'

import { useMock } from './mode'

const USE_MOCK = () => useMock('safety')

const CONTACTS = '/api/users/me/emergency-contacts'

/** 비상 연락처 목록 (우선순위 순) */
export function listContacts(): Promise<EmergencyContactResponse[]> {
  return USE_MOCK()
    ? mockListContacts()
    : api.get<EmergencyContactResponse[]>(CONTACTS)
}

/** 비상 연락처 등록 */
export function addContact(
  req: EmergencyContactSaveRequest,
): Promise<EmergencyContactResponse> {
  return USE_MOCK()
    ? mockAddContact(req)
    : api.post<EmergencyContactResponse>(CONTACTS, req)
}

/** 비상 연락처 수정 */
export function updateContact(
  id: number,
  req: EmergencyContactSaveRequest,
): Promise<EmergencyContactResponse> {
  return USE_MOCK()
    ? mockUpdateContact(id, req)
    : api.put<EmergencyContactResponse>(`${CONTACTS}/${id}`, req)
}

/** 비상 연락처 삭제 */
export function deleteContact(id: number): Promise<void> {
  return USE_MOCK() ? mockDeleteContact(id) : api.del<void>(`${CONTACTS}/${id}`)
}
