/**
 * 지도에서 고르기 — 출발지를 말로도 글로도 정하기 어려울 때.
 *
 * 어르신께 가장 어려운 선택지가 「직접 입력」이다. 사는 곳 이름을 정확히 적어야 하고,
 * 오타 하나에 엉뚱한 데가 나온다. 지도는 눈으로 보고 짚는 것이라 훨씬 쉽다.
 *
 * **핀을 끌지 않고 지도를 움직인다.**
 *   핀을 끌게 하면 손이 떨리는 분은 놓치고, 작은 핀을 정확히 눌러야 한다.
 *   핀을 화면 한가운데 못 박아두고 지도를 밀게 하면, 어디를 잡아 밀어도 된다.
 *   지도 앱들이 다 이렇게 하는 데는 이유가 있다.
 *
 * 주소는 지도가 멈춘 뒤에 한 번만 물어본다(idle). 미는 동안 계속 물으면 글자가
 * 어지럽게 바뀌고 조회도 그만큼 늘어난다.
 *
 * 주소를 못 알아내도 고를 수 있다 — 산길이나 새로 난 길은 주소가 없다.
 * 그때는 지어내지 않고 「이 자리」라고만 한다. 틀린 주소보다 없는 편이 낫다.
 */

import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../types/dto'
import { addressOf, hasKakaoKey, loadKakaoSdk } from '../state/kakaoSdk'

/** 처음 띄울 배율 — 건물 하나하나가 보이면서 동네도 가늠되는 정도 */
const PICK_ZOOM_LEVEL = 3

/** 현재 위치를 못 받았을 때 시작할 자리 — 수원시청 */
const FALLBACK: LatLng = { latitude: 37.263573, longitude: 127.028601 }

export function MapPicker({
  open,
  center,
  title = '지도에서 출발지 고르기',
  hint = '지도를 움직여 출발할 곳에 맞춰주세요',
  confirmLabel = '여기서 출발할게요',
  onPick,
  onClose,
}: {
  open: boolean
  /** 처음 보여줄 자리. 보통 현재 위치. 없으면 수원시청에서 시작한다 */
  center?: LatLng | null
  title?: string
  hint?: string
  confirmLabel?: string
  onPick: (place: { coords: LatLng; address: string | null }) => void
  onClose: () => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const kakaoRef = useRef<any>(null)
  const [failed, setFailed] = useState(false)
  // 지금 한가운데가 어디인지 — 확인을 누르면 이 값을 넘긴다
  const [at, setAt] = useState<LatLng>(center ?? FALLBACK)
  const [address, setAddress] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true

    loadKakaoSdk()
      .then((kakao) => {
        if (!alive || !boxRef.current) return
        kakaoRef.current = kakao
        const start = center ?? FALLBACK
        const map = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(start.latitude, start.longitude),
          level: PICK_ZOOM_LEVEL,
        })
        mapRef.current = map
        setAt(start)

        /*
         * 지도가 멈췄을 때만 주소를 묻는다.
         * 미는 동안 물으면 글자가 어지럽게 바뀌어서 어디를 고른 것인지 알 수 없다.
         */
        const onIdle = () => {
          if (!alive) return
          const c = map.getCenter()
          const here = { latitude: c.getLat(), longitude: c.getLng() }
          setAt(here)
          setLooking(true)
          addressOf(kakao, here).then((name) => {
            if (!alive) return
            setAddress(name)
            setLooking(false)
          })
        }
        kakao.maps.event.addListener(map, 'idle', onIdle)
        onIdle()
      })
      .catch(() => {
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
      mapRef.current = null
    }
    // center 는 열 때 한 번만 본다 — 열려 있는 동안 바뀌어도 보던 자리를 뺏지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const usable = hasKakaoKey && !failed

  return (
    <div className="map-picker" role="dialog" aria-modal="true" aria-label={title}>
      <div className="map-picker-head">
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>

      {usable ? (
        <div className="map-picker-stage">
          <div className="map-picker-map" ref={boxRef} />
          {/* 한가운데 못 박은 핀. 지도가 움직이지 핀이 움직이지 않는다 */}
          <div className="map-picker-pin" aria-hidden="true">
            <svg viewBox="0 0 32 44">
              <path
                d="M16 2c-6.6 0-12 5.3-12 11.9C4 23.4 16 42 16 42s12-18.6 12-28.1C28 7.3 22.6 2 16 2Z"
                fill="var(--violet)"
                stroke="#fff"
                strokeWidth="2.4"
              />
              <circle cx="16" cy="14" r="4.6" fill="#fff" />
            </svg>
          </div>
        </div>
      ) : (
        <div className="map-picker-stage map-picker-off">
          <p>
            지금은 지도를 불러오지 못했어요.
            <br />
            주소를 글자로 적어서 찾아주세요.
          </p>
        </div>
      )}

      <div className="map-picker-foot">
        <div className="map-picker-addr">
          <b>{looking ? '이곳이 어디인지 확인하고 있어요' : (address ?? '주소를 찾지 못한 자리예요')}</b>
          <span>
            {at.latitude.toFixed(5)}, {at.longitude.toFixed(5)}
          </span>
        </div>
        <button
          className="btn primary"
          disabled={!usable || looking}
          onClick={() => onPick({ coords: at, address })}
        >
          {confirmLabel}
        </button>
        <button className="btn neutral" onClick={onClose}>
          그만두기
        </button>
      </div>
    </div>
  )
}
