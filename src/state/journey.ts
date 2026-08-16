/**
 * 진행 중이던 이동을 저장했다 되살린다.
 *
 * 왜 필요한가 — 휴대폰에서는 브라우저를 잠깐만 벗어나도 탭이 통째로 다시 뜬다.
 * 다크모드를 바꾸러 설정에 다녀오는 것만으로도 그렇다(2026-08-16 확인).
 * 그때 화면 상태가 전부 메모리에만 있으면 **처음 화면으로 돌아가고, 방금 한 대화가
 * 통째로 날아간다.** 목적지를 다시 말하고 시각을 다시 고르라는 뜻이라 치명적이다.
 *
 * 무엇을 되살리나 — 대화가 끝난 뒤의 화면들만이다(결과·길 안내·똑버스·콜택시).
 *   · 이 화면들은 「목적지·출발지·시각」이라는 값 몇 개만 있으면 그대로 다시 그려진다
 *   · 반대로 대화 중간은 되살리지 않는다. 대화 상태는 서버가 들고 있어서,
 *     화면만 되살리면 서버와 어긋나 오히려 꼬인다(그때는 서버가 409 로 되돌린다)
 *
 * sessionStorage 를 쓰는 이유 — 탭이 다시 떠도 살아남지만, 탭을 닫으면 사라진다.
 * localStorage 였다면 어제 가다 만 길이 오늘 앱을 열 때 튀어나온다.
 */
import type { LatLng, RouteOption, DrtGuideResponse, DrtReasonCode } from '../types/dto'
import type { ChatOutcome, Screen } from '../types/nav'

const KEY = 'gilbet.journey'

/** 되살릴 수 있는 화면 — 대화가 끝나고 값이 다 정해진 뒤의 것들 */
const RESUMABLE: Screen[] = ['results', 'navigate', 'drt', 'calltaxi']

export interface Journey {
  screen: Screen
  destination: string | null
  destCoords: LatLng | null
  departure: string | null
  origin: ChatOutcome['origin']
  guideOption: RouteOption | null
  drtInfo: { guide: DrtGuideResponse | null; reasons: DrtReasonCode[] } | null
  stairChoice: 'with' | 'none' | null
}

/**
 * 지금 상태를 저장한다. 되살릴 수 없는 화면이면 지운다 —
 * 홈으로 돌아왔는데 예전 길이 남아 있으면 다음 번에 엉뚱하게 되살아난다.
 */
export function saveJourney(j: Journey): void {
  try {
    if (!RESUMABLE.includes(j.screen) || !j.destination) {
      sessionStorage.removeItem(KEY)
      return
    }
    sessionStorage.setItem(KEY, JSON.stringify(j))
  } catch {
    // 저장이 안 되는 환경(사생활 보호 모드 등)이라도 앱은 그대로 굴러가야 한다
  }
}

/** 저장해둔 이동. 없거나 깨졌으면 null */
export function loadJourney(): Journey | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as Journey
    // 저장 형식이 바뀐 뒤 남은 옛 값에 걸려 화면이 죽지 않게 최소한만 확인한다
    if (!j || !RESUMABLE.includes(j.screen) || !j.destination) return null
    return j
  } catch {
    return null
  }
}

export function clearJourney(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}
