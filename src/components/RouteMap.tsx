import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../types/dto'

/**
 * 경로 지도 — 카카오맵 위에 **TMAP 이 준 실제 경로 좌표**를 그린다.
 *
 * 좌표는 지어낸 것이 아니다. BE 가 TMAP 보행자/대중교통 경로안내에서 받아 온
 * routePoints 를 그대로 잇는다(api/directions).
 *
 * 예전에 결과 화면에 있던 지도는 하드코딩된 그림이었다. 도로도 건물도 경로선도 가짜인데
 * 「🗺️ 경로 미리보기」라고 적혀 있었다(2026-08-16 걷어냄). 그래서 이번에는 순서를 뒤집었다 —
 * **진짜 좌표가 있고, 그것을 보여줄 수 있을 때만 지도를 띄운다.**
 *
 * 키가 없거나 지도를 못 불러오면 지도 대신 그 사실을 적는다. 어르신은 화면에 그려진 것을
 * 사실로 믿기 때문에, 확실하지 않은 그림을 보여주느니 안 보여주는 편이 낫다.
 * 길 안내 자체는 지도 없이도 단계 목록으로 끝까지 굴러간다.
 *
 * 키 발급: 카카오 개발자 콘솔 → 내 애플리케이션 → 앱 키 → JavaScript 키.
 *   그리고 플랫폼 → Web → 사이트 도메인에 배포 주소와 http://localhost:5173 을 등록해야 한다.
 *   (등록하지 않은 도메인에서는 카카오가 지도를 내려주지 않는다)
 */

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined

const SDK_ID = 'kakao-maps-sdk'

declare global {
  interface Window {
    kakao?: any
  }
}

/** 카카오 지도 SDK 를 한 번만 불러온다 */
function loadKakaoSdk(): Promise<any> {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error('no-key'))
  if (window.kakao?.maps) return Promise.resolve(window.kakao)

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null
    const onReady = () => window.kakao.maps.load(() => resolve(window.kakao))

    if (existing) {
      existing.addEventListener('load', onReady)
      existing.addEventListener('error', () => reject(new Error('sdk-failed')))
      return
    }

    const script = document.createElement('script')
    script.id = SDK_ID
    script.async = true
    // autoload=false → maps.load() 로 우리가 시점을 잡는다
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`
    script.addEventListener('load', onReady)
    script.addEventListener('error', () => reject(new Error('sdk-failed')))
    document.head.appendChild(script)
  })
}

export function RouteMap({ path, height = 220 }: { path: LatLng[]; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!boxRef.current || path.length < 2) return
    let alive = true

    loadKakaoSdk()
      .then((kakao) => {
        if (!alive || !boxRef.current) return
        const points = path.map((p) => new kakao.maps.LatLng(p.latitude, p.longitude))

        const map = new kakao.maps.Map(boxRef.current, {
          center: points[Math.floor(points.length / 2)],
          level: 4,
        })

        new kakao.maps.Polyline({
          map,
          path: points,
          strokeWeight: 6,
          strokeColor: '#6755F5',
          strokeOpacity: 0.95,
          strokeStyle: 'solid',
        })

        // 출발지와 목적지를 찍는다 — 선만 있으면 어느 쪽으로 가는지 알 수 없다
        new kakao.maps.Marker({ map, position: points[0], title: '출발' })
        new kakao.maps.Marker({ map, position: points[points.length - 1], title: '도착' })

        // 경로 전체가 화면에 들어오게 맞춘다
        const bounds = new kakao.maps.LatLngBounds()
        points.forEach((p: any) => bounds.extend(p))
        map.setBounds(bounds)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
    }
  }, [path])

  // 좌표가 없으면 지도를 그릴 것도 없다
  if (path.length < 2) return null

  if (failed || !KAKAO_JS_KEY) {
    return (
      <div className="route-map empty" style={{ height }}>
        <b>지도는 준비 중이에요</b>
        <span>아래 안내대로 따라가시면 돼요.</span>
      </div>
    )
  }

  return <div className="route-map" ref={boxRef} style={{ height }} aria-label="경로 지도" />
}
