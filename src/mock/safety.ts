/** Mock 안전 도메인 — 비상 연락처를 인메모리로 유지한다. */
import type {
  EmergencyContactResponse,
  EmergencyContactSaveRequest,
} from '../types/dto'
import { delay, nextId } from './_shared'
import { mockSetEmergencyCount } from './user'

let contacts: EmergencyContactResponse[] = [
  { id: nextId(), name: '김보호', relationship: '자녀', phoneNumber: '010-1234-5678', priority: 1 },
]
mockSetEmergencyCount(contacts.length)

function syncCount(): void {
  mockSetEmergencyCount(contacts.length)
}

export function mockListContacts(): Promise<EmergencyContactResponse[]> {
  return delay([...contacts].sort((a, b) => a.priority - b.priority))
}

export function mockAddContact(
  req: EmergencyContactSaveRequest,
): Promise<EmergencyContactResponse> {
  // 순위는 등록 순서로 서버가 정한다(2026-08-16 BE 변경). Mock 도 같은 규칙을 따른다.
  const created: EmergencyContactResponse = {
    id: nextId(),
    ...req,
    priority: contacts.length + 1,
  }
  contacts = [...contacts, created]
  syncCount()
  return delay(created)
}

export function mockUpdateContact(
  id: number,
  req: EmergencyContactSaveRequest,
): Promise<EmergencyContactResponse> {
  contacts = contacts.map((c) => (c.id === id ? { ...c, ...req } : c))
  return delay(contacts.find((c) => c.id === id) as EmergencyContactResponse)
}

export function mockDeleteContact(id: number): Promise<void> {
  contacts = contacts.filter((c) => c.id !== id)
  // 지우면 남은 것의 순위를 다시 매긴다 — BE 도 그렇게 한다
  contacts = contacts.map((c, i) => ({ ...c, priority: i + 1 }))
  syncCount()
  return delay(undefined)
}
