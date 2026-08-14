import { useEffect, useState } from 'react'
import { getHome, saveHome, searchPlaces } from '../api/place'

/**
 * 집 주소 등록/수정 바텀시트 — 7차 와이어프레임 #homeSheet 이식.
 * 입력 주소를 place 검색(searchPlaces)으로 실좌표로 변환해 저장한다.
 *  · mode='prompt' : 온보딩 직후 "집 주소를 등록할까요?" 권유 (나중에 할게요)
 *  · mode='edit'   : 일반 등록/수정
 * (설정 화면은 자체 인라인 시트를 쓰고, 이 컴포넌트는 온보딩 후 권유 프롬프트에 쓴다.)
 */
export function HomeAddressSheet({
  open,
  mode = 'edit',
  onClose,
  onToast,
  onSaved,
}: {
  open: boolean
  mode?: 'prompt' | 'edit'
  onClose: () => void
  onToast: (msg: string) => void
  onSaved?: () => void
}) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  // 열릴 때 저장된 주소가 있으면 채운다.
  useEffect(() => {
    if (!open) return
    let alive = true
    getHome().then((h) => {
      if (alive) setInput(h?.address ?? '')
    })
    return () => {
      alive = false
    }
  }, [open])

  async function save() {
    const address = input.trim()
    if (!address) {
      onToast('집 주소를 입력해 주세요')
      return
    }
    setSaving(true)
    try {
      // 입력 주소를 place 검색으로 실좌표 변환(첫 결과). 못 찾으면 수원 기본 좌표로 폴백.
      let latitude = 37.2636
      let longitude = 127.0286
      try {
        const first = (await searchPlaces({ keyword: address })).places[0]
        if (first) {
          latitude = first.latitude
          longitude = first.longitude
        }
      } catch {
        /* 검색 실패 시 기본 좌표 유지 */
      }
      await saveHome({ address, latitude, longitude })
      onSaved?.()
      onClose()
      onToast('집 주소를 저장했어요')
    } catch {
      onToast('저장에 실패했어요')
    } finally {
      setSaving(false)
    }
  }

  const isPrompt = mode === 'prompt'
  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <div className={`sheet${open ? ' show' : ''}`} role="dialog" aria-modal="true" aria-label="집 주소 등록">
        <div className="sheet-grip" />
        <h3>{isPrompt ? '집 주소를 등록할까요?' : '집 주소'}</h3>
        <p>
          {isPrompt
            ? '집에서 출발하는 일이 많아요. 한 번 등록해 두면 다음부터 집을 출발지·목적지로 바로 쓸 수 있어요.'
            : '등록해 두면 ‘집’을 출발지·목적지로 바로 쓸 수 있어요.'}
        </p>
        <label className="home-field">
          <span className="label">주소</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 수원시 팔달구 ○○로 12"
            aria-label="집 주소"
          />
        </label>
        <div className="sheet-actions">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? '저장하는 중…' : isPrompt ? '집 주소로 저장' : '저장하기'}
          </button>
          <button className="btn neutral" onClick={onClose}>
            {isPrompt ? '나중에 할게요' : '취소'}
          </button>
        </div>
      </div>
    </>
  )
}
