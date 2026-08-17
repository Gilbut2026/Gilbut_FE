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
 * **왜 sessionStorage 가 아니라 localStorage 인가.**
 *
 * 처음에는 sessionStorage 를 썼다. 탭이 다시 떠도 살아남고 탭을 닫으면 사라지니
 * 딱 맞아 보였다. 그런데 홈 화면에 둔 앱(TWA)은 **닫았다 열면 세션이 새로 시작한다.**
 * 브라우저에서 새로고침할 때와 달리 sessionStorage 가 통째로 비어서, 정작 앱에서는
 * 되살아나는 일이 한 번도 없었다(2026-08-17). 우리가 앱으로 시연할 것을 생각하면
 * 가장 중요한 경우에서만 안 되고 있던 셈이다.
 *
 * localStorage 로 옮기되 **시간을 함께 적어두고 오래된 것은 버린다.** 그냥 옮기기만
 * 하면 어제 가다 만 길이 오늘 앱을 열 때 튀어나온다 — 그건 되살리는 것이 아니라
 * 남의 일정을 들이미는 것이다.
 */

/**
 * 이 시간이 지난 것은 되살리지 않는다.
 *
 * 세 시간 — 「잠깐 다른 앱 보다가 돌아왔다」와 「어제 일」을 가르는 선이다.
 * 길게 잡으면 지난 일정이 튀어나오고, 짧게 잡으면 정작 필요할 때 사라진다.
 * 출발 시각이 이미 지난 경우는 App 이 따로 걷어낸다(isFuture).
 */
const MAX_AGE_MS = 3 * 60 * 60 * 1000
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
      localStorage.removeItem(KEY)
      return
    }
    localStorage.setItem(KEY, JSON.stringify({ ...j, savedAt: Date.now() }))
  } catch {
    // 저장이 안 되는 환경(사생활 보호 모드 등)이라도 앱은 그대로 굴러가야 한다
  }
}

/** 저장해둔 이동. 없거나 깨졌거나 오래됐으면 null */
export function loadJourney(): Journey | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as Journey & { savedAt?: number }
    // 오래된 것은 되살리지 않는다 — 어제 가다 만 길이 오늘 튀어나오면 안 된다
    if (!j.savedAt || Date.now() - j.savedAt > MAX_AGE_MS) return null
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
    localStorage.removeItem(KEY)
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
    // 여정과 같은 이유로 localStorage 다 — 앱을 닫았다 열면 sessionStorage 는 비어 있다
    if (STANDALONE.includes(screen)) {
      localStorage.setItem(SCREEN_KEY, JSON.stringify({ screen, savedAt: Date.now() }))
    } else {
      localStorage.removeItem(SCREEN_KEY)
    }
  } catch {
    /* 저장이 안 되는 환경이라도 앱은 그대로 굴러가야 한다 */
  }
}

/** 기억해둔 화면. 없거나 오래됐거나 이제 되살릴 수 없는 것이면 null */
export function loadScreen(): Screen | null {
  try {
    const raw = localStorage.getItem(SCREEN_KEY)
    if (!raw) return null
    const { screen, savedAt } = JSON.parse(raw) as { screen?: Screen; savedAt?: number }
    if (!screen || !savedAt || Date.now() - savedAt > MAX_AGE_MS) return null
    return STANDALONE.includes(screen) ? screen : null
  } catch {
    return null
  }
}
