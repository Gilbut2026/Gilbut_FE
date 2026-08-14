import type { ReactNode } from 'react'
import { useSettings, updateSettings } from '../state/settings'
import { stopSpeaking } from '../state/tts'

/**
 * 공용 상단바 — 12개 화면에 복붙돼 있던 <header className="topbar"> 를 하나로 통일했다.
 * 뒤로가기(선택) · 제목 · 음성 안내 토글 · SOS 를 담는다.
 *  · 음성 토글: settings.voiceGuide 를 켜고 끈다(전역 스토어 → 모든 화면 TTS 가 즉시 따름).
 *  · onBack 이 없으면 뒤로가기 버튼을 그리지 않는다(홈). backHidden 은 자리는 두고 숨김(온보딩 첫 질문).
 */

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 음성 안내 on/off 토글 — 켜짐: 스피커+음파(강조색) / 꺼짐: 스피커+슬래시(음소거·회색) */
function VoiceToggle() {
  const { voiceGuide } = useSettings()
  return (
    <button
      type="button"
      className="icon-btn"
      aria-pressed={voiceGuide}
      aria-label={voiceGuide ? '음성 안내 끄기' : '음성 안내 켜기'}
      onClick={() => {
        const next = !voiceGuide
        updateSettings({ voiceGuide: next })
        if (!next) stopSpeaking() // 끌 때 재생 중이던 음성도 즉시 중단
      }}
      style={{ color: voiceGuide ? 'var(--blue)' : '#98a1b2' }}
    >
      {voiceGuide ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 9v6h3.5L13 19V5L7.5 9H4Z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M16.4 8.6a5 5 0 0 1 0 6.8M18.8 6.2a8 8 0 0 1 0 11.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 9v6h3.5L13 19V5L7.5 9H4Z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="m16.5 9 5 6M21.5 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}

export function TopBar({
  title,
  onBack,
  backLabel = '뒤로 가기',
  backHidden = false,
  onSos,
}: {
  title: ReactNode
  onBack?: () => void
  backLabel?: string
  backHidden?: boolean
  onSos: () => void
}) {
  return (
    <header className="topbar">
      {onBack != null && (
        <button
          className="back-btn"
          onClick={onBack}
          aria-label={backLabel}
          style={backHidden ? { visibility: 'hidden' } : undefined}
        >
          <BackIcon />
        </button>
      )}
      <div className="topbar-title">
        <span className="brand-dot" />
        {title}
      </div>
      <VoiceToggle />
      <button className="sos-btn-top" onClick={onSos}>
        SOS
      </button>
    </header>
  )
}
