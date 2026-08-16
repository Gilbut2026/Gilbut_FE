import { useCallback, useEffect, useRef, useState } from 'react'
import type { FacilityItem, LatLng, RouteSegment } from '../types/dto'

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

/**
 * 지금 단계로 당겨 볼 때의 최소 배율(= 가장 가까이 가는 한계).
 *
 * 걷는 구간은 50~150m 짜리가 흔한데, 그것에 딱 맞추면 길 하나만 꽉 차서
 * 여기가 어디인지 알 수 없어진다. 주변이 조금은 보여야 방향을 잡는다.
 */
const MIN_FOCUS_LEVEL = 3

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
 * 선을 그리는 규칙 — **세 가지를 서로 다른 수단으로** 나타낸다.
 *
 *   색     = 무엇을 타는가        (2호선이면 초록 … 노선의 실제 색. 걷기는 우리 청색)
 *   모양   = 걸어가나 타고 가나   (동그란 점 = 걷기 / 실선 = 타기)
 *   진하기 = 지금 안내하는 구간인가 (진하고 굵게 + 흰 테두리 = 지금 / 흐린 회색 = 나머지)
 *
 * 처음에는 색으로 "지금 구간"을 나타냈는데, 노선색을 쓰기 시작하면서 자리를 내줬다.
 * 노선색은 사람들이 이미 아는 신호라(2호선 초록) 우리가 정한 색보다 강하다.
 * "지금"은 굵기와 흰 테두리가 충분히 나른다 — 한 신호가 한 가지만 말하게 둔다.
 *
 * ⚠️ 선 모양은 굵기와 함께 봐야 한다. 우리 선은 6~9px 로 굵은 편이라
 *    shortdash 처럼 촘촘한 무늬는 틈이 굵기에 묻혀 실선처럼 보인다(2026-08-16).
 *    카카오가 주는 값: solid · shortdash · shortdot · shortdashdot · dot ·
 *    dash · dashdot · longdash · longdashdot · longdashdotdot
 */
const SEGMENT_STYLE: Record<'walk' | 'ride', { style: string; weight: number }> = {
  // 지금 구간이 아닐 때의 모양. 지금 구간의 걷기는 아래 점(dot)들이 대신 그린다.
  walk: { style: 'shortdot', weight: 7 },
  ride: { style: 'solid', weight: 10 },
}

/**
 * 선 테두리(케이싱) 두께 — 색선 아래에 흰 선을 한 겹 더 깐다.
 *
 * 지도 배경은 밝은 회색·연노랑·초록이 뒤섞여 있어서, 색선 하나만 그으면 배경에 묻히는
 * 구간이 생긴다. 흰 테두리를 두르면 어떤 배경 위에서도 경로가 또렷하게 떠 보인다.
 * 카카오 지도도 같은 방식이다(2026-08-16 확대 스크린샷에서 확인).
 */
const CASING_EXTRA = 7

/**
 * 배율에 따른 굵기 배수 — 넓게 볼수록 가늘게.
 *
 * 굵기를 고정해두면 가까이 당겼을 때 선이 골목을 통째로 덮어버린다(250m 눈금에서
 * 너무 굵다고 확인, 2026-08-16). 실제 지도 앱은 배율마다 굵기를 다르게 그린다.
 * 카카오 level 은 작을수록 가까운 쪽이다.
 */
function widthScale(level: number): number {
  // 카카오 눈금: 1=20m · 2=30m · 3=50m · 4=100m · 5=250m · 6=500m · 7=1km
  if (level <= 1) return 1.15
  if (level === 2) return 1.05
  if (level === 3) return 0.95
  if (level === 4) return 0.84
  if (level === 5) return 0.72
  if (level === 6) return 0.62
  return 0.55
}

/**
 * 지금 단계는 청색으로 진하게, 나머지는 회색으로 옅게.
 *
 * 왜 나머지를 지우지 않는가 — 전체 길이 어떻게 생겼는지는 계속 보여야 한다.
 * 옅게 남겨두면 "여기까지 왔고 저기까지 간다"가 한눈에 읽힌다.
 * 지우면 지금 이 토막이 어디쯤인지 알 수 없어진다.
 */
const ACTIVE = { color: '#2A5BD7', opacity: 0.98, extraWeight: 3, zIndex: 4 }
const IDLE = { color: '#98A0B6', opacity: 0.55, extraWeight: 0, zIndex: 2 }

/**
 * 점과 화살표 간격 — **미터가 아니라 화면 픽셀** 기준이다.
 *
 * 미터로 잡으면 지도를 확대해도 개수가 그대로라, 화면이 넓어진 만큼 사이가 벌어져
 * 듬성해 보인다(147m 구간에 점 두 개만 찍히던 이유다). 픽셀로 잡으면 확대할수록
 * 촘촘해져서, 가까이 볼수록 길이 또렷해진다 — 실제 지도 앱이 그렇게 동작한다.
 */
const DOT_GAP_PX = 26
const ARROW_GAP_PX = 62
/** 상한 — 아주 긴 구간에서 겹침 요소가 수백 개가 되지 않게 */
const DOT_MAX = 80
const ARROW_MAX = 14

/**
 * 이 색 위에 얹는 화살표를 흰색으로 할지 검은색으로 할지.
 *
 * 노선색을 그대로 쓰면 밝은 노선(분당선 노랑 같은)이 나온다. 그 위에 흰 화살표를
 * 얹으면 아무것도 안 보인다. 밝기를 재서 잘 보이는 쪽을 고른다.
 * 사람 눈이 초록을 가장 밝게 느끼므로 채널마다 가중치가 다르다.
 */
function inkOn(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const bl = parseInt(h.slice(4, 6), 16)
  if ([r, g, bl].some(Number.isNaN)) return '#FFFFFF'
  const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255
  return lum > 0.62 ? '#1F2A44' : '#FFFFFF'
}

/** 두 점 사이 거리(m) */
function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** a 에서 b 를 바라보는 방위각(도). 북쪽이 0, 시계 방향 */
function bearingDeg(a: LatLng, b: LatLng): number {
  const rad = (x: number) => (x * Math.PI) / 180
  const deg = (x: number) => (x * 180) / Math.PI
  const p1 = rad(a.latitude)
  const p2 = rad(b.latitude)
  const dl = rad(b.longitude - a.longitude)
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/**
 * 구간 위에 무언가를 놓을 자리들 — 구간을 **거리 기준으로** 고르게 나눈다.
 *
 * 좌표 개수로 나누면 안 된다. TMAP 좌표는 굽은 곳에 몰려 있어서, 개수로 나누면
 * 커브에만 잔뜩 찍히고 긴 직선에는 하나도 안 놓인다.
 *
 * @param gapM 원하는 간격(m). 화면 픽셀 간격을 축척으로 환산해서 넘긴다.
 * @param max  상한
 */
function spotsAlong(
  points: LatLng[],
  gapM: number,
  max: number,
): { at: LatLng; deg: number }[] {
  if (points.length < 2 || gapM <= 0) return []

  const legs: { from: LatLng; to: LatLng; len: number; upto: number }[] = []
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const len = metersBetween(points[i - 1], points[i])
    legs.push({ from: points[i - 1], to: points[i], len, upto: total })
    total += len
  }
  if (total <= 0) return []

  const count = Math.max(1, Math.min(max, Math.round(total / gapM)))
  const spots: { at: LatLng; deg: number }[] = []
  for (let k = 1; k <= count; k += 1) {
    const target = (total * k) / (count + 1)
    const leg = legs.find((l) => target >= l.upto && target <= l.upto + l.len) ?? legs[legs.length - 1]
    const t = leg.len > 0 ? (target - leg.upto) / leg.len : 0
    spots.push({
      at: {
        latitude: leg.from.latitude + (leg.to.latitude - leg.from.latitude) * t,
        longitude: leg.from.longitude + (leg.to.longitude - leg.from.longitude) * t,
      },
      deg: bearingDeg(leg.from, leg.to),
    })
  }
  return spots
}

/** 선 위에 얹는 진행 방향 화살표. 흰색이라 청색 선 위에서 또렷하다 */
function arrowHtml(deg: number, lineWeight: number, ink: string): string {
  // 선 두께 안에 들어가야 한다. 선이 가늘어지면 화살표도 같이 작아진다.
  const px = Math.min(14, Math.max(7, Math.round(lineWeight * 0.85)))
  return `<div class="route-arrow" style="transform:rotate(${deg.toFixed(1)}deg);color:${ink}" aria-hidden="true"><svg viewBox="0 0 24 24" style="width:${px}px;height:${px}px"><path d="M12 3.5 19 19l-7-3.6L5 19z" fill="currentColor"/></svg></div>`
}

/** 걷는 구간의 동그란 점 하나 */
function walkDotHtml(k: number): string {
  const core = Math.max(7, Math.round(13 * k))
  const ring = Math.max(2, Math.round(3 * k))
  return `<div class="route-walk-dot" style="width:${core}px;height:${core}px;border-width:${ring}px" aria-hidden="true"></div>`
}

/**
 * 지금 보이는 지도의 축척(미터/픽셀).
 *
 * 화면 기준 간격을 미터로 바꾸는 데 쓴다. 지도의 가로 폭이 실제로 몇 미터인지를
 * 컨테이너 픽셀 폭으로 나눈다 — 확대할수록 이 값이 작아지고, 그만큼 점이 촘촘해진다.
 */
function metersPerPixel(map: any, el: HTMLElement | null): number {
  const px = el?.clientWidth ?? 0
  if (!map || px <= 0) return 0
  const b = map.getBounds()
  if (!b) return 0
  const sw = b.getSouthWest()
  const ne = b.getNorthEast()
  const widthM = metersBetween(
    { latitude: sw.getLat(), longitude: sw.getLng() },
    { latitude: sw.getLat(), longitude: ne.getLng() },
  )
  return widthM / px
}

/**
 * 정류장 표시 — 선 위의 흰 동그라미.
 *
 * 왜 넣는가 — "11정거장 가세요"는 글자로는 세기 어렵다. 지도에 동그라미가 열한 개
 * 찍혀 있으면 어디쯤 왔는지 눈으로 센다. 카카오 지도가 하는 방식이기도 하다.
 *
 * 타고 내리는 양 끝은 크게, 지나치는 곳은 작게 — 내려야 할 곳이 눈에 먼저 들어와야 한다.
 */
function stopHtml(edge: boolean, lineWeight: number, color: string): string {
  /*
   * 크기를 **지금 선 굵기에서 뽑는다.** 고정 픽셀로 두면 배율이 바뀔 때마다
   * 선보다 크거나 작아져서 따로 논다.
   *
   * 처음에는 흰 알맹이를 6px 로 두고 남색 링을 3px 줬는데, 남색 링이 남색 선에
   * 묻혀버려서 화면에는 아주 작은 흰 점만 남았다 — 그려지고도 안 보였다(2026-08-16).
   * 카카오처럼 **거의 흰색**으로, 선보다 조금 크게 둔다.
   */
  const outer = edge
    ? Math.max(14, Math.round(lineWeight * 2.1))
    : Math.max(9, Math.round(lineWeight * 1.5))
  const ring = Math.max(2, Math.round(outer * 0.17))
  const core = Math.max(4, outer - ring * 2)
  return `<div class="route-stop${edge ? ' edge' : ''}" style="width:${core}px;height:${core}px;border-width:${ring}px;border-color:${color}" aria-hidden="true"></div>`
}

/*
 * 내 위치 표시.
 * 경로선이 청색이 되면서 파란 점과 색이 겹쳐서, 초록으로 바꿨다(2026-08-16).
 * "지금 서 있는 자리"와 "가야 할 길"은 전혀 다른 것이라 색까지 갈라두는 편이 낫다.
 * 빨강은 쓰지 않는다 — 이 앱에서 빨강은 SOS 다.
 *
 * 방향을 아는 경우에만 부채꼴을 함께 그린다. **모를 때는 그리지 않는다** —
 * 북쪽을 가리키는 화살표를 그려두면 그쪽을 보고 있다는 뜻으로 읽히기 때문이다.
 * 엉뚱한 방향으로 걸어가시게 만드느니 아무 말도 안 하는 편이 낫다.
 */
function meHtml(heading: number | null): string {
  const cone =
    heading == null
      ? ''
      : `<svg class="me-cone" viewBox="0 0 48 48" style="transform:rotate(${heading.toFixed(0)}deg)"><path d="M24 24 L9.5 3.5 A24 24 0 0 1 38.5 3.5 Z"/></svg>`
  return `<div class="me-mark" aria-hidden="true">${cone}<div class="me-dot"></div></div>`
}

/**
 * 기기가 알려주는 나침반 방향(도, 북쪽 0 시계방향).
 *
 * 아이폰과 안드로이드가 서로 다른 값을 준다.
 *   · 아이폰  webkitCompassHeading — 이미 북쪽 기준 시계방향
 *   · 안드로이드 alpha — 북쪽 기준 **반**시계방향이라 뒤집어야 한다
 * 둘 다 없으면 방향을 모르는 것이다.
 */
function headingFromOrientation(e: any): number | null {
  if (typeof e?.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    return e.webkitCompassHeading
  }
  if (e?.absolute && typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
    return (360 - e.alpha) % 360
  }
  return null
}

type GeoState = 'idle' | 'ok' | 'denied' | 'unavailable'

/** 기본값도 모듈에 하나만 — 매번 새 배열을 만들면 지도를 다시 그리게 된다 */
const NO_SEGMENTS: RouteSegment[] = []
const NO_FACILITIES: FacilityItem[] = []

/**
 * 쉼터·화장실 표시 — 지도에서 기대되는 **핀** 모양으로 그린다.
 *
 * 처음에는 이모지(🪑·🚻)를 얹었는데 지도 위에서 겉돌았다. 이모지는 기기마다
 * 생김새가 달라 우리가 모양을 정할 수도 없다. 안쪽 그림은 직접 그린다.
 *
 * 경로선(청색)·정류장(흰 동그라미)·내 위치(초록 동그라미)와 갈리도록
 * **색과 모양을 함께** 다르게 뒀다 — 지도 위 네 번째 표시라 색만으로는 부족하다.
 *
 * 핀 끝이 좌표를 가리켜야 하므로 `yAnchor: 1` 로 아래를 기준점에 맞춘다.
 */
const FACILITY_GLYPH: Record<'SHELTER' | 'TOILET', string> = {
  // 벤치 — 등받이·앉는 자리·다리. 「쉬어 가는 곳」이 한눈에 읽힌다
  SHELTER:
    '<rect x="8" y="9.5" width="12" height="2.2" rx="1.1"/>' +
    '<rect x="8" y="13.6" width="12" height="2.2" rx="1.1"/>' +
    '<rect x="8.6" y="15.4" width="1.8" height="3.4" rx="0.9"/>' +
    '<rect x="17.6" y="15.4" width="1.8" height="3.4" rx="0.9"/>',
  // 남녀 표지 — 머리와 몸. 화장실 표지로 세계 어디서나 쓰는 모양이다
  TOILET:
    '<circle cx="10.6" cy="8.8" r="1.9"/>' +
    '<path d="M8.4 12.1h4.4l1 5.2h-1.5v3.1H8.9v-3.1H7.4z"/>' +
    '<circle cx="17.4" cy="8.8" r="1.9"/>' +
    '<path d="M17.4 11.6c1.9 0 2.9 1.2 3.3 3.1l.5 2.6h-1.7v3.1h-4.2v-3.1h-1.7l.5-2.6c.4-1.9 1.4-3.1 3.3-3.1z"/>',
}

function facilityHtml(item: FacilityItem): HTMLElement {
  const kind = item.type === 'SHELTER' ? 'SHELTER' : 'TOILET'
  const el = document.createElement('div')
  el.className = `route-facility ${kind === 'SHELTER' ? 'shelter' : 'toilet'}`
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', item.name)
  el.innerHTML =
    '<svg viewBox="0 0 28 36" aria-hidden="true">' +
    '<path class="pin" d="M14 .9C6.8.9 1 6.6 1 13.6c0 9 13 21.5 13 21.5s13-12.5 13-21.5C27 6.6 21.2.9 14 .9z"/>' +
    `<g class="glyph">${FACILITY_GLYPH[kind]}</g>` +
    '</svg>'
  return el
}

export function RouteMap({
  path,
  segments = NO_SEGMENTS,
  activeSegment,
  facilities = NO_FACILITIES,
  onFacilityTap,
  height,
}: {
  path: LatLng[]
  /** 걷기/타기로 나뉜 토막. 비어 있으면 전체를 한 줄로 그린다 */
  segments?: RouteSegment[]
  /** 지금 단계가 가리키는 토막. 이것만 진하게 그리고 나머지는 옅게 둔다 */
  activeSegment?: number
  /** 가는 길 주변 쉼터·화장실. 빈 배열이면 아무것도 안 찍는다 */
  facilities?: FacilityItem[]
  /** 시설을 눌렀을 때 — 이름과 운영시간을 알려주는 몫은 화면이 한다 */
  onFacilityTap?: (item: FacilityItem) => void
  /** 지도 높이. 안 주면 CSS 가 정한다(화면 크기에 따라 달라진다) */
  height?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [geo, setGeo] = useState<GeoState>('idle')
  /** 범례에 쓸 지금 구간 색. 노선마다 달라지므로 화면 상태로 들고 있는다 */
  const [legendColor, setLegendColor] = useState(ACTIVE.color)
  /** 그려둔 선들. 단계가 바뀔 때 **다시 그리지 않고** 투명도만 갈아끼운다 */
  const linesRef = useRef<{ line: any; casing: any; weight: number }[]>([])
  /*
   * 지금 강조할 토막을 ref 로도 들고 있는다.
   * 지도는 SDK 를 받아온 뒤에야 그려지는데, 그 사이 단계가 이미 정해져 있을 수 있다.
   * 이 값이 없으면 지도가 늦게 뜬 경우 첫 단계가 강조되지 않은 채 남는다.
   */
  const activeRef = useRef<number | undefined>(activeSegment)
  activeRef.current = activeSegment

  /** 토막별 지도 범위. 지금 단계로 당겨 볼 때 쓴다 */
  const segBoundsRef = useRef<any[]>([])
  /** 토막별 좌표. 화살표를 어디에 놓을지 계산할 때 쓴다 */
  const segPointsRef = useRef<LatLng[][]>([])
  /** 토막별 정류장 */
  const segStopsRef = useRef<(RouteSegment['stops'] | undefined)[]>([])
  /** 토막별 종류(걷기/타기). 점을 찍을지 화살표를 얹을지 가른다 */
  const segKindsRef = useRef<('walk' | 'ride')[]>([])
  /** 토막별 노선색 */
  const segColorsRef = useRef<(string | undefined)[]>([])
  /** 지금 얹어둔 화살표·정류장. 단계가 바뀌면 걷어내고 다시 놓는다 */
  const arrowsRef = useRef<any[]>([])
  const stopsRef = useRef<any[]>([])
  /** 지금 찍어둔 쉼터·화장실. 토글이 바뀌면 걷어내고 다시 찍는다 */
  const facilityRef = useRef<any[]>([])
  /* 지금 값을 ref 로도 들고 있는다 — 지도는 SDK 를 받은 뒤에야 그려진다 */
  const facilitiesRef = useRef<FacilityItem[]>(facilities)
  facilitiesRef.current = facilities
  const facilityTapRef = useRef(onFacilityTap)
  facilityTapRef.current = onFacilityTap
  /** 확대/이동이 멎을 때 다시 그리려고 걸어둔 리스너. 화면을 떠날 때 걷어낸다 */
  const idleRef = useRef<{ map: any; handler: () => void } | null>(null)
  /** 지금 배율에 맞는 굵기 배수. 확대·축소가 멎을 때마다 다시 잡는다 */
  const scaleRef = useRef(1)
  /** 지금 그린 강조선의 실제 굵기(px). 정류장 동그라미 크기를 여기서 뽑는다 */
  const activeWeightRef = useRef(13)
  /** 지금 구간의 실제 색. 노선색이 있으면 그것, 없으면 기본 청색 */
  const activeColorRef = useRef(ACTIVE.color)
  /** 이 지도에서 아직 한 번도 자리를 안 잡았는가. 처음 한 번은 무조건 맞춰준다 */
  const firstFocusRef = useRef(true)

  /**
   * 지금 구간에만 진행 방향 화살표를 얹는다.
   *
   * 왜 지금 구간만인가 — 전 구간에 다 찍으면 화살표가 길을 덮는다.
   * 어차피 사람이 알아야 하는 방향은 지금 가는 쪽 하나다.
   *
   * 카카오 Polyline 은 화살표를 지원하지 않아서, 선 위에 회전시킨 겹침 요소를 놓는다.
   */
  const paintArrows = useCallback(() => {
    // 먼저 지운다 — 안 지우면 단계를 넘길 때마다, 확대할 때마다 쌓인다
    arrowsRef.current.forEach((o) => o.setMap(null))
    arrowsRef.current = []

    const kakao = kakaoRef.current
    const map = mapRef.current
    const at = activeRef.current
    const points = at != null ? segPointsRef.current[at] : null
    if (!kakao || !map || !points) return

    // 화면 축척을 미터로 환산한다. 확대하면 간격이 좁아져 개수가 늘어난다.
    const mpp = metersPerPixel(map, boxRef.current)
    if (mpp <= 0) return

    const walking = segKindsRef.current[at as number] === 'walk'
    const gapPx = walking ? DOT_GAP_PX : ARROW_GAP_PX
    const max = walking ? DOT_MAX : ARROW_MAX
    const lineWeight = activeWeightRef.current

    let spots = spotsAlong(points, gapPx * mpp, max)

    /*
     * 화살표가 정류장 동그라미와 겹치지 않게 걷어낸다.
     *
     * 둘 다 선 위에 놓이다 보니 자리가 겹치면 화살표가 동그라미에 반쯤 가려서
     * 어느 쪽을 가리키는지 알 수 없게 된다. 정류장이 더 중요한 정보라 화살표를 뺀다.
     *
     * 비켜야 할 거리는 화면 기준이다 — 두 표시의 반지름을 더하고 여유를 조금 준다.
     */
    const stops = segStopsRef.current[at as number]
    if (!walking && stops?.length) {
      const clearM = (lineWeight * 1.6 + 10) * mpp
      const kept = spots.filter((sp) =>
        stops.every((st) => metersBetween(sp.at, st.at) > clearM),
      )
      // 전부 걸러졌으면 방향을 아예 못 보여주게 되므로 하나는 남긴다
      spots = kept.length ? kept : spots.slice(0, 1)
    }

    for (const spot of spots) {
      arrowsRef.current.push(
        new kakao.maps.CustomOverlay({
          map,
          position: new kakao.maps.LatLng(spot.at.latitude, spot.at.longitude),
          // 걷는 구간은 방향보다 "여기를 따라 걷는다"가 중요해서 점으로 찍는다.
          // 타는 구간은 어느 쪽으로 가는지가 중요해서 화살표를 쓴다.
          content: walking
            ? walkDotHtml(scaleRef.current)
            : arrowHtml(spot.deg, lineWeight, inkOn(activeColorRef.current)),
          zIndex: 6,
        }),
      )
    }
  }, [])

  /**
   * 가는 길 주변 쉼터·화장실을 찍는다.
   *
   * 지금 구간만이 아니라 **경로 전체**에 찍는다 — 「이 길에 쉴 곳이 있는가」는
   * 지금 어디쯤인지와 상관없이 미리 알고 싶은 정보다.
   */
  const paintFacilities = useCallback(() => {
    facilityRef.current.forEach((o) => o.setMap(null))
    facilityRef.current = []

    const kakao = kakaoRef.current
    const map = mapRef.current
    if (!kakao || !map) return

    for (const item of facilitiesRef.current) {
      const el = facilityHtml(item)
      el.addEventListener('click', () => facilityTapRef.current?.(item))
      facilityRef.current.push(
        new kakao.maps.CustomOverlay({
          map,
          position: new kakao.maps.LatLng(item.latitude, item.longitude),
          content: el,
          clickable: true,
          // 핀 끝이 좌표를 가리키게 — 가운데를 맞추면 실제보다 위쪽을 가리킨다
          yAnchor: 1,
          // 경로선·정류장보다 위 — 눌러야 하는 것이므로 가려지면 안 된다
          zIndex: 7,
        }),
      )
    }
  }, [])

  /** 지금 타는 구간의 정류장을 찍는다. 걷는 구간에는 정류장이 없다 */
  const paintStops = useCallback(() => {
    stopsRef.current.forEach((o) => o.setMap(null))
    stopsRef.current = []

    const kakao = kakaoRef.current
    const map = mapRef.current
    const at = activeRef.current
    const stops = at != null ? segStopsRef.current[at] : null
    if (!kakao || !map || !stops?.length) return

    stops.forEach((stop, i) => {
      const edge = i === 0 || i === stops.length - 1
      stopsRef.current.push(
        new kakao.maps.CustomOverlay({
          map,
          position: new kakao.maps.LatLng(stop.at.latitude, stop.at.longitude),
          content: stopHtml(edge, activeWeightRef.current, activeColorRef.current),
          // 선(4)보다 위, 화살표(6)보다 아래 — 화살표가 정류장에 가려지지 않게
          zIndex: 5,
        }),
      )
    })
  }, [])

  /**
   * 지금 단계가 보이도록 지도를 당긴다.
   *
   * 왜 필요한가 — 4km 경로 전체를 한 화면에 맞추면 축척이 약 8m/픽셀이 된다.
   * 그러면 147m 걷기는 화면에서 **8픽셀**이고, 그 자리에 42픽셀짜리 출발 핀이 서 있어서
   * 아예 보이지 않는다(2026-08-16 실측). 진하게 칠해도 소용이 없다 — 크기 문제라
   * 지도를 당기는 수밖에 없다.
   *
   * 전체가 다시 보고 싶으면 「전체 경로」 버튼이 있다.
   */
  const focusActive = useCallback(() => {
    const map = mapRef.current
    const at = activeRef.current
    const bounds = at != null ? segBoundsRef.current[at] : null
    if (!map || !bounds) return

    /*
     * 지도를 옮기는 것은 **화면을 처음 열 때 딱 한 번**이다.
     *
     * 처음에는 "화면 밖으로 나간 구간이면 옮겨준다"는 예외를 뒀는데, 그게 앞뒤로
     * 다르게 동작했다 — 걷기(짧음)에서 버스(4km)로 갈 때는 구간이 화면 밖이라 옮기고,
     * 버스에서 걷기로 돌아올 때는 이미 화면 안이라 안 옮겼다. 같은 버튼을 눌렀는데
     * 어떨 땐 지도가 튀고 어떨 땐 가만히 있으니 규칙을 알 수 없다(2026-08-16).
     *
     * 그래서 단계를 넘길 때는 지도를 건드리지 않는다. 보고 있던 자리가 유지되는 편이
     * 예측 가능하고, 전체를 다시 보고 싶으면 「전체 경로」 버튼이 있다.
     *
     * 처음 한 번은 옮긴다 — 안 그러면 147m 걷기처럼 짧은 구간이 4km 화면 어딘가에
     * 숨어서 아예 안 보인다.
     */
    if (!firstFocusRef.current) return
    firstFocusRef.current = false

    map.setBounds(bounds, 64, 40, 40, 40)
    // 너무 가까이 붙는 것은 막는다 — 짧은 구간은 딱 맞추면 주변이 사라진다
    if (map.getLevel() < MIN_FOCUS_LEVEL) map.setLevel(MIN_FOCUS_LEVEL)
  }, [])

  /** 지금 단계만 진하게. 선을 다시 그리지 않고 옵션만 바꾼다 */
  const paintActive = useCallback(() => {
    const lines = linesRef.current
    if (!lines.length) return
    /*
     * 강조할 토막이 없으면 **전부 옅게** 둔다.
     *
     * 예전에는 전부 진하게 보여줬는데, 그러면 걷는 구간이 점(우리가 찍는 것)이 아니라
     * 선무늬(shortdot)로 그려져서 앞뒤 단계와 크기·모양이 달라 보였다.
     * 강조할 것이 없다는 사실을 「전부 진하게」로 나타내면 오히려 고장처럼 읽힌다.
     */
    const noTarget = activeRef.current == null
    lines.forEach(({ line, casing, weight }, i) => {
      const k = scaleRef.current
      const on = !noTarget && i === activeRef.current
      if (!on) {
        line.setOptions({
          strokeColor: IDLE.color,
          strokeOpacity: IDLE.opacity,
          strokeWeight: Math.max(2, Math.round(weight * k)),
        })
        line.setZIndex(IDLE.zIndex)
        // 지나갈 구간까지 흰 테두리를 두르면 화면이 무거워진다. 지금 구간만 두른다.
        casing.setOptions({ strokeOpacity: 0 })
        return
      }
      /*
       * 지금 구간이 걷기면 선을 **완전히 감춘다.** 점만 남긴다.
       *
       * 처음에는 흐릿한 안내선으로 남겨뒀는데, 그 선의 점 무늬와 우리가 찍는 점이
       * 서로 어긋나 겹쳐 보였다 — 점 안에 흐린 점이 하나 더 있는 것처럼 보여서
       * 오류로 읽혔다(2026-08-16). 하나만 남기는 편이 낫다.
       * (강조할 단계가 아예 없을 때는 선을 그대로 보여준다 — 점을 안 찍기 때문이다)
       */
      const dotted = segKindsRef.current[i] === 'walk'
      const core = Math.max(3, Math.round((weight + ACTIVE.extraWeight) * k))
      /*
       * 타는 구간은 **그 노선의 실제 색**으로 그린다.
       * 2호선이면 초록, 경기 일반버스면 초록 — 사람들이 이미 아는 신호다.
       * "지금 구간"이라는 뜻은 색이 아니라 굵기·진하기·흰 테두리가 나른다.
       * 걷기는 노선이 없으니 우리 청색을 쓴다.
       */
      const segColor = (!dotted && segColorsRef.current[i]) || ACTIVE.color
      if (!dotted) {
        activeWeightRef.current = core
        activeColorRef.current = segColor
      }
      // 지금 강조 중인 구간의 색을 범례에도 그대로 쓴다
      if (i === activeRef.current) setLegendColor(segColor)
      line.setOptions({
        strokeColor: segColor,
        strokeOpacity: dotted ? 0 : ACTIVE.opacity,
        strokeWeight: core,
      })
      line.setZIndex(ACTIVE.zIndex)
      // 걷는 구간은 점마다 흰 테두리가 이미 있으므로 선 테두리는 필요 없다
      casing.setOptions({
        strokeOpacity: dotted ? 0 : 0.95,
        strokeWeight: core + Math.max(3, Math.round(CASING_EXTRA * k)),
      })
    })
  }, [])

  // 버튼 눌렀을 때 쓰려고 들고 있는 것들
  const kakaoRef = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const boundsRef = useRef<any>(null)
  /** 내 위치 표시(점 + 정확도 원). 아직 안 만들었으면 null */
  const meRef = useRef<{ dot: any; ring: any; heading: number | null } | null>(null)
  /** 지금 바라보는 방향(도). 모르면 null — 모를 때는 부채꼴을 안 그린다 */
  const headingRef = useRef<number | null>(null)
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
    const heading = headingRef.current
    if (meRef.current) {
      meRef.current.dot.setPosition(at)
      meRef.current.ring.setPosition(at)
      meRef.current.ring.setRadius(fix.accuracy)
      // 방향이 바뀐 만큼만 다시 그린다 — 나침반은 초당 수십 번 값을 준다
      if (heading !== meRef.current.heading) {
        meRef.current.heading = heading
        meRef.current.dot.setContent(meHtml(heading))
      }
      return
    }
    meRef.current = {
      heading,
      dot: new kakao.maps.CustomOverlay({ map, position: at, content: meHtml(heading), zIndex: 5 }),
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
        fillColor: '#12B886',
        fillOpacity: 0.14,
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
        segBoundsRef.current = []
        segPointsRef.current = []
        segStopsRef.current = []
        segKindsRef.current = []
        segColorsRef.current = []
        firstFocusRef.current = true
        linesRef.current = drawn.map((seg) => {
          const s = SEGMENT_STYLE[seg.kind]
          const pts = seg.points.map(toLatLng)
          // 흰 테두리를 먼저 깔고 그 위에 색선을 얹는다
          const casing = new kakao.maps.Polyline({
            map,
            path: pts,
            strokeWeight: s.weight + CASING_EXTRA,
            strokeColor: '#FFFFFF',
            strokeOpacity: 0,
            strokeStyle: 'solid',
            zIndex: 3,
          })
          const line = new kakao.maps.Polyline({
            map,
            path: pts,
            strokeWeight: s.weight,
            strokeColor: IDLE.color,
            strokeOpacity: IDLE.opacity,
            strokeStyle: s.style,
          })
          const b = new kakao.maps.LatLngBounds()
          pts.forEach((p: any) => b.extend(p))
          segBoundsRef.current.push(b)
          segPointsRef.current.push(seg.points)
          segStopsRef.current.push(seg.stops)
          segKindsRef.current.push(seg.kind)
          segColorsRef.current.push(seg.color)
          return { line, casing, weight: s.weight }
        })

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
        // 지도가 늦게 떴어도 지금 단계가 바로 보이도록. 단계가 없으면 전체 경로 그대로.
        paintActive()
        paintArrows()
        paintStops()
        paintFacilities()
        focusActive()

        /*
         * 확대·이동이 끝날 때마다 굵기와 개수를 다시 잡는다.
         *   · 굵기 — 배율마다 달라야 한다. 고정이면 가까이 볼 때 골목을 덮는다.
         *   · 개수 — 간격이 화면 픽셀 기준이라 배율이 바뀌면 개수도 바뀌어야 한다.
         * 'idle' 은 움직임이 멎은 뒤 한 번만 오므로 드래그 중에는 다시 그리지 않는다.
         */
        const redraw = () => {
          scaleRef.current = widthScale(map.getLevel())
          paintActive()
          paintArrows()
          paintStops()
        }
        redraw()
        kakao.maps.event.addListener(map, 'idle', redraw)
        idleRef.current = { map, handler: redraw }
      })
      .catch(() => {
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
      if (idleRef.current) {
        const { map, handler } = idleRef.current
        window.kakao?.maps?.event?.removeListener(map, 'idle', handler)
        idleRef.current = null
      }
      meRef.current = null
      mapRef.current = null
      linesRef.current = []
      segBoundsRef.current = []
      segPointsRef.current = []
      segStopsRef.current = []
      segKindsRef.current = []
      segColorsRef.current = []
      arrowsRef.current = []
      stopsRef.current = []
      facilityRef.current = []
    }
  }, [path, segments, paintMe, paintActive, paintArrows, paintStops, paintFacilities, focusActive])

  // 토글을 켜고 끄면 시설만 다시 찍는다 — 지도를 다시 그리지 않는다
  useEffect(() => {
    paintFacilities()
  }, [facilities, paintFacilities])

  /*
   * 단계가 바뀌면 그 토막만 진하게.
   *
   * 선을 지웠다 다시 그리지 않는다 — 매번 다시 그리면 단계를 넘길 때마다 지도가
   * 깜빡이고, 그 사이 아무것도 없는 순간이 생긴다. 이미 그려둔 선의 옵션만 바꾼다.
   */
  useEffect(() => {
    paintActive()
    paintArrows()
    paintStops()
    focusActive()
  }, [activeSegment, paintActive, paintArrows, paintStops, focusActive])

  /*
   * 나침반 — 지금 어느 쪽을 보고 있는지.
   *
   * 값이 초당 수십 번 들어오므로 **5도 이상 바뀔 때만** 다시 그린다.
   * 그냥 다 반영하면 부채꼴이 미세하게 떨려서 오히려 보기 나쁘다.
   *
   * 아이폰은 사용자가 버튼을 누르는 등 **직접 행동한 뒤에만** 나침반을 내준다.
   * 그래서 「내 위치」 버튼에서 권한을 청하고, 여기서는 구독만 해둔다.
   */
  useEffect(() => {
    const onOrient = (e: Event) => {
      const deg = headingFromOrientation(e)
      if (deg == null) return
      const prev = headingRef.current
      if (prev != null && Math.abs(((deg - prev + 540) % 360) - 180) < 5) return
      headingRef.current = deg
      paintMe()
    }
    window.addEventListener('deviceorientationabsolute', onOrient)
    window.addEventListener('deviceorientation', onOrient)
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient)
      window.removeEventListener('deviceorientation', onOrient)
    }
  }, [paintMe])

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
        /*
         * 걷는 중이면 GPS 가 주는 진행 방향이 나침반보다 정확하다.
         * 서 있을 때는 heading 이 null 이거나 엉뚱한 값이라 쓰지 않는다.
         */
        const { heading, speed } = pos.coords
        if (heading != null && !Number.isNaN(heading) && (speed ?? 0) > 0.5) {
          headingRef.current = heading
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
    // 아이폰은 직접 누른 행동 안에서만 나침반 권한을 내준다
    const DOE = (window as any).DeviceOrientationEvent
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().catch(() => {})
    }
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

      {/* 색과 모양이 각각 무엇을 뜻하는지 적는다. 지금 구간 표시는 늘 쓰므로 늘 보인다 */}
      <div className="route-map-legend">
        <span>
          <i className="now" style={{ borderTopColor: legendColor }} aria-hidden="true" />
          지금 가는 곳
        </span>
        {showLegend && (
          <>
            <span>
              <i className="ride" aria-hidden="true" />
              타고 가요
            </span>
            <span>
              <i className="walk" aria-hidden="true" />
              걸어가요
            </span>
          </>
        )}
        <span>
          <i className="me" aria-hidden="true" />내 위치
        </span>
      </div>
    </div>
  )
}
