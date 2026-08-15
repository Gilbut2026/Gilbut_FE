import { useCallback, useEffect, useRef, useState } from 'react'
import { SignupScreen } from './screens/SignupScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { HomeAddressSheet } from './components/HomeAddressSheet'
import { SosSheet } from './components/SosSheet'
import { getHome } from './api/place'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { ContactsScreen } from './screens/ContactsScreen'
import { FavoritesScreen } from './screens/FavoritesScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { HelpScreen } from './screens/HelpScreen'
import { ChatScreen } from './screens/ChatScreen'
import { DrtScreen } from './screens/DrtScreen'
import { CallTaxiScreen } from './screens/CallTaxiScreen'
import { StairChoiceScreen } from './screens/StairChoiceScreen'
import { useSettings, updateSettings } from './state/settings'
import { HAS_MOCK, mockBadgeLabel, useMock } from './api/mode'
import { kakaoLogin, KAKAO_CALLBACK_PATH } from './api/auth'
import { getMobilityProfile } from './api/user'
import { ApiError } from './api/client'
import { isLoggedIn, onSessionExpired } from './state/auth'
import { TAB_SCREENS, type Screen } from './types/nav'
import type { DrtGuideResponse, DrtReasonCode, LatLng, StairComparison } from './types/dto'

/** 카카오 로그인 콜백(`/auth/kakao/callback?code=…`)으로 들어왔는지 최초 1회 판단 */
function initialAuthPhase(): 'idle' | 'loading' {
  return window.location.pathname.endsWith(KAKAO_CALLBACK_PATH) ? 'loading' : 'idle'
}

/**
 * 새로고침했을 때 어디서부터 시작할지 서버에 물어봐야 하는가.
 *
 * 토큰은 localStorage 에 남아 있으니 이미 로그인된 상태다. 그런데 화면은 늘 'signup'
 * 부터 시작해서, 새로고침할 때마다 온보딩 7문항을 다시 물었다.
 * 답이 서버에 저장돼 있는데도 다시 묻는 것은 그냥 고장이다 —
 * 어르신이 앱을 다시 열 때마다 설문을 하라는 뜻이 된다.
 *
 * 로그인 전이면 물어볼 것도 없으니 곧바로 시작 화면을 보여준다(깜빡임 없음).
 */
function needsBootCheck(): boolean {
  return initialAuthPhase() === 'idle' && isLoggedIn()
}

/** 하단 탭 정의 (7차 와이어프레임 bottom-nav). ⬜ 표시는 아직 이식 전 화면. */
const NAV_ITEMS: { screen: Screen; label: string; icon: JSX.Element }[] = [
  {
    screen: 'home',
    label: '홈',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 11 12 4l8 7M6 10v9h12v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    screen: 'chat',
    label: '대화',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16v11H9l-4 3v-3H4V5Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    screen: 'results',
    label: '가는 길',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 19c-1.7 0-3-1.2-3-2.8 0-1.5 1.3-2.7 3-2.7h9c1.7 0 3-1.2 3-2.8s-1.3-2.7-3-2.7H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="6.5" r="2.4" fill="currentColor" />
        <circle cx="18" cy="17.5" r="2.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    screen: 'settings',
    label: '내 정보',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="2" />
        <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('signup')
  const [destination, setDestination] = useState<string | null>(null)
  // 대화에서 고른 출발 시각('YYYY-MM-DDTHH:mm:ss'). 결과 화면이 이 시각 기준으로 경로를 조회한다.
  // 시간대에 따라 대중교통 후보가 달라지므로, 대화의 선택이 결과에 그대로 반영돼야 한다.
  const [departure, setDeparture] = useState<string | null>(null)
  // 대화에서 사용자가 "이 장소가 맞나요?"로 확인한 목적지 좌표.
  // 이름으로 다시 검색하면 1순위가 달라져 확인한 곳과 다른 데로 안내될 수 있어 좌표째 넘긴다.
  const [destCoords, setDestCoords] = useState<LatLng | null>(null)
  // 똑버스 안내 화면에 넘길 실데이터 (권역명·대표번호·추천 이유)
  const [drtInfo, setDrtInfo] = useState<{
    guide: DrtGuideResponse | null
    reasons: DrtReasonCode[]
  } | null>(null)
  const [chatPrefill, setChatPrefill] = useState<string | null>(null)
  // 계단 있는 길 ↔ 없는 길 선택. 한 번 고르면 그 이동에서는 다시 묻지 않는다(7/31 회의)
  const [stairChoice, setStairChoice] = useState<'with' | 'none' | null>(null)
  const [stairComparison, setStairComparison] = useState<StairComparison | null>(null)
  const settings = useSettings()
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  // 온보딩 직후 집 주소가 없으면 등록을 권유하는 프롬프트 (7차 와이어프레임)
  const [homePrompt, setHomePrompt] = useState(false)
  const [sosOpen, setSosOpen] = useState(false)
  const toastTimer = useRef<number | null>(null)
  // 카카오 로그인 리다이렉트로 돌아왔을 때의 처리 단계
  const [authPhase, setAuthPhase] = useState<'idle' | 'loading' | 'error'>(initialAuthPhase)
  // 콜백 코드 교환은 딱 한 번만. StrictMode 가 dev 에서 effect 를 두 번 돌려도 두 번째는 건너뛴다
  // (그러지 않으면 인가 코드가 두 번 소비되거나, 주소가 이미 비어 실패로 표시된다).
  const authHandled = useRef(false)
  // 새로고침 복구 중 — 온보딩을 이미 했는지 서버에 확인하는 동안
  const [booting, setBooting] = useState(needsBootCheck)

  /*
   * 새로고침 복구 — 이미 로그인돼 있으면 온보딩을 마쳤는지 확인하고 알맞은 화면에서 시작한다.
   *
   * 판단 근거는 이동특성(온보딩 답) 이 서버에 있는가다. 백엔드는 온보딩을 저장할 때만
   * 프로필을 만들고, 없으면 404 를 준다(MOBILITY_PROFILE_NOT_FOUND). 그래서
   * "404 = 아직 온보딩 안 함" 이 정확한 신호다.
   *
   * 404 가 아닌 실패(서버가 잠깐 죽었다, 인터넷이 끊겼다)에는 홈으로 보낸다.
   * 확실하지 않을 때 온보딩으로 보내면, 이미 답한 어르신에게 설문을 다시 시키게 된다.
   * 잘못 홈으로 보내는 쪽이 덜 나쁘다 — 설정에서 언제든 다시 할 수 있다.
   *
   * 401 은 건드리지 않는다. 토큰 재발급까지 실패한 경우라 onSessionExpired 가 이미
   * 시작 화면으로 되돌려놨다. 여기서 또 화면을 정하면 그걸 덮어써버린다.
   */
  useEffect(() => {
    if (!booting) return
    // Mock 은 저장되는 곳이 없다. 이동특성을 물으면 늘 있다고 답해서, 그대로 두면
    // 온보딩을 건너뛰어 Mock 시연이 통째로 막힌다. 복구할 것도 없으니 그냥 온보딩부터.
    if (useMock('user')) {
      setScreen('onboarding')
      setBooting(false)
      return
    }
    let alive = true
    // 화면 결정과 복구 종료를 같은 콜백에서 함께 처리한다.
    // 따로 하면(.finally) 렌더가 두 번 나뉘어 홈이 탭바 없이 한 번 깜빡인다.
    const settle = (next: Screen | null) => {
      if (!alive) return
      if (next) setScreen(next)
      setBooting(false)
    }
    getMobilityProfile()
      .then(() => settle('home'))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return settle(null)
        settle(e instanceof ApiError && e.status === 404 ? 'onboarding' : 'home')
      })
    return () => {
      alive = false
    }
  }, [booting])

  // 카카오 인가 코드(?code=…)를 받아 토큰으로 교환한다. 최초 1회만.
  useEffect(() => {
    if (authPhase !== 'loading' || authHandled.current) return
    authHandled.current = true
    const code = new URLSearchParams(window.location.search).get('code')
    // 주소는 즉시 깔끔하게 되돌린다(뒤로가기/새로고침 때 코드 재사용 방지)
    window.history.replaceState({}, '', import.meta.env.BASE_URL)
    if (!code) {
      setAuthPhase('error')
      return
    }
    kakaoLogin(code)
      .then(() => {
        setAuthPhase('idle')
        // 처음 온 사람인지 다시 온 사람인지는 위 복구 절차가 판단한다.
        // 무조건 온보딩으로 보내면, 다시 로그인한 사람에게 설문을 또 시키게 된다.
        setBooting(true)
      })
      .catch(() => setAuthPhase('error'))
  }, [authPhase])

  // 토큰이 만료되고 재발급도 실패하면 로그인 화면으로 되돌린다.
  // 화면마다 제각기 실패해서 사용자가 원인을 못 알아채는 것이 가장 나쁘다.
  useEffect(
    () =>
      onSessionExpired(() => {
        setScreen('signup')
        setDestination(null)
        setDestCoords(null)
        setDeparture(null)
        setToastMsg('로그인이 만료됐어요. 다시 로그인해 주세요.')
      }),
    [],
  )

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2200)
  }, [])

  const onSos = useCallback(() => setSosOpen(true), [])

  const onNeedStairChoice = useCallback((comparison: StairComparison) => {
    setStairComparison(comparison)
    setScreen('stairs')
  }, [])

  const showTabBar = TAB_SCREENS.includes(screen) && authPhase === 'idle' && !booting

  return (
    <div id="app-shell" className={`font-${settings.fontSize}${settings.highContrast ? ' high-contrast' : ''}`}>
      {/* 통합 중에 어느 도메인이 실서버로 도는지 눈으로 보이게 한다 */}
      {HAS_MOCK && <div className="mock-badge">{mockBadgeLabel()}</div>}

      {/* 카카오 로그인 리다이렉트로 돌아온 동안 보여주는 화면 */}
      {authPhase === 'loading' && (
        <section className="screen">
          <div className="screen-body signup-body">
            <h1 className="signup-title">로그인 중이에요…</h1>
            <p className="signup-lead">잠시만 기다려 주세요.</p>
          </div>
        </section>
      )}

      {authPhase === 'error' && (
        <section className="screen">
          <div className="screen-body signup-body">
            <h1 className="signup-title">로그인에 실패했어요</h1>
            <p className="signup-lead">다시 시도해 주세요.</p>
            <button className="kakao-btn" onClick={() => setAuthPhase('idle')}>
              처음으로
            </button>
          </div>
        </section>
      )}

      {/* 새로고침 복구 중 — 온보딩을 이미 했는지 확인하는 아주 짧은 동안 */}
      {booting && (
        <section className="screen">
          <div className="screen-body signup-body">
            <h1 className="signup-title">준비하고 있어요…</h1>
            <p className="signup-lead">잠시만 기다려 주세요.</p>
          </div>
        </section>
      )}

      {!booting && authPhase === 'idle' && screen === 'signup' && (
        <SignupScreen onSignedIn={() => setBooting(true)} />
      )}

      {screen === 'onboarding' && (
        <OnboardingScreen
          onSos={onSos}
          onComplete={(voiceEnabled) => {
            updateSettings({ voiceGuide: voiceEnabled })
            setScreen('home')
            toast('내게 맞는 이동 설정을 저장했어요')
            // 집 주소 미등록이면 홈 진입 후 등록을 권유한다 (7차 와이어프레임 #screen-home)
            // 조회 실패 시에도 권유는 띄운다(사용자가 '나중에'로 닫을 수 있음).
            getHome()
              .then((h) => {
                if (!h) window.setTimeout(() => setHomePrompt(true), 900)
              })
              .catch(() => window.setTimeout(() => setHomePrompt(true), 900))
          }}
        />
      )}

      {screen === 'home' && (
        <HomeScreen
          onMic={(utterance) => {
            // 홈에서 들은 말을 대화의 첫 발화로 이어받는다 (못 들었으면 처음부터 물어본다)
            setChatPrefill(utterance ?? null)
            setScreen('chat')
          }}
          onPlace={(dest) => {
            setChatPrefill(dest)
            setScreen('chat')
          }}
          onSos={onSos}
          onToast={toast}
        />
      )}

      {screen === 'chat' && (
        <ChatScreen
          prefill={chatPrefill}
          onBack={() => setScreen('home')}
          onSos={onSos}
          onToast={toast}
          onDone={(dest, departureDateTime, coords) => {
            setDestination(dest)
            setDeparture(departureDateTime)
            setDestCoords(coords ?? null)
            // 새 이동이므로 지난번 계단 선택은 초기화한다 (갈 때와 올 때가 다를 수 있음)
            setStairChoice(null)
            setScreen('results')
          }}
        />
      )}

      {screen === 'results' && (
        <ResultsScreen
          destination={destination}
          departureDateTime={departure}
          destinationCoords={destCoords}
          stairChoice={stairChoice}
          onNeedStairChoice={onNeedStairChoice}
          onGoHome={() => setScreen('home')}
          onRestartChat={() => {
            setChatPrefill(null)
            setScreen('chat')
          }}
          onSos={onSos}
          onGuide={(guide, result) => {
            // 똑버스 안내 화면이 실제 권역·번호를 쓰도록 결과에서 받아 넘긴다
            setDrtInfo({ guide: result.drtGuide ?? null, reasons: result.drtReasons ?? [] })
            if (guide === 'drt') setScreen('drt')
            else if (guide === 'calltaxi') setScreen('calltaxi')
            else toast('길 안내 화면은 곧 준비할게요')
          }}
        />
      )}

      {screen === 'stairs' && stairComparison && (
        <StairChoiceScreen
          comparison={stairComparison}
          onPick={(pick) => {
            setStairChoice(pick)
            setScreen('results')
            toast(pick === 'with' ? '계단이 있는 길로 안내할게요' : '계단 없는 길로 안내할게요')
          }}
          onBack={() => setScreen('chat')}
          onSos={onSos}
          onToast={toast}
        />
      )}

      {screen === 'drt' && (
        <DrtScreen
          destination={destination}
          drtGuide={drtInfo?.guide ?? null}
          reasons={drtInfo?.reasons ?? []}
          onBack={() => setScreen('results')}
          onSos={onSos}
          onToast={toast}
        />
      )}

      {screen === 'calltaxi' && (
        <CallTaxiScreen
          destination={destination}
          onBack={() => setScreen('results')}
          onSos={onSos}
          onToast={toast}
          onOpenContacts={() => setScreen('contacts')}
        />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          settings={settings}
          onChange={updateSettings}
          onBack={() => setScreen('home')}
          onSos={onSos}
          onToast={toast}
          onEditProfile={() => setScreen('onboarding')}
          onOpenContacts={() => setScreen('contacts')}
          onOpenFavorites={() => setScreen('favorites')}
          onOpenHistory={() => setScreen('history')}
          onOpenHelp={() => setScreen('help')}
        />
      )}

      {screen === 'history' && (
        <HistoryScreen
          onBack={() => setScreen('settings')}
          onSos={onSos}
          onPick={(dest) => {
            setDestination(dest)
            // 대화를 거치지 않고 바로 보는 경로다 — 지난 대화의 출발 시각·목적지 좌표가 남으면 안 된다
            setDeparture(null)
            setDestCoords(null)
            setStairChoice(null)
            setScreen('results')
          }}
        />
      )}

      {screen === 'help' && <HelpScreen onBack={() => setScreen('settings')} onSos={onSos} onToast={toast} />}

      {screen === 'contacts' && (
        <ContactsScreen onBack={() => setScreen('settings')} onSos={onSos} onToast={toast} />
      )}

      {screen === 'favorites' && (
        <FavoritesScreen
          onBack={() => setScreen('settings')}
          onSos={onSos}
          onToast={toast}
          onPick={(dest) => {
            setDestination(dest)
            // 위와 같은 이유 — 즐겨찾기에서 바로 오면 지금 기준으로 새로 조회한다
            setDeparture(null)
            setDestCoords(null)
            setStairChoice(null)
            setScreen('results')
          }}
        />
      )}

      {showTabBar && (
        <nav className="bottom-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.screen}
              className={`nav-item${screen === item.screen ? ' on' : ''}`}
              onClick={() => {
                if (item.screen === 'chat') setChatPrefill(null)
                setScreen(item.screen)
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <HomeAddressSheet
        open={homePrompt}
        mode="prompt"
        onClose={() => setHomePrompt(false)}
        onToast={toast}
      />

      <SosSheet open={sosOpen} onClose={() => setSosOpen(false)} onToast={toast} />

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  )
}
