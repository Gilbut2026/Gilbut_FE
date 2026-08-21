/**
 * 「홈 화면에 추가」 안내를 누구에게 보여줄지 판별한다.
 *
 * 어르신께 "안드로이드세요, 아이폰이세요?"를 묻는 순간 절반은 거기서 멈춘다.
 * 기기는 우리가 알아내고, **해당하는 방법 하나만** 보여준다.
 *
 * 이미 앱으로 열고 계신 분에게는 아무것도 안 보여준다. 이미 한 일을 또 하라고
 * 하는 화면만큼 신뢰를 깎는 것이 없다.
 */

export type InstallPlatform =
  | 'ios-safari'
  | 'ios-other' // 아이폰인데 사파리가 아님
  | 'android'
  | 'inapp' // 카톡 등 앱 안의 브라우저 — 홈 화면에 추가가 아예 없다
  | 'desktop'

const ua = (): string => (typeof navigator === 'undefined' ? '' : navigator.userAgent)

/**
 * 이미 홈 화면에서 연 상태인가.
 *
 * 안드로이드·데스크톱은 display-mode 로 알 수 있고, 아이폰은 예전부터 쓰던
 * navigator.standalone 이 따로 있다. 둘 다 본다.
 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // 아이폰 전용 — 표준이 아니라 타입에 없다
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * 어떤 기기·브라우저인가.
 *
 * ⚠️ 아이패드는 iPadOS 13 부터 스스로를 「Macintosh」라고 말한다. 손가락이 닿는
 *    맥은 없으니 maxTouchPoints 로 가른다 — 이걸 빼면 아이패드가 데스크톱이 된다.
 *
 * ⚠️ 카톡으로 링크를 받아 그 안에서 열면 「홈 화면에 추가」 메뉴 자체가 없다.
 *    우리는 링크를 카톡으로 주고받는 팀이라 이 경우가 실제로 흔하다.
 *    그때는 먼저 브라우저로 옮기시라고 안내해야 한다.
 */
export function platform(): InstallPlatform {
  const u = ua()

  // 앱 안의 브라우저부터 걸러낸다 — 기기 종류보다 이게 먼저다
  if (/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(u)) return 'inapp'

  const iOS = /iPad|iPhone|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)
  if (iOS) {
    // 아이폰은 어떤 브라우저를 써도 속은 사파리다. 이건 엔진이 아니라 「어느 앱인가」다.
    return /CriOS|FxiOS|EdgiOS|OPT\//.test(u) ? 'ios-other' : 'ios-safari'
  }
  if (/Android/.test(u)) return 'android'
  return 'desktop'
}

/**
 * 어느 브라우저로 보고 있는가 — 사람이 읽을 수 있는 이름으로.
 *
 * 목소리를 정하는 건 결국 이쪽이다. 같은 폰, 같은 목소리 이름(ko_KR · 「한국어
 * 대한민국」)인데 크롬과 삼성인터넷 소리가 달랐다 — 브라우저마다 안드로이드 TTS 를
 * 부르는 방식이 달라서다. 목소리 이름으로는 이걸 알 수 없으니 브라우저를 적는다.
 *
 * ⚠️ 순서가 중요하다. 삼성인터넷·엣지·웨일은 UA 에 Chrome 도 같이 달고 다녀서,
 *    Chrome 을 먼저 보면 전부 크롬이 된다. 좁은 것부터 본다.
 *
 * ⚠️ 아이폰은 어떤 앱으로 열든 속이 사파리다(애플이 다른 엔진을 금지한다). 그래서
 *    「크롬」이라고만 적으면 안드로이드 크롬과 같은 것으로 오해하게 된다 — 엔진을 밝힌다.
 */
export function browserLabel(): string {
  const u = ua()
  if (/KAKAOTALK/i.test(u)) return '카카오톡 안의 브라우저'
  if (/NAVER\(inapp/i.test(u)) return '네이버 앱 안의 브라우저'
  if (/SamsungBrowser/i.test(u)) return '삼성 인터넷'
  if (/Whale/i.test(u)) return '웨일'
  if (/EdgiOS/i.test(u)) return '엣지 · 아이폰이라 속은 사파리'
  if (/CriOS/i.test(u)) return '크롬 · 아이폰이라 속은 사파리'
  if (/FxiOS/i.test(u)) return '파이어폭스 · 아이폰이라 속은 사파리'
  if (/Edg\//i.test(u)) return '엣지'
  if (/OPR\//i.test(u)) return '오페라'
  if (/Firefox\//i.test(u)) return '파이어폭스'
  if (/Chrome\//i.test(u)) return '크롬'
  if (/Safari\//i.test(u)) return '사파리'
  return '알 수 없는 브라우저'
}

/** 홈 화면 안내 카드를 닫으신 적이 있는가 */
const DISMISS_KEY = 'gilbet.installDismissed'

export function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 다시 보지 않기. localStorage 를 쓴다 —
 * 닫았는데 다음에 열 때 또 뜨면 그건 닫은 것이 아니다.
 */
export function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* 사생활 보호 모드 등 — 저장이 안 돼도 앱은 그대로 돌아간다 */
  }
}

/**
 * 홈 화면에 안내 카드를 띄울 것인가.
 *
 * 데스크톱은 뺀다. 설치해도 크게 나아지는 것이 없는데, 정작 이 앱을 데스크톱에서
 * 보는 사람은 대부분 만드는 쪽 사람들이라 매번 걸리적거리기만 한다.
 * (설정 안에는 그대로 두니 필요하면 거기서 볼 수 있다)
 */
export function shouldOfferInstall(): boolean {
  return !isInstalled() && !isDismissed() && platform() !== 'desktop'
}
