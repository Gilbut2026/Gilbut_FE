import { useEffect, useRef, useState } from 'react'
import type { LatLng, RouteSegment } from '../types/dto'

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

/**
 * 구간 색 — 걷기와 타기를 다르게 그린다.
 *
 * 색만으로 구분하지 않고 **점선/실선**도 함께 바꾼다. 색을 구별하기 어려운 분이
 * 적지 않고(어르신은 더 그렇다), 지도 위에서는 특히 헷갈리기 때문이다.
 *   걷기 — 회색 점선. 내 발로 가는 구간
 *   타기 — 보라 실선. 차가 데려다주는 구간
 */
const SEGMENT_STYLE: Record<'walk' | 'ride', { color: string; style: string; weight: number }> = {
  walk: { color: '#6B7391', style: 'shortdash', weight: 6 },
  ride: { color: '#6755F5', style: 'solid', weight: 8 },
}

export function RouteMap({
  path,
  segments = [],
  height,
}: {
  path: LatLng[]
  /** 걷기/타기로 나뉜 토막. 비어 있으면 전체를 한 줄로 그린다 */
  segments?: RouteSegment[]
  /** 지도 높이. 안 주면 CSS 가 정한다(화면 크기에 따라 달라진다) */
  height?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!boxRef.current || path.length < 2) return
    let alive = true

    loadKakaoSdk()
      .then((kakao) => {
        if (!alive || !boxRef.current) return
        const toLatLng = (p: LatLng) => new kakao.maps.LatLng(p.latitude, p.longitude)
        const points = path.map(toLatLng)

        const map = new kakao.maps.Map(boxRef.current, {
          center: points[Math.floor(points.length / 2)],
          level: 4,
        })

        // 토막이 있으면 토막별로, 없으면 전체를 타는 구간처럼 한 줄로 그린다
        const drawn = segments.length
          ? segments
          : [{ kind: 'ride' as const, points: path }]
        for (const seg of drawn) {
          if (seg.points.length < 2) continue
          const s = SEGMENT_STYLE[seg.kind]
          new kakao.maps.Polyline({
            map,
            path: seg.points.map(toLatLng),
            strokeWeight: s.weight,
            strokeColor: s.color,
            strokeOpacity: 0.95,
            strokeStyle: s.style,
          })
        }

        // 출발지와 목적지를 찍는다 — 선만 있으면 어느 쪽으로 가는지 알 수 없다
        new kakao.maps.Marker({ map, position: points[0], title: '출발' })
        new kakao.maps.Marker({ map, position: points[points.length - 1], title: '도착' })

        /*
         * 경로 전체가 화면에 들어오게 맞춘다.
         * 여백을 주는 이유 — 딱 맞추면 끝점이 화면 가장자리에 붙어서, 위로 솟은
         * 도착 핀이 잘려 보이지 않는다(2026-08-16 스크린샷). 위쪽을 더 띄운다.
         */
        const bounds = new kakao.maps.LatLngBounds()
        points.forEach((p: any) => bounds.extend(p))
        map.setBounds(bounds, 56, 28, 28, 28)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
    }
  }, [path, segments])

  // 좌표가 없으면 지도를 그릴 것도 없다
  if (path.length < 2) return null

  const style = height ? { height } : undefined

  if (failed || !KAKAO_JS_KEY) {
    return (
      <div className="route-map empty" style={style}>
        <b>지도는 준비 중이에요</b>
        <span>아래 안내대로 따라가시면 돼요.</span>
      </div>
    )
  }

  // 걷기와 타기가 **둘 다 있을 때만** 범례를 낸다. 한 종류뿐이면 설명할 것이 없다.
  const kinds = new Set(segments.map((s) => s.kind))
  const showLegend = kinds.size > 1

  return (
    <div className="route-map-wrap">
      <div className="route-map" ref={boxRef} style={style} aria-label="경로 지도" />
      {showLegend && (
        <div className="route-map-legend">
          <span>
            <i className="ride" aria-hidden="true" />
            타고 가요
          </span>
          <span>
            <i className="walk" aria-hidden="true" />
            걸어가요
          </span>
        </div>
      )}
    </div>
  )
}
