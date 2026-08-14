import { useCallback, useEffect, useRef, useState } from 'react'
import { SignupScreen } from './screens/SignupScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { HomeAddressSheet } from './components/HomeAddressSheet'
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
import { HAS_MOCK, mockBadgeLabel } from './api/mode'
import { kakaoLogin, KAKAO_CALLBACK_PATH } from './api/auth'
import { TAB_SCREENS, type Screen } from './types/nav'
import type { StairComparison } from './types/dto'

/** 카카오 로그인 콜백(`/auth/kakao/callback?code=…`)으로 들어왔는지 최초 1회 판단 */
function initialAuthPhase(): 'idle' | 'loading' {
  return window.location.pathname.endsWith(KAKAO_CALLBACK_PATH) ? 'loading' : 'idle'
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
  const [chatPrefill, setChatPrefill] = useState<string | null>(null)
  // 계단 있는 길 ↔ 없는 길 선택. 한 번 고르면 그 이동에서는 다시 묻지 않는다(7/31 회의)
  const [stairChoice, setStairChoice] = useState<'with' | 'none' | null>(null)
  const [stairComparison, setStairComparison] = useState<StairComparison | null>(null)
  const settings = useSettings()
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  // 온보딩 직후 집 주소가 없으면 등록을 권유하는 프롬프트 (7차 와이어프레임)
  const [homePrompt, setHomePrompt] = useState(false)
  const toastTimer = useRef<number | null>(null)
  // 카카오 로그인 리다이렉트로 돌아왔을 때의 처리 단계
  const [authPhase, setAuthPhase] = useState<'idle' | 'loading' | 'error'>(initialAuthPhase)
  // 콜백 코드 교환은 딱 한 번만. StrictMode 가 dev 에서 effect 를 두 번 돌려도 두 번째는 건너뛴다
  // (그러지 않으면 인가 코드가 두 번 소비되거나, 주소가 이미 비어 실패로 표시된다).
  const authHandled = useRef(false)


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
        setScreen('onboarding')
      })
      .catch(() => setAuthPhase('error'))
  }, [authPhase])

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2200)
  }, [])

  const onSos = useCallback(() => toast('SOS 화면은 곧 준비할게요'), [toast])

  const onNeedStairChoice = useCallback((comparison: StairComparison) => {
    setStairComparison(comparison)
    setScreen('stairs')
  }, [])

  const showTabBar = TAB_SCREENS.includes(screen) && authPhase === 'idle'

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

      {authPhase === 'idle' && screen === 'signup' && (
        <SignupScreen onSignedIn={() => setScreen('onboarding')} />
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
          onMic={() => {
            setChatPrefill(null)
            setScreen('chat')
          }}
          onPlace={(dest) => {
            setChatPrefill(dest)
            setScreen('chat')
          }}
          onSos={onSos}
        />
      )}

      {screen === 'chat' && (
        <ChatScreen
          prefill={chatPrefill}
          onBack={() => setScreen('home')}
          onSos={onSos}
          onToast={toast}
          onDone={(dest) => {
            setDestination(dest)
            // 새 이동이므로 지난번 계단 선택은 초기화한다 (갈 때와 올 때가 다를 수 있음)
            setStairChoice(null)
            setScreen('results')
          }}
        />
      )}

      {screen === 'results' && (
        <ResultsScreen
          destination={destination}
          stairChoice={stairChoice}
          onNeedStairChoice={onNeedStairChoice}
          onGoHome={() => setScreen('home')}
          onRestartChat={() => {
            setChatPrefill(null)
            setScreen('chat')
          }}
          onSos={onSos}
          onGuide={(guide) => {
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
        <DrtScreen destination={destination} onBack={() => setScreen('results')} onSos={onSos} onToast={toast} />
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

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  )
}
