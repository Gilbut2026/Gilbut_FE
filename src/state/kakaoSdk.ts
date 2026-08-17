/**
 * 카카오 지도 SDK 를 한 번만 불러온다.
 *
 * 원래 RouteMap 안에 있던 것을 꺼냈다. 지도를 쓰는 데가 두 곳이 되면서(경로 지도,
 * 「지도에서 고르기」) 각자 <script> 를 붙이면 서로 다른 주소로 두 번 부르게 된다.
 * 부르는 곳은 여기 하나로 둔다.
 *
 * **libraries=services 를 함께 부른다.**
 *   좌표를 찍으면 그 자리가 어디인지 말해줘야 한다. 「37.2757, 127.0135 로 갈까요?」는
 *   물어보나 마나다. services 를 얹으면 kakao.maps.services.Geocoder 로 좌표→주소가
 *   프론트에서 바로 된다 — 새 키도, 백엔드도, TMAP 도 필요 없다.
 *
 * 키 발급: 카카오 개발자 콘솔 → 내 애플리케이션 → 앱 키 → JavaScript 키.
 *   플랫폼 → Web → 사이트 도메인에 배포 주소와 http://localhost:5173 을 등록해야 한다.
 *   ⚠️ 제품 설정 → 카카오맵 → 활성화까지 켜져 있어야 한다. 도메인만으로는 안 된다
 *      (403 disabled OPEN_MAP_AND_LOCAL service).
 */

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined

const SDK_ID = 'kakao-maps-sdk'

declare global {
  interface Window {
    kakao?: any
  }
}

export const hasKakaoKey = Boolean(KAKAO_JS_KEY)

export function loadKakaoSdk(): Promise<any> {
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`
    script.addEventListener('load', onReady)
    script.addEventListener('error', () => reject(new Error('sdk-failed')))
    document.head.appendChild(script)
  })
}

/**
 * 좌표 → 사람이 읽는 주소. 못 알아내면 null.
 *
 * 도로명 주소를 먼저 쓴다 — 「정조로 780」이 「팔달구 남창동 6-1」보다 찾기 쉽다.
 * 도로명이 없는 곳(산길·공터)은 지번으로 내려간다. 둘 다 없으면 지어내지 않고 null 이다.
 * 그때는 화면이 「이 자리로 할게요」라고만 묻는다 — 틀린 주소보다 없는 편이 낫다.
 */
export function addressOf(kakao: any, at: { latitude: number; longitude: number }): Promise<string | null> {
  return new Promise((resolve) => {
    const geocoder = kakao.maps?.services?.Geocoder && new kakao.maps.services.Geocoder()
    if (!geocoder) return resolve(null)
    // 카카오는 (경도, 위도) 순이다 — 뒤집으면 엉뚱한 데가 나온다
    geocoder.coord2Address(at.longitude, at.latitude, (result: any[], status: string) => {
      if (status !== kakao.maps.services.Status.OK || !result?.length) return resolve(null)
      const first = result[0]
      resolve(first.road_address?.address_name ?? first.address?.address_name ?? null)
    })
  })
}
