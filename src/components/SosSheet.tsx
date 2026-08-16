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
  /** 연락처를 못 불러왔는가 — 「없다」와 구분해야 안내 문구가 맞는다 */
  const [loadFailed, setLoadFailed] = useState(false)

  // 열릴 때 비상 연락처를 읽어 1순위(우선순위 낮은 값)를 보호자로 삼는다.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoadFailed(false)
    listContacts()
      .then((cs) => {
        if (alive) setContacts(cs)
      })
      /*
       * **못 불러온 것과 없는 것은 다르다.**
       *
       * 예전에는 실패를 조용히 삼켜서, 연락처가 있는 분에게도 「먼저 비상 연락처를
       * 등록해 주세요」가 떴다. 이미 등록해둔 사람에게 등록하라고 말하는 것이고,
       * 그것도 급할 때 그런다. 119 는 어느 쪽이든 되므로 그것만은 분명히 해둔다.
       */
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [open])

  /*
   * 위치를 보낼 곳은 **1순위 연락처 한 명**이다.
   * 여러 명에게 보내지 않는다 — 급할 때 문자 앱이 여러 번 열리면 오히려 아무에게도 못 보낸다.
   * 화면에도 「1순위 연락처인 ○○○님」이라고 적어서 누구에게 가는지 미리 알 수 있게 한다.
   */
  const guardian = [...contacts].sort((a, b) => a.priority - b.priority)[0] ?? null

  function sendGuardian() {
    if (!guardian) {
      onToast(
        loadFailed
          ? '비상 연락처를 불러오지 못했어요. 119에는 바로 전화하실 수 있어요'
          : '먼저 설정에서 비상 연락처를 등록해 주세요',
      )
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
            ? `1순위 연락처인 ${guardian.name}님에게 현재 위치를 문자로 보내고, 119에 바로 전화할 수 있어요.`
            : loadFailed
              ? '비상 연락처를 불러오지 못했어요. 119에는 바로 전화하실 수 있어요.'
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
