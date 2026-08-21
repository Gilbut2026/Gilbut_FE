import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { InstallSheet } from '../components/InstallSheet'
import { isInstalled } from '../state/install'
import { HomeAddressSheet } from '../components/HomeAddressSheet'
import { getSettings, saveAccessibility } from '../api/user'
import { withdraw } from '../state/account'
import { FONT_SIZES, type Settings } from '../state/settings'
import { getVoiceInfo, subscribeVoices, type VoiceInfo } from '../state/tts'
import { useScrollMemory } from '../state/scrollMemory'
import type {
  FontSize,
  MobilityProfileResponse,
  UserSettingsResponse,
} from '../types/dto'

/**
 * 내 이동 설정 (설정) — 7차 와이어프레임 #screen-settings 이식.
 * 경로 추천 기준(BE getSettings) + 보기와 듣기(글자크기·고대비·음성, saveAccessibility) + 내 정보와 안전 링크.
 */

/**
 * 이동특성 enum → 화면 태그 라벨.
 *
 * 온보딩 7문항 중 서버에 저장되는 6개를 모두 보여준다(나머지 하나인 '음성 안내'는
 * 아래 '보기와 듣기'에 있다). 여기서 빠지면 사용자는 자기가 뭘 답했는지 확인할 길이 없다.
 *
 * ⚠️ 키는 BE enum 과 정확히 같아야 한다. 매칭에 실패하면 undefined 가 되고
 *    filter(Boolean) 에 걸려 **태그가 조용히 사라진다** — 화면상으로는 답을 안 한 것처럼 보인다.
 *    실제로 mobilityAid 가 옛 enum(NONE/CANE/OTHER)으로 남아 있어 '사용 안 함'과 '지팡이'가
 *    표시되지 않았다(2026-08-15 수정).
 */
const WALK_LABEL: Record<string, string> = { UNABLE_TO_WALK: '보행 불가', WITHIN_10_MINUTES: '10분 보행', WITHIN_20_MINUTES: '20분 보행', OVER_30_MINUTES: '30분+ 보행' }
const STAIR_LABEL: Record<string, string> = { AVAILABLE: '계단 가능', SLIGHTLY_DIFFICULT: '계단 조금 어려움', DIFFICULT: '계단 어려움' }
const SLOPE_LABEL: Record<string, string> = { AVAILABLE: '오르막 괜찮음', SLIGHTLY_DIFFICULT: '오르막 조금 힘듦', DIFFICULT: '오르막 많이 힘듦' }
const REST_LABEL: Record<string, string> = { REQUIRED: '휴식 필요', NO_PREFERENCE: '휴식 상관없음' }
const TRANSFER_LABEL: Record<string, string> = { AVAILABLE: '환승 가능', FEWER_PREFERRED: '환승 적게', AVOID_PREFERRED: '환승 없이' }
const AID_LABEL: Record<string, string> = { NOT_USED: '보조기구 없음', CANE_OR_WALKER: '지팡이·보행기', WHEELCHAIR: '휠체어' }

function profileTags(p: MobilityProfileResponse): string[] {
  return [
    WALK_LABEL[p.walkingDuration],
    STAIR_LABEL[p.stairLevel],
    SLOPE_LABEL[p.slopeLevel],
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
  // 비상 연락처·즐겨찾기 등에 다녀와도 보던 자리로 돌아오게 한다 (내용이 그려진 뒤 복원)
  const scrollRef = useScrollMemory('settings', data !== null)
  const [homeSheet, setHomeSheet] = useState(false)
  const [installSheet, setInstallSheet] = useState(false)
  /*
   * 탈퇴는 두 번 묻는다.
   *   0 = 안 묻는 중 · 1 = "탈퇴하시겠어요?" · 2 = "정말로 탈퇴하시겠습니까?"
   *
   * 되돌릴 수 없는 일에 한 번만 묻는 것은 위험하다. 게다가 이 앱은 글자와 버튼이 크고
   * 손이 떨리는 분들이 쓴다 — 잘못 눌러 계정이 사라지는 일은 없어야 한다.
   */
  const [withdrawStep, setWithdrawStep] = useState<0 | 1 | 2>(0)
  const [withdrawing, setWithdrawing] = useState(false)
  // 한 번만 본다 — 설정 화면을 보는 중에 설치 여부가 바뀔 일은 없다
  const [installed] = useState(isInstalled)
  /*
   * 지금 읽고 있는 목소리. 처음엔 비어 있을 수 있다 — 브라우저가 목소리 목록을 늦게
   * 채우기 때문이다. subscribeVoices 가 채워지는 걸 보고 알려주면 다시 그린다.
   */
  const [voice, setVoice] = useState<VoiceInfo>(getVoiceInfo)
  const [voiceListOpen, setVoiceListOpen] = useState(false)
  useEffect(() => subscribeVoices(() => setVoice(getVoiceInfo())), [])

  function reloadSettings() {
    getSettings().then(setData)
  }
  useEffect(reloadSettings, [])

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

  /**
   * 탈퇴한다.
   *
   * 끝나고 나서 화면을 통째로 다시 연다. 이 앱은 라우터 없이 App 의 useState 하나로
   * 화면을 갈아끼우기 때문에, 지우기만 하고 화면을 그대로 두면 방금 지운 값들이
   * 메모리에 남아 계속 보인다. 새로고침이 가장 확실하다.
   */
  async function runWithdraw() {
    if (withdrawing) return
    setWithdrawing(true)
    try {
      await withdraw()
    } catch {
      setWithdrawing(false)
      setWithdrawStep(0)
      onToast('탈퇴하지 못했어요. 잠시 뒤 다시 해주세요')
      return
    }
    // BASE_URL 로 간다 — GitHub Pages 는 하위 경로에 얹혀 있어서 '/' 로 보내면 앱 밖으로 나간다
    window.location.replace(import.meta.env.BASE_URL)
  }

  const tags = data ? profileTags(data.mobilityProfile) : []
  const homeAddress = data?.safety.homeAddress
  const contactCount = data?.safety.emergencyContactCount ?? 0

  return (
    <section className="screen">
      <TopBar title="설정" onBack={onBack} backLabel="홈으로 돌아가기" onSos={onSos} />

      <div className="screen-body" ref={scrollRef}>
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

          {/*
           * 목소리는 기기와 브라우저가 정한다 — 우리가 소리를 만들어 보내는 게 아니라
           * 글자만 넘기고 기기에 깔린 음성이 읽는다. 그래서 같은 앱이라도 폰마다,
           * 심지어 같은 폰의 브라우저마다 다른 목소리가 난다. 어느 목소리가 걸렸는지
           * 여기 적어 두지 않으면 확인할 방법이 없다.
           */}
          <div className="setting-row" style={{ display: 'block' }}>
            <div className="setting-copy">
              <b>지금 목소리</b>
              <span>
                {!voice.supported
                  ? '이 기기에서는 음성 안내를 쓸 수 없어요'
                  : voice.picked
                    ? `${voice.picked.name} · ${voice.picked.lang}`
                    : '한국어 목소리를 찾지 못해 기기 기본 목소리로 읽어요'}
              </span>
              {voice.picked && (
                <span className="voice-uri">
                  {voice.picked.local ? '기기 내장' : '네트워크'} · {voice.picked.uri}
                </span>
              )}
            </div>
            {voice.korean.length > 1 && (
              <>
                <button
                  className={`font-option${voiceListOpen ? ' on' : ''}`}
                  style={{ marginTop: 10, width: '100%', minHeight: 46 }}
                  onClick={() => setVoiceListOpen(!voiceListOpen)}
                  aria-expanded={voiceListOpen}
                >
                  {voiceListOpen ? '접기' : `이 기기의 한국어 목소리 ${voice.korean.length}개 보기`}
                </button>
                {voiceListOpen && (
                  <ul className="voice-list">
                    {voice.korean.map((v) => (
                      <li key={v.uri} className={v.uri === voice.picked?.uri ? 'on' : undefined}>
                        {v.name}
                        <em>
                          {v.lang} · {v.local ? '기기 내장' : '네트워크'} · {v.uri}
                        </em>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div className="section-label">내 정보와 안전</div>
        <button className="setting-link" onClick={() => setHomeSheet(true)}>
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
        {/* 이미 앱으로 열고 계신 분에게는 안 보여준다 — 이미 한 일을 또 하라고 하면 안 된다.
            홈 화면 카드는 닫을 수 있으니, 나중에 하시려는 분을 위해 여기에는 상시로 둔다 */}
        {!installed && (
          <button className="setting-link" onClick={() => setInstallSheet(true)}>
            <span className="icon">📲</span>
            <span className="copy">
              <b>앱처럼 쓰기</b>
              <span>홈 화면에 두면 주소창 없이 바로 열려요</span>
            </span>
            <span className="chev">›</span>
          </button>
        )}
        <button className="setting-link" onClick={onOpenHelp}>
          <span className="icon">💬</span>
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

        {/*
          지금 도는 것이 언제 만든 것인가.

          배포는 됐는데 앱에는 옛 화면이 보이는 일이 있었다(2026-08-17). 홈 화면에 둔
          앱은 홈 버튼으로 나가도 페이지가 살아 있어서, 다시 열어도 그대로다. 그때
          「고친 게 안 보인다」와 「앱이 옛것을 들고 있다」를 가릴 방법이 없었다.

          화면 위에 띄우지 않고 여기 맨 아래에 둔다 — 어르신에게는 아무 뜻도 없는 값이라
          평소에는 안 보이는 편이 낫고, 우리는 필요할 때 찾아보면 된다.
        */}
        {/*
          탈퇴.

          그만 쓰겠다는 사람이 자기 자료를 지울 방법은 있어야 한다 — 집 주소, 비상 연락처,
          어디를 언제 다녔는지가 다 남아 있는 앱이다.
          시연 영상을 「처음 앱을 켠 사람」에서 시작하게 해주는 것도 이 버튼이다.

          맨 아래, 빌드 표시 바로 위에 둔다 — 평소에 마주칠 자리가 아니어야 한다.
        */}
        <div className="section-label">계정</div>
        <button className="setting-link danger" onClick={() => setWithdrawStep(1)}>
          <span className="icon">👋</span>
          <span className="copy">
            <b>탈퇴하기</b>
            <span>계정과 저장된 내용을 모두 지워요</span>
          </span>
          <span className="chev">›</span>
        </button>

        <p className="build-stamp">
          {__BUILD_TIME__} · {__BUILD_COMMIT__}
        </p>
      </div>

      {/* 집 주소 시트는 공용 컴포넌트를 쓴다.
          예전에는 이 화면이 자체 시트를 따로 갖고 있어서, 한쪽을 고쳐도 다른 쪽이 그대로 남았다.
          실제로 '현재 위치로 등록하기'가 GPS 를 쓰지 않고 문자열만 박아 넣는 상태로 남아 있었다. */}
      <InstallSheet open={installSheet} onClose={() => setInstallSheet(false)} />

      <HomeAddressSheet
        open={homeSheet}
        onClose={() => setHomeSheet(false)}
        onToast={onToast}
        onSaved={reloadSettings}
      />

      {/*
        탈퇴 확인 — 두 번 묻는다.

        한 시트 안에서 문구만 바꾼다. 시트를 두 개 두면 첫 시트가 닫히고 두 번째가 올라오는
        사이에 화면이 한 번 번쩍이고, 그 순간이 "내가 취소한 건가?"로 읽힌다.

        두 번째 물음에서는 「탈퇴」를 오른쪽이 아니라 위에 두되, 기본 손이 가는 자리
        (아래·큰 버튼)는 「아니요」로 남긴다.
      */}
      <div
        className={`scrim${withdrawStep ? ' show' : ''}`}
        onClick={() => !withdrawing && setWithdrawStep(0)}
      />
      <div
        className={`sheet${withdrawStep ? ' show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="탈퇴하기"
      >
        <div className="sheet-grip" />
        {withdrawStep === 2 ? (
          <>
            <h3>정말로 탈퇴하시겠습니까?</h3>
            <p>
              한 번 지우면 되돌릴 수 없어요. 집 주소·즐겨찾기·비상 연락처·길찾기 기록이
              모두 사라지고, 가입 화면으로 돌아갑니다.
            </p>
            <div className="sheet-actions">
              <button className="btn danger" onClick={runWithdraw} disabled={withdrawing}>
                {withdrawing ? '지우는 중…' : '네, 탈퇴합니다'}
              </button>
              <button
                className="btn neutral"
                onClick={() => setWithdrawStep(0)}
                disabled={withdrawing}
              >
                아니요, 그만둘게요
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>탈퇴하시겠어요?</h3>
            <p>
              계정을 지우면 아래 내용이 함께 사라집니다.
              <br />
              집 주소 · 즐겨찾기 · 비상 연락처 · 길찾기 기록 · 이동 설정 답변
            </p>
            <div className="sheet-actions">
              <button className="btn danger" onClick={() => setWithdrawStep(2)}>
                탈퇴할게요
              </button>
              <button className="btn neutral" onClick={() => setWithdrawStep(0)}>
                아니요, 계속 쓸게요
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
