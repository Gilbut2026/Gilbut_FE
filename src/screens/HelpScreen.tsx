/** 도움말 — 7차 와이어프레임 #screen-help 이식. 사용법 4단계 + 음성으로 듣기. */
import { speak as playVoice } from '../state/tts'
import { TopBar } from '../components/TopBar'


const STEPS = [
  { n: 1, title: '기본 설정에 답하세요', desc: '걷기·계단 등 몇 가지를 먼저 정해요.' },
  { n: 2, title: '홈에서 목적지를 말하세요', desc: '버튼을 누르거나 음성으로 말하면 돼요.' },
  { n: 3, title: '필요할 때 대화로 길을 찾아요', desc: '목적지·출발지·출발 시간을 말로 정해요.' },
  { n: 4, title: '편한 길로 안내받으세요', desc: '오늘 편한 길을 확인하고 안내를 시작해요.' },
]

export function HelpScreen({
  onBack,
  onSos,
  onToast,
}: {
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  function speakHelp() {
    const text = 'AI 길벗 사용 방법입니다. ' + STEPS.map((s) => `${s.n}. ${s.title}. ${s.desc}`).join(' ')
    if (!playVoice(text)) onToast('이 기기에서는 음성 안내를 쓸 수 없어요')
  }

  return (
    <section className="screen">
      <TopBar title="도움말" onBack={onBack} backLabel="설정으로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <h2 className="screen-title" style={{ fontSize: 27 }}>
          AI 길벗 사용 방법
        </h2>
        <p className="screen-lead">기본 설정부터 길 안내까지 네 단계로 이용해요.</p>

        <button className="btn secondary" style={{ marginBottom: 12 }} onClick={speakHelp}>
          🔊 사용법 음성으로 듣기
        </button>

        {STEPS.map((s) => (
          <div key={s.n} className="help-card glass">
            <span className="help-num">{s.n}</span>
            <div>
              <b>{s.title}</b>
              <p>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
