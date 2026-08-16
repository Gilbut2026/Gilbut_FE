import { useCallback, useEffect, useRef, useState } from 'react'
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
 *   ⚠️ 그리고 **제품 설정 → 카카오맵 → 활성화**까지 켜져 있어야 한다. 도메인만으로는 안 된다
 *      (403 disabled OPEN_MAP_AND_LOCAL service). 무료 쿼터는 계정의 첫 활성화 앱에만 준다.
 */

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined

const SDK_ID = 'kakao-maps-sdk'

/** 「내 위치로」를 눌렀을 때 당겨 보는 배율. 작을수록 가깝다 */
const ME_ZOOM_LEVEL = 3

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

/** 내 위치 점. 경로선(보라)과 헷갈리지 않게 파란색으로 둔다 */
const ME_DOT_HTML = '<div class="me-dot" aria-hidden="true"></div>'

type GeoState = 'idle' | 'ok' | 'denied' | 'unavailable'

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
  const [geo, setGeo] = useState<GeoState>('idle')

  // 버튼 눌렀을 때 쓰려고 들고 있는 것들
  const kakaoRef = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const boundsRef = useRef<any>(null)
  /** 내 위치 표시(점 + 정확도 원). 아직 안 만들었으면 null */
  const meRef = useRef<{ dot: any; ring: any } | null>(null)
  /** 마지막으로 받은 좌표. 지도가 늦게 뜨는 경우를 위해 들고 있는다 */
  const lastFixRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null)

  /**
   * 내 위치를 지도에 찍는다(이미 있으면 옮긴다).
   *
   * 좌표와 지도는 서로 다른 속도로 준비된다 — GPS 가 먼저 올 때도, 지도가 먼저 뜰 때도 있다.
   * 그래서 양쪽에서 이 함수를 부르고, 여기서 둘 다 준비됐는지 확인한다.
   */
  const paintMe = useCallback(() => {
    const kakao = kakaoRef.current
    const map = mapRef.current
    const fix = lastFixRef.current
    if (!kakao || !map || !fix) return

    const at = new kakao.maps.LatLng(fix.lat, fix.lng)
    if (meRef.current) {
      meRef.current.dot.setPosition(at)
      meRef.current.ring.setPosition(at)
      meRef.current.ring.setRadius(fix.accuracy)
      return
    }
    meRef.current = {
      dot: new kakao.maps.CustomOverlay({ map, position: at, content: ME_DOT_HTML, zIndex: 5 }),
      /*
       * 정확도 원 — GPS 가 말해준 오차 반경을 그대로 그린다.
       * 점 하나만 찍으면 "여기 정확히 서 있다"로 읽히는데, 건물 안이면 백 미터씩 틀린다.
       * 얼마나 확실한지를 함께 보여주는 편이 정직하다.
       */
      ring: new kakao.maps.Circle({
        map,
        center: at,
        radius: fix.accuracy,
        strokeWeight: 0,
        fillColor: '#2F7BF6',
        fillOpacity: 0.12,
      }),
    }
  }, [])

  // ── 지도 그리기 ─────────────────────────────────
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
        const drawn = segments.length ? segments : [{ kind: 'ride' as const, points: path }]
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

        kakaoRef.current = kakao
        mapRef.current = map
        boundsRef.current = bounds
        // GPS 가 지도보다 먼저 도착했을 수 있다
        paintMe()
      })
      .catch(() => {
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
      meRef.current = null
      mapRef.current = null
    }
  }, [path, segments, paintMe])

  // ── 내 위치 따라가기 ────────────────────────────
  /*
   * watchPosition 을 쓰는 이유 — 길 안내는 걸어가면서 보는 화면이다.
   * 한 번만 받아오면 출발할 때 자리에 점이 멈춰 있어서, 얼마나 왔는지 알 수 없다.
   * 화면을 벗어나면 clearWatch 로 끈다(배터리).
   */
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeo('unavailable')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        lastFixRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 30,
        }
        setGeo('ok')
        paintMe()
      },
      () => setGeo('denied'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [paintMe])

  /** 내 위치를 가운데로 당겨 본다 */
  const goToMe = useCallback(() => {
    const kakao = kakaoRef.current
    const map = mapRef.current
    const fix = lastFixRef.current
    if (!kakao || !map || !fix) return
    const at = new kakao.maps.LatLng(fix.lat, fix.lng)
    // 배율을 먼저 당기고 나서 옮긴다 — 반대로 하면 옮긴 뒤 확대되면서 두 번 움직여 보인다
    map.setLevel(ME_ZOOM_LEVEL, { animate: true })
    map.panTo(at)
  }, [])

  /** 다시 경로 전체가 보이게 */
  const goToRoute = useCallback(() => {
    const map = mapRef.current
    const bounds = boundsRef.current
    if (!map || !bounds) return
    map.setBounds(bounds, 56, 28, 28, 28)
  }, [])

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
      <div className="route-map-box">
        <div className="route-map" ref={boxRef} style={style} aria-label="경로 지도" />
        <div className="route-map-tools">
          <button
            type="button"
            className="map-btn"
            onClick={goToMe}
            // 아직 위치를 못 받았으면 눌러도 할 일이 없다 — 눌리는 척하지 않는다
            disabled={geo !== 'ok'}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3.4" fill="currentColor" />
              <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.9" />
              <path
                d="M12 1.8v3.2M12 19v3.2M22.2 12H19M5 12H1.8"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
            내 위치
          </button>
          <button type="button" className="map-btn" onClick={goToRoute}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 19c0-3 2-4.3 4.8-4.7C12.6 13.9 15 12.6 15 9.6S12.6 5.3 9.8 5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
              <circle cx="5" cy="19" r="2" fill="currentColor" />
              <circle cx="17.5" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.9" />
            </svg>
            전체 경로
          </button>
        </div>
      </div>

      {/* 왜 내 위치가 안 뜨는지 알려준다. 아무 말 없이 버튼만 꺼져 있으면 고장으로 보인다 */}
      {geo === 'denied' && (
        <p className="route-map-note">
          위치 사용을 허용하면 지금 계신 곳을 지도에 보여드려요. 허용하지 않아도 길 안내는 그대로
          보실 수 있어요.
        </p>
      )}
      {geo === 'unavailable' && (
        <p className="route-map-note">이 기기에서는 현재 위치를 확인할 수 없어요.</p>
      )}

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
          <span>
            <i className="me" aria-hidden="true" />내 위치
          </span>
        </div>
      )}
    </div>
  )
}
