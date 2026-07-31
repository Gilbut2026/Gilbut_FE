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
  const created: EmergencyContactResponse = { id: nextId(), ...req }
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
  syncCount()
  return delay(undefined)
}
