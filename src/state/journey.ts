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
    /*
     * 길 안내는 고른 경로가 있어야 그릴 수 있다.
     * App 이 `screen === 'navigate' && guideOption` 으로 그리기 때문에, 경로 없이
     * 되살리면 **아무것도 없는 화면**이 뜬다. 그럴 바에는 안 되살리는 편이 낫다.
     */
    if (j.screen === 'navigate' && !j.guideOption) return null
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

/* ──────────────────────────────────────────────────────────
 *  값 없이 화면 이름만으로 되살아나는 화면들
 * ────────────────────────────────────────────────────────── */

/**
 * 목적지도 경로도 필요 없이, 어느 화면이었는지만 알면 그대로 다시 그려지는 것들.
 *
 * 「내 정보」를 보다가 탭이 다시 뜨면 홈으로 튕겼다(2026-08-17). 위에서 되살리는 것은
 * 「가다 만 길」뿐이라, 길과 상관없는 화면은 전부 홈행이었다. 보고 있던 것을 다시 찾아
 * 들어가야 하는데, 어르신에게는 그 자체가 큰 일이다.
 *
 * 대화(chat)는 넣지 않는다 — 화면 이름만으로는 못 되살린다. 주고받은 말은 메모리에만
 * 있고, 서버 세션도 대화 화면에 들어갈 때마다 새로 시작한다(ServerChatScreen).
 * 되살린들 「어디로 가고 싶으세요?」부터 다시라, 되살린 척만 하는 셈이다.
 */
const STANDALONE: Screen[] = ['settings', 'favorites', 'history', 'help', 'contacts']

const SCREEN_KEY = 'gilbet.screen'

/** 지금 화면이 그런 화면이면 기억하고, 아니면 지운다 */
export function saveScreen(screen: Screen): void {
  try {
    if (STANDALONE.includes(screen)) sessionStorage.setItem(SCREEN_KEY, screen)
    else sessionStorage.removeItem(SCREEN_KEY)
  } catch {
    /* 저장이 안 되는 환경이라도 앱은 그대로 굴러가야 한다 */
  }
}

/** 기억해둔 화면. 없거나 이제 되살릴 수 없는 것이면 null */
export function loadScreen(): Screen | null {
  try {
    const s = sessionStorage.getItem(SCREEN_KEY) as Screen | null
    return s && STANDALONE.includes(s) ? s : null
  } catch {
    return null
  }
}
