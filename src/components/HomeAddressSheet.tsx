import { useEffect, useRef, useState } from 'react'
import { getHome, saveHome, searchPlaces } from '../api/place'
import { SEARCH_RADIUS_KM, SUWON_CENTER } from '../api/geo'
import { rankPlaceCandidates } from '../api/placeRank'
import type { LatLng, PlaceItemResponse } from '../types/dto'

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
  const [candidates, setCandidates] = useState<PlaceItemResponse[] | null>(null)
  const posRef = useRef<LatLng | null>(null)

  // 열릴 때 저장된 주소가 있으면 채우고, 현재 위치도 받아둔다.
  // 위치는 주소 검색의 기준점이 된다 — 같은 이름의 아파트가 전국에 있어서,
  // 기준점이 없으면 엉뚱한 동네가 집으로 저장될 수 있다.
  useEffect(() => {
    if (!open) return
    let alive = true
    setCandidates(null)

    getHome().then((h) => {
      if (alive) setInput(h?.address ?? '')
    })

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (alive) posRef.current = { latitude: p.coords.latitude, longitude: p.coords.longitude }
        },
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      )
    }
    return () => {
      alive = false
    }
  }, [open])

  /** 좌표까지 확정된 장소를 저장 */
  async function commit(address: string, coords: LatLng) {
    setSaving(true)
    try {
      await saveHome({ address, latitude: coords.latitude, longitude: coords.longitude })
      onSaved?.()
      onClose()
      onToast('집 주소를 저장했어요')
    } catch {
      onToast('저장에 실패했어요')
    } finally {
      setSaving(false)
    }
  }

  /**
   * 현재 위치 근처의 장소를 찾아 고르게 한다.
   * 좌표 → 주소 변환(역지오코딩)이 백엔드에 열려 있지 않아, 주소를 자동으로 적어줄 수는 없다.
   * 대신 집 근처의 아는 건물을 골라 저장하는 방식으로 타이핑 부담을 줄인다.
   */
  async function findNearby() {
    if (saving) return
    setSaving(true)
    try {
      let c = posRef.current
      if (!c && 'geolocation' in navigator) {
        c = await new Promise<LatLng | null>((res) =>
          navigator.geolocation.getCurrentPosition(
            (p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
            () => res(null),
            { enableHighAccuracy: true, timeout: 8000 },
          ),
        )
        if (c) posRef.current = c
      }
      if (!c) {
        onToast('현재 위치를 확인할 수 없어요. 주소를 적어주세요')
        return
      }
      // 집 주변에 흔히 있고 이름이 뚜렷한 것들로 찾는다
      const res = await searchPlaces({
        keyword: '아파트',
        lat: String(c.latitude),
        lon: String(c.longitude),
        radiusKm: '1',
      })
      const ranked = rankPlaceCandidates(res.places)
      if (ranked.length === 0) {
        onToast('근처에서 찾은 곳이 없어요. 주소를 적어주세요')
        return
      }
      setCandidates(ranked.slice(0, 4))
    } catch {
      onToast('근처를 찾는 중에 문제가 생겼어요')
    } finally {
      setSaving(false)
    }
  }

  /**
   * 입력한 주소를 현재 위치 근처에서 검색해 후보를 보여준다.
   * 예전에는 검색 결과 첫 번째를 말없이 채택했는데, 같은 이름이 여러 곳이면
   * 엉뚱한 곳이 집으로 저장된다. 집은 출발지 기본값이라 틀리면 모든 경로가 어긋난다.
   */
  async function search() {
    const address = input.trim()
    if (!address) {
      onToast('집 주소를 입력해 주세요')
      return
    }
    setSaving(true)
    try {
      const c = posRef.current
      const res = await searchPlaces({
        keyword: address,
        lat: String((c ?? SUWON_CENTER).latitude),
        lon: String((c ?? SUWON_CENTER).longitude),
        radiusKm: SEARCH_RADIUS_KM,
      })
      const ranked = rankPlaceCandidates(res.places, address)
      if (ranked.length === 0) {
        onToast('그 주소로는 장소를 찾지 못했어요')
        return
      }
      // 딱 하나면 되묻지 않는다 — 어르신에게 불필요한 단계를 만들지 않는다
      if (ranked.length === 1) {
        const only = ranked[0]
        await commit(only.address || address, { latitude: only.latitude, longitude: only.longitude })
        return
      }
      setCandidates(ranked.slice(0, 4))
    } catch {
      onToast('주소를 찾는 중에 문제가 생겼어요')
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
            onChange={(e) => {
              setInput(e.target.value)
              setCandidates(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && !saving && search()}
            placeholder="예: 행복아파트, 매탄동 주민센터"
            aria-label="집 주소"
          />
        </label>

        {/*
          현재 위치로 채우기.
          역지오코딩(좌표 → 주소)은 백엔드에 엔드포인트가 없어서, 주소를 자동으로 적어줄 수는 없다.
          대신 현재 위치 근처를 검색해 **가까운 장소 목록**을 보여주고 고르게 한다.
          예전 설정 화면에는 '경기 수원시 팔달구 (현재 위치)'라는 문자열을 입력창에 박아 넣는
          가짜 버튼이 있었다 — GPS 를 쓰지도 않았고, 그 문자열로는 장소가 검색되지 않아
          집이 엉뚱한 좌표로 저장됐다.
        */}
        <button className="home-gps" onClick={findNearby} disabled={saving}>
          📍 현재 위치 근처에서 찾기
        </button>

        {/* 같은 이름이 여러 곳일 때만 고르게 한다 */}
        {candidates && candidates.length > 0 && (
          <div className="home-candidates">
            <span className="label">어느 곳인가요?</span>
            {candidates.map((p, i) => (
              <button
                key={`${p.placeId}-${i}`}
                className="chat-place pick"
                disabled={saving}
                onClick={() =>
                  commit(p.address || p.name, { latitude: p.latitude, longitude: p.longitude })
                }
              >
                <span className="pin">📍</span>
                <span>
                  <b>{p.name}</b>
                  <span>{p.address}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="sheet-actions">
          <button className="btn primary" onClick={search} disabled={saving}>
            {saving ? '찾는 중…' : isPrompt ? '집 주소로 저장' : '저장하기'}
          </button>
          <button className="btn neutral" onClick={onClose}>
            {isPrompt ? '나중에 할게요' : '취소'}
          </button>
        </div>
      </div>
    </>
  )
}
