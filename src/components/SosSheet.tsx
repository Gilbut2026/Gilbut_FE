import { useEffect, useState } from 'react'
import { listContacts } from '../api/safety'
import type { EmergencyContactResponse } from '../types/dto'

/**
 * 비상 도움 요청 바텀시트 — 7차 와이어프레임 #sosSheet 이식.
 * 상단바 SOS 버튼(전 화면 onSos)에서 열린다.
 *  · 119에 전화하기      : tel: 로 바로 전화 연결
 *  · 보호자에게 위치 보내기 : 현재 GPS 좌표를 지도 링크로 만들어 1순위 연락처에게 문자앱으로 전송
 * (역지오코딩·서버 없이 브라우저 기능만으로 동작한다. 위치를 못 가져와도 위치 없이 문자를 연다.)
 */
export function SosSheet({
  open,
  onClose,
  onToast,
}: {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
}) {
  const [contacts, setContacts] = useState<EmergencyContactResponse[]>([])
  const [sending, setSending] = useState(false)

  // 열릴 때 비상 연락처를 읽어 1순위(우선순위 낮은 값)를 보호자로 삼는다.
  useEffect(() => {
    if (!open) return
    let alive = true
    listContacts()
      .then((cs) => {
        if (alive) setContacts(cs)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [open])

  const guardian = [...contacts].sort((a, b) => a.priority - b.priority)[0] ?? null

  function sendGuardian() {
    if (!guardian) {
      onToast('먼저 설정에서 비상 연락처를 등록해 주세요')
      return
    }
    const openSms = (body: string) => {
      window.location.href = `sms:${guardian.phoneNumber}?body=${encodeURIComponent(body)}`
    }
    const helpNoLoc = '도움이 필요해요. 지금 저에게 연락해 주세요. (AI 길벗)'

    setSending(true)
    onToast('현재 위치를 확인하고 있어요…')

    if (!('geolocation' in navigator)) {
      openSms(helpNoLoc)
      setSending(false)
      onClose()
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const map = `https://maps.google.com/?q=${latitude},${longitude}`
        openSms(`도움이 필요해요. 지금 제 위치예요: ${map} (AI 길벗)`)
        setSending(false)
        onClose()
      },
      () => {
        // 위치 거부/실패 — 위치 없이라도 도움 요청 문자를 연다.
        openSms(helpNoLoc)
        setSending(false)
        onToast('위치를 가져오지 못해 위치 없이 문자를 열었어요')
        onClose()
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <div className={`sheet${open ? ' show' : ''}`} role="dialog" aria-modal="true" aria-label="비상 도움 요청">
        <div className="sheet-grip" />
        <div className="sos-circle" aria-hidden="true">
          SOS
        </div>
        <h3>비상 연락처에 알릴까요?</h3>
        <p>
          {guardian
            ? `${guardian.name}님에게 현재 위치를 보내고, 119에 바로 전화할 수 있어요.`
            : '119에 바로 전화할 수 있어요. 보호자에게 위치를 보내려면 먼저 비상 연락처를 등록해 주세요.'}
        </p>
        <div className="sheet-actions">
          <a className="btn danger" href="tel:119">
            119에 전화하기
          </a>
          <button className="btn secondary" onClick={sendGuardian} disabled={sending || !guardian}>
            {sending ? '위치 확인 중…' : '보호자에게 위치 보내기'}
          </button>
          <button className="btn neutral" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </>
  )
}
