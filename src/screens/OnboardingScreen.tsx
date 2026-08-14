import { useEffect, useState } from 'react'
import { saveMobilityProfile } from '../api/user'
import { saveAccessibility } from '../api/user'
import { getAccessibility } from '../api/user'
import { speak } from '../state/tts'
import { loadSettings, updateSettings } from '../state/settings'
import { TopBar } from '../components/TopBar'
import type {
  MobilityAid,
  MobilityProfileSaveRequest,
  RestStopPreference,
  SlopeLevel,
  StairLevel,
  TransferLevel,
  WalkingDuration,
} from '../types/dto'

/**
 * 나에게 맞는 길 설정 (온보딩) — 7차 와이어프레임 #screen-onboarding 이식.
 * 7문항을 순서대로 묻고, 완료 시 답변을 BE 계약으로 매핑해 저장한다.
 *  · walk·stairs·rest·transfer·aid → MobilityProfileSaveRequest
 *  · voice → AccessibilitySetting(voiceGuidanceEnabled)
 *
 * 7/31 회의 반영
 *  · 보조기구 3지선다 복원 — 휠체어 이용자에게 장애인 콜택시를 안내하기로 정해져 휠체어 식별이 필요해졌다.
 *
 * 8/12 오르막 질문 복원 (6차 와이어프레임 정의 그대로) → 8/14 저장 배선 완료.
 *  · AI팀 확답: Score function 이 경사를 3단계(괜찮음/조금 힘듦/많이 힘듦)로 구분해 가중치.
 *  · 8/13 BE 재형님이 SlopeLevel enum(AVAILABLE/SLIGHTLY_DIFFICULT/DIFFICULT, @NotNull 필수) 확정.
 *    → dto.ts SlopeLevel + SLOPE_MAP + payload slopeLevel 로 연결함. 필수 필드라 반드시 함께 저장한다.
 */

interface Question {
  id: string
  icon: string
  label: string
  title: string
  help: string
  options: string[]
}

const QUESTIONS: Question[] = [
  { id: 'voice', icon: '🔊', label: '음성 안내', title: '음성으로 안내를 받으시겠어요?', help: '켜두시면 이어지는 질문과 길 안내를 소리로 읽어드려요.', options: ['사용', '사용 안 함'] },
  { id: 'walk', icon: '🚶', label: '보행 시간', title: '한 번에 얼마나 걸을 수 있나요?', help: '평소 무리 없이 걸을 수 있는 시간을 골라주세요.', options: ['보행 불가', '10분 이내', '20분', '30분 이상'] },
  { id: 'stairs', icon: '🪜', label: '계단', title: '계단을 이용할 수 있나요?', help: '계단이 있는 길과 없는 길을 함께 보여드려요.', options: ['이용 가능', '조금 어려움', '이용 어려움'] },
  { id: 'slope', icon: '⛰️', label: '오르막', title: '오르막길 이동이 힘드신가요?', help: '경사가 큰 구간을 피하는 데 사용해요.', options: ['괜찮음', '조금 힘듦', '많이 힘듦'] },
  { id: 'rest', icon: '🪑', label: '휴식', title: '이동 중 쉬어 갈 곳이 필요한가요?', help: '가는 길 지도에 쉼터를 표시해 드려요.', options: ['필요', '상관없음'] },
  { id: 'transfer', icon: '🔁', label: '환승', title: '버스나 지하철 환승이 어려우신가요?', help: '환승 횟수가 적은 길을 우선해요.', options: ['괜찮음', '적게', '되도록 없음'] },
  { id: 'aid', icon: '🦯', label: '보조기구', title: '이동할 때 무엇을 사용하시나요?', help: '휠체어를 쓰시면 탑승할 수 있는 차량으로 안내해 드려요.', options: ['사용 안 함', '지팡이·보행기', '휠체어'] },
]

// ── 와이어프레임 선택지 → BE enum 매핑 ──────────────────────────
// 2026-08-06 BE 중간 배포에서 UNABLE_TO_WALK 가 추가돼, '보행 불가'를 뭉개지 않고 그대로 보낸다.
const WALK_MAP: Record<string, WalkingDuration> = {
  '보행 불가': 'UNABLE_TO_WALK',
  '10분 이내': 'WITHIN_10_MINUTES',
  '20분': 'WITHIN_20_MINUTES',
  '30분 이상': 'OVER_30_MINUTES',
}
const STAIR_MAP: Record<string, StairLevel> = {
  '이용 가능': 'AVAILABLE',
  '조금 어려움': 'SLIGHTLY_DIFFICULT',
  '이용 어려움': 'DIFFICULT',
}
const SLOPE_MAP: Record<string, SlopeLevel> = {
  괜찮음: 'AVAILABLE',
  '조금 힘듦': 'SLIGHTLY_DIFFICULT',
  '많이 힘듦': 'DIFFICULT',
}
const REST_MAP: Record<string, RestStopPreference> = {
  필요: 'REQUIRED',
  상관없음: 'NO_PREFERENCE',
}
const TRANSFER_MAP: Record<string, TransferLevel> = {
  괜찮음: 'AVAILABLE',
  적게: 'FEWER_PREFERRED',
  '되도록 없음': 'AVOID_PREFERRED',
}
const AID_MAP: Record<string, MobilityAid> = {
  '사용 안 함': 'NOT_USED',
  '지팡이·보행기': 'CANE_OR_WALKER',
  휠체어: 'WHEELCHAIR',
}


export function OnboardingScreen({
  onComplete,
  onSos,
}: {
  onComplete: (voiceEnabled: boolean) => void
  onSos: () => void
}) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const q = QUESTIONS[index]

  // 어르신 대상 — 음성 안내가 켜져 있으면 질문을 소리로 읽어준다.
  // 설정값(topbar 토글이 바꾸는 값) 하나만 본다. 음성 질문 답은 choose 에서 즉시 설정에 반영한다.
  useEffect(() => {
    if (loadSettings().voiceGuide) speak(`${q.title} ${q.help}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])
  const answered = answers[q.id] != null
  const isLast = index === QUESTIONS.length - 1

  function choose(option: string) {
    setAnswers((a) => ({ ...a, [q.id]: option }))
    // 음성 질문 답은 즉시 설정에 반영 → 이후 질문 읽기·topbar 토글이 같은 값을 본다.
    if (q.id === 'voice') updateSettings({ voiceGuide: option === '사용' })
  }

  async function next() {
    if (!answered) return
    if (!isLast) {
      setIndex((i) => i + 1)
      return
    }
    // 마지막 문항 — BE 계약으로 저장
    setSaving(true)
    try {
      const profile: MobilityProfileSaveRequest = {
        walkingDuration: WALK_MAP[answers.walk],
        stairLevel: STAIR_MAP[answers.stairs],
        slopeLevel: SLOPE_MAP[answers.slope],
        restStopPreference: REST_MAP[answers.rest],
        transferLevel: TRANSFER_MAP[answers.transfer],
        mobilityAid: AID_MAP[answers.aid],
      }
      const voiceEnabled = answers.voice === '사용'
      const current = await getAccessibility()
      await Promise.all([
        saveMobilityProfile(profile),
        saveAccessibility({
          voiceGuidanceEnabled: voiceEnabled,
          highContrastEnabled: current.highContrastEnabled,
          fontSize: current.fontSize,
          voiceSpeed: current.voiceSpeed,
        }),
      ])
      onComplete(voiceEnabled)
    } catch {
      setSaving(false)
    }
  }

  return (
    <section className="screen">
      <TopBar
        title="나에게 맞는 길 설정"
        onBack={() => setIndex((i) => Math.max(0, i - 1))}
        backLabel="이전 질문"
        backHidden={index === 0}
        onSos={onSos}
      />

      <div className="screen-body onboard-body">
        <div className="progress-meta">
          <span>
            {index + 1} / {QUESTIONS.length}
          </span>
          <span>약 1분</span>
        </div>
        <div className="progress" aria-label="기본 설정 진행률">
          <span style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }} />
        </div>

        <div className="question-card glass">
          <div className="question-icon" aria-hidden="true">
            {q.icon}
          </div>
          <p className="screen-kicker">{q.label}</p>
          <h2>{q.title}</h2>
          <p>{q.help}</p>
        </div>

        <div className="choices">
          {q.options.map((option) => {
            const selected = answers[q.id] === option
            return (
              <button
                key={option}
                className={`choice${selected ? ' selected' : ''}`}
                onClick={() => choose(option)}
              >
                <span className="choice-mark">{selected ? '✓' : ''}</span>
                {option}
              </button>
            )
          })}
        </div>

        <div className="onboard-actions">
          <button className="btn primary" onClick={next} disabled={!answered || saving}>
            {saving ? '저장하는 중…' : isLast ? '설정 저장하기' : '다음'}
          </button>
        </div>
      </div>
    </section>
  )
}
