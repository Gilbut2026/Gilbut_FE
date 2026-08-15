import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { getSettings, saveAccessibility } from '../api/user'
import { getHome, saveHome, searchPlaces } from '../api/place'
import { SUWON_CENTER } from '../api/geo'
import { FONT_SIZES, type Settings } from '../state/settings'
import type {
  FontSize,
  MobilityProfileResponse,
  UserSettingsResponse,
} from '../types/dto'

/**
 * 내 이동 설정 (설정) — 7차 와이어프레임 #screen-settings 이식.
 * 경로 추천 기준(BE getSettings) + 보기와 듣기(글자크기·고대비·음성, saveAccessibility) + 내 정보와 안전 링크.
 */

// 이동특성 enum → 화면 태그 라벨
const WALK_LABEL: Record<string, string> = { UNABLE_TO_WALK: '보행 불가', WITHIN_10_MINUTES: '10분 보행', WITHIN_20_MINUTES: '20분 보행', OVER_30_MINUTES: '30분+ 보행' }
const STAIR_LABEL: Record<string, string> = { AVAILABLE: '계단 가능', SLIGHTLY_DIFFICULT: '계단 조금 어려움', DIFFICULT: '계단 어려움' }
const REST_LABEL: Record<string, string> = { REQUIRED: '휴식 필요', NO_PREFERENCE: '휴식 상관없음' }
const TRANSFER_LABEL: Record<string, string> = { AVAILABLE: '환승 가능', FEWER_PREFERRED: '환승 적게', AVOID_PREFERRED: '환승 없이' }
const AID_LABEL: Record<string, string> = { NONE: '보조기구 없음', CANE: '지팡이', WHEELCHAIR: '휠체어', OTHER: '보조기구 사용' }

function profileTags(p: MobilityProfileResponse): string[] {
  return [
    WALK_LABEL[p.walkingDuration],
    STAIR_LABEL[p.stairLevel],
    REST_LABEL[p.restStopPreference],
    TRANSFER_LABEL[p.transferLevel],
    AID_LABEL[p.mobilityAid],
  ].filter(Boolean)
}


export function SettingsScreen({
  settings,
  onChange,
  onBack,
  onSos,
  onToast,
  onEditProfile,
  onOpenContacts,
  onOpenFavorites,
  onOpenHistory,
  onOpenHelp,
}: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
  onEditProfile: () => void
  onOpenContacts: () => void
  onOpenFavorites: () => void
  onOpenHistory: () => void
  onOpenHelp: () => void
}) {
  const [data, setData] = useState<UserSettingsResponse | null>(null)
  const [homeSheet, setHomeSheet] = useState(false)
  const [homeInput, setHomeInput] = useState('')
  const [savingHome, setSavingHome] = useState(false)

  function reloadSettings() {
    getSettings().then(setData)
  }
  useEffect(reloadSettings, [])

  async function openHomeSheet() {
    const current = await getHome()
    setHomeInput(current?.address ?? '')
    setHomeSheet(true)
  }

  async function handleSaveHome() {
    if (!homeInput.trim()) {
      onToast('집 주소를 입력해 주세요')
      return
    }
    setSavingHome(true)
    try {
      const address = homeInput.trim()
      // 입력 주소를 place 검색으로 실좌표 변환(첫 결과). 못 찾으면 서비스 지역 기준점으로 폴백.
      let latitude = SUWON_CENTER.latitude
      let longitude = SUWON_CENTER.longitude
      try {
        const first = (await searchPlaces({ keyword: address })).places[0]
        if (first) {
          latitude = first.latitude
          longitude = first.longitude
        }
      } catch {
        /* 검색 실패 시 기본 좌표 유지 */
      }
      await saveHome({ address, latitude, longitude })
      setHomeSheet(false)
      reloadSettings()
      onToast('집 주소를 저장했어요')
    } catch {
      onToast('저장에 실패했어요')
    } finally {
      setSavingHome(false)
    }
  }

  // 접근성 변경 → 로컬 반영 + BE 저장
  function apply(patch: Partial<Settings>) {
    const next = { ...settings, ...patch }
    onChange(patch)
    saveAccessibility({
      voiceGuidanceEnabled: next.voiceGuide,
      highContrastEnabled: next.highContrast,
      fontSize: next.fontSize,
      voiceSpeed: next.voiceSpeed,
    }).catch(() => onToast('설정 저장에 실패했어요'))
  }

  const tags = data ? profileTags(data.mobilityProfile) : []
  const homeAddress = data?.safety.homeAddress
  const contactCount = data?.safety.emergencyContactCount ?? 0

  return (
    <section className="screen">
      <TopBar title="설정" onBack={onBack} backLabel="홈으로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <h2 className="screen-title" style={{ fontSize: 27 }}>
          내 이동 설정
        </h2>
        <p className="screen-lead">답변은 언제든 바꿀 수 있어요.</p>

        <div className="setting-group glass">
          <div className="setting-head">
            <h3>경로 추천 기준</h3>
            <button onClick={onEditProfile}>다시 답하기</button>
          </div>
          <div className="profile-tags">
            {tags.length ? (
              tags.map((t) => (
                <span key={t} className="profile-tag">
                  {t}
                </span>
              ))
            ) : (
              <span className="profile-tag">불러오는 중…</span>
            )}
          </div>
        </div>

        <div className="section-label">보기와 듣기</div>
        <div className="setting-group glass">
          <div className="setting-row">
            <div className="setting-copy">
              <b>음성 안내</b>
              <span>화면과 길 안내를 소리로 읽어요</span>
            </div>
            <button
              className={`toggle${settings.voiceGuide ? ' on' : ''}`}
              onClick={() => apply({ voiceGuide: !settings.voiceGuide })}
              aria-pressed={settings.voiceGuide}
              aria-label="음성 안내 켜기 또는 끄기"
            />
          </div>

          <div className="setting-row">
            <div className="setting-copy">
              <b>글자·버튼 선명하게</b>
              <span>켜면 더 진하고 굵게 보여요</span>
            </div>
            <button
              className={`toggle${settings.highContrast ? ' on' : ''}`}
              onClick={() => apply({ highContrast: !settings.highContrast })}
              aria-pressed={settings.highContrast}
              aria-label="글자·버튼 선명하게 켜기 또는 끄기"
            />
          </div>

          <div className="setting-row" style={{ display: 'block' }}>
            <div className="setting-copy">
              <b>글자 크기</b>
              <span>편한 크기를 선택하세요</span>
            </div>
            <div className="font-options">
              {FONT_SIZES.map((f) => (
                <button
                  key={f.value}
                  className={`font-option${settings.fontSize === f.value ? ' on' : ''}`}
                  onClick={() => apply({ fontSize: f.value as FontSize })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row" style={{ display: 'block' }}>
            <div className="setting-copy">
              <b>음성 속도</b>
              <span>왼쪽은 느리게, 오른쪽은 빠르게</span>
            </div>
            <input
              className="range"
              type="range"
              min="0.7"
              max="1.4"
              step="0.1"
              value={settings.voiceSpeed}
              onChange={(e) => apply({ voiceSpeed: Number(e.target.value) })}
              aria-label="음성 속도"
            />
          </div>
        </div>

        <div className="section-label">내 정보와 안전</div>
        <button className="setting-link" onClick={openHomeSheet}>
          <span className="icon">🏠</span>
          <span className="copy">
            <b>집 주소</b>
            <span>{homeAddress ?? '아직 등록되지 않았어요'}</span>
          </span>
          <span className="chev">›</span>
        </button>
        <button className="setting-link" onClick={onOpenContacts}>
          <span className="icon">☎️</span>
          <span className="copy">
            <b>비상 연락처</b>
            <span>SOS 시 알릴 사람 · {contactCount}명</span>
          </span>
          <span className="chev">›</span>
        </button>
        <button className="setting-link" onClick={onOpenFavorites}>
          <span className="icon">⭐</span>
          <span className="copy">
            <b>자주 가는 곳</b>
            <span>저장된 목적지에서 바로 길찾기 시작</span>
          </span>
          <span className="chev">›</span>
        </button>
        <button className="setting-link" onClick={onOpenHistory}>
          <span className="icon">🕘</span>
          <span className="copy">
            <b>길찾기 기록</b>
            <span>지난 경로와 공유 내용을 다시 확인</span>
          </span>
          <span className="chev">›</span>
        </button>
        <button className="setting-link" onClick={onOpenHelp}>
          <span className="icon">?</span>
          <span className="copy">
            <b>도움말</b>
            <span>사용법을 글과 음성으로 안내</span>
          </span>
          <span className="chev">›</span>
        </button>

        <div className="section-label">데이터 안내</div>
        <div className="notice-box" style={{ marginTop: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 8h.01M11 12h1v4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          확인되지 않은 계단·보행시설 정보는 추정하지 않고 “미확인”으로 표시합니다.
        </div>
      </div>

      <div className={`scrim${homeSheet ? ' show' : ''}`} onClick={() => setHomeSheet(false)} />
      <div className={`sheet${homeSheet ? ' show' : ''}`}>
        <div className="sheet-grip" />
        <h3>집 주소</h3>
        <p>등록해 두면 ‘집’을 출발지·목적지로 바로 쓸 수 있어요.</p>
        <label className="home-field">
          <span className="label">주소</span>
          <input value={homeInput} onChange={(e) => setHomeInput(e.target.value)} placeholder="예: 수원시 팔달구 ○○로 12" />
        </label>
        <button className="home-gps" onClick={() => setHomeInput('경기 수원시 팔달구 (현재 위치)')}>
          📍 현재 위치로 등록하기
        </button>
        <div className="sheet-actions">
          <button className="btn primary" onClick={handleSaveHome} disabled={savingHome}>
            {savingHome ? '저장하는 중…' : '저장하기'}
          </button>
          <button className="btn neutral" onClick={() => setHomeSheet(false)}>
            취소
          </button>
        </div>
      </div>
    </section>
  )
}
