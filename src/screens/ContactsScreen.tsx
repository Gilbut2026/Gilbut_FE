import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { addContact, deleteContact, listContacts } from '../api/safety'
import type { EmergencyContactResponse } from '../types/dto'

/**
 * 비상 연락처 — 7차 와이어프레임 #screen-contacts 이식 + 실제 CRUD.
 * api/safety (BE /api/users/me/emergency-contacts) 연동. Mock 모드에서도 그대로 동작.
 */

/**
 * 전화번호를 하이픈 있는 형태로 되돌린다.
 * ⚠️ 실서버는 `010-1234-5678` 로 보내도 하이픈을 지워 `01012345678` 로 저장·반환한다
 *    (2026-08-04 로컬 실연결로 확인). 어르신 화면에 숫자 11자리가 붙어 나오면 읽기 어려우므로
 *    표시할 때 다시 끊어준다. 형식을 못 알아보면 원본을 그대로 둔다.
 */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (/^02\d{7,8}$/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3') // 서울 국번
  if (/^\d{9,11}$/.test(d)) return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  return raw
}


export function ContactsScreen({
  onBack,
  onSos,
  onToast,
}: {
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  const [contacts, setContacts] = useState<EmergencyContactResponse[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [saving, setSaving] = useState(false)

  function reload() {
    listContacts().then(setContacts)
  }
  useEffect(reload, [])

  function openSheet() {
    setName('')
    setRelationship('')
    setPhoneNumber('')
    setSheetOpen(true)
  }

  async function handleAdd() {
    if (!name.trim() || !relationship.trim() || !phoneNumber.trim()) {
      onToast('이름·관계·전화번호를 모두 입력해 주세요')
      return
    }
    setSaving(true)
    try {
      await addContact({
        name: name.trim(),
        relationship: relationship.trim(),
        phoneNumber: phoneNumber.trim(),
        priority: contacts.length + 1,
      })
      setSheetOpen(false)
      reload()
      onToast('연락처를 저장했어요')
    } catch {
      onToast('저장에 실패했어요')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    await deleteContact(id)
    reload()
    onToast('연락처를 삭제했어요')
  }

  return (
    <section className="screen">
      <TopBar title="비상 연락처" onBack={onBack} backLabel="설정으로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <h2 className="screen-title" style={{ fontSize: 27 }}>
          비상 연락처
        </h2>
        <p className="screen-lead">SOS를 누르면 등록 순서대로 현재 위치를 알려요.</p>

        {contacts.map((c) => (
          <div key={c.id} className="list-card glass">
            <div className="list-item">
              <div className="list-avatar">👤</div>
              <div className="list-copy">
                <span className="tag">
                  {c.relationship} · {c.priority}순위
                </span>
                <b>{c.name}</b>
                <span>{formatPhone(c.phoneNumber)}</span>
              </div>
              <div className="list-actions">
                <button onClick={() => handleDelete(c.id)} aria-label={`${c.name} 삭제`}>
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}

        <button className="btn secondary" onClick={openSheet}>
          ＋ 연락처 추가하기
        </button>

        <div className="notice-box">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 8h.01M11 12h1v4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          119는 기본으로 항상 표시하며, 위치 전송 전 사용자에게 다시 확인합니다.
        </div>
      </div>

      <div className={`scrim${sheetOpen ? ' show' : ''}`} onClick={() => setSheetOpen(false)} />
      <div className={`sheet${sheetOpen ? ' show' : ''}`}>
        <div className="sheet-grip" />
        <h3>연락처 추가</h3>
        <label className="sheet-field">
          <span className="label">이름</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김보호" />
        </label>
        <label className="sheet-field">
          <span className="label">관계</span>
          <input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="예: 자녀" />
        </label>
        <label className="sheet-field">
          <span className="label">전화번호</span>
          <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="010-1234-5678" inputMode="tel" />
        </label>
        <div className="sheet-actions" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={handleAdd} disabled={saving}>
            {saving ? '저장하는 중…' : '저장하기'}
          </button>
          <button className="btn neutral" onClick={() => setSheetOpen(false)}>
            취소
          </button>
        </div>
      </div>
    </section>
  )
}
