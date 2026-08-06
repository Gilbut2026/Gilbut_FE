import { useCallback, useEffect, useRef, useState } from 'react'
import { SignupScreen } from './screens/SignupScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
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
import { loadSettings, saveSettings, type Settings } from './state/settings'
import { HAS_MOCK, mockBadgeLabel } from './api/mode'
import { TAB_SCREENS, type Screen } from './types/nav'
import type { StairComparison } from './types/dto'

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
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

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

  const showTabBar = TAB_SCREENS.includes(screen)

  return (
    <div id="app-shell" className={`font-${settings.fontSize}${settings.highContrast ? ' high-contrast' : ''}`}>
      {/* 통합 중에 어느 도메인이 실서버로 도는지 눈으로 보이게 한다 */}
      {HAS_MOCK && <div className="mock-badge">{mockBadgeLabel()}</div>}

      {screen === 'signup' && <SignupScreen onSignedIn={() => setScreen('onboarding')} />}

      {screen === 'onboarding' && (
        <OnboardingScreen
          onSos={onSos}
          onComplete={(voiceEnabled) => {
            setSettings((s) => ({ ...s, voiceGuide: voiceEnabled }))
            setScreen('home')
            toast('내게 맞는 이동 설정을 저장했어요')
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
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
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

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  )
}
