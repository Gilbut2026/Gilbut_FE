import { useEffect, useState } from 'react'
import { getRoutes } from '../api/route'
import { MINI_PATHS } from '../mock/route'
import type { RouteKey, RouteOption, RouteResult } from '../types/dto'

/**
 * 가는 길 (결과) — 6차 와이어프레임 #screen-results 이식.
 * 오늘의 추천 경로를 중심에 두고, '다른 길도 볼게요'로 편한 길·걷기 적은 길·똑버스를 번갈아 본다.
 */

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MiniMap({ routeKey }: { routeKey: RouteKey }) {
  const accent = routeKey === 'drt' ? '#167A55' : '#6755F5'
  const d = MINI_PATHS[routeKey]
  return (
    <div className="mini-map">
      <svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect x="-10" y="-10" width="320" height="140" fill="#ECEAE2" />
        <path d="M-10 -6 L60 -6 C56 26 34 40 -10 42 Z" fill="#CFE3BE" />
        <path d="M250 96 C270 92 290 100 310 96 L310 130 L250 130 Z" fill="#CFE3BE" />
        <g fill="#E2DDD1">
          <rect x="150" y="6" width="52" height="26" rx="3" />
          <rect x="228" y="8" width="60" height="24" rx="3" />
          <rect x="150" y="72" width="46" height="30" rx="3" />
        </g>
        <path d="M-10 46 C120 40 200 44 310 38" fill="none" stroke="#D8D3C6" strokeWidth="15" />
        <path d="M-10 46 C120 40 200 44 310 38" fill="none" stroke="#fff" strokeWidth="9" />
        <path d="M120 -10 C116 50 124 90 120 130" fill="none" stroke="#D8D3C6" strokeWidth="12" />
        <path d="M120 -10 C116 50 124 90 120 130" fill="none" stroke="#fff" strokeWidth="6.5" />
        <path d="M212 -10 C208 50 216 90 212 130" fill="none" stroke="#D8D3C6" strokeWidth="10" />
        <path d="M212 -10 C208 50 216 90 212 130" fill="none" stroke="#fff" strokeWidth="5.5" />
        <path d={d} fill="none" stroke="#3A2CA8" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d={d} fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path className="route-flow" d={d} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="18" cy="94" r="6.5" fill="#3488F4" stroke="#fff" strokeWidth="2.5" />
        <g transform="translate(284,34)">
          <path d="M0 0 C-5 -8 -9 -12 -9 -17 A9 9 0 1 1 9 -17 C9 -12 5 -8 0 0 Z" fill={accent} stroke="#fff" strokeWidth="1.6" />
          <circle cx="0" cy="-17" r="4.6" fill="#fff" />
        </g>
      </svg>
      <span className="mini-map-badge">🗺️ 경로 미리보기</span>
    </div>
  )
}

function RouteView({
  result,
  selected,
  onNext,
  onGuide,
}: {
  result: RouteResult
  selected: RouteOption
  onNext: () => void
  onGuide: (guide: RouteOption['guide']) => void
}) {
  const isRec = selected.key === result.recommendedKey
  return (
    <div>
      <div className="result-intro">
        <div>
          <h2>{result.destination} 가는 길</h2>
          <p>
            {result.origin} → {result.destination} · 내 이동 설정을 반영했어요.
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {isRec ? (
          <div className="today-best">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            오늘은 이 길이 편해요
          </div>
        ) : (
          <div className="today-alt">다른 길이에요</div>
        )}

        <article className="route-card glass">
          <h3>{selected.title}</h3>
          <p className="route-sub">{selected.sub}</p>
          <div className="metrics">
            <div className="metric">
              <span>예상 시간</span>
              <strong>{selected.time}</strong>
            </div>
            <div className="metric">
              <span>걷는 시간</span>
              <strong>{selected.walk}</strong>
            </div>
            <div className="metric">
              <span>환승</span>
              <strong>{selected.transfer}</strong>
            </div>
          </div>
          <MiniMap routeKey={selected.key} />
        </article>

        <div className="section-label">편의시설과 이동 조건</div>
        <div className="facility-grid">
          {selected.facilities.map((f) => (
            <div key={f.label} className="facility">
              <i className={`status-icon ${f.status}`}>{f.status === 'ok' ? '✓' : f.status === 'warn' ? '!' : 'i'}</i>
              <div>
                <b>{f.label}</b>
                <span>{f.value}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="notice-box">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 2.5 20h19L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12 9v5m0 3h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span>
            <b>확인해 주세요</b>
            <br />
            {selected.notice}
          </span>
        </div>

        <div className="result-actions">
          <button className="btn primary" onClick={() => onGuide(selected.guide)}>
            {selected.guide === 'drt' ? '똑버스 이용 방법 보기' : '이 길로 안내받기'}
          </button>
          <button className="text-btn" onClick={onNext}>
            다른 길도 볼게요
          </button>
        </div>
      </div>
    </div>
  )
}

export function ResultsScreen({
  destination,
  onGoHome,
  onSos,
  onGuide,
}: {
  destination: string | null
  onGoHome: () => void
  onSos: () => void
  onGuide: (guide: RouteOption['guide']) => void
}) {
  const [result, setResult] = useState<RouteResult | null>(null)
  const [selectedKey, setSelectedKey] = useState<RouteKey | null>(null)

  useEffect(() => {
    if (!destination) {
      setResult(null)
      setSelectedKey(null)
      return
    }
    let alive = true
    getRoutes(destination).then((r) => {
      if (!alive) return
      setResult(r)
      setSelectedKey(r.recommendedKey)
    })
    return () => {
      alive = false
    }
  }, [destination])

  const selected = result && selectedKey ? result.options.find((o) => o.key === selectedKey) ?? result.options[0] : null

  function nextRoute() {
    if (!result || !selectedKey) return
    const i = result.options.findIndex((o) => o.key === selectedKey)
    setSelectedKey(result.options[(i + 1) % result.options.length].key)
  }

  return (
    <section className="screen">
      <header className="topbar">
        <button className="back-btn" onClick={onGoHome} aria-label="홈으로 돌아가기">
          <BackIcon />
        </button>
        <div className="topbar-title">
          <span className="brand-dot" />
          가는 길
        </div>
        <button className="sos-btn-top" onClick={onSos}>
          SOS
        </button>
      </header>

      <div className="screen-body">
        {!destination && (
          <div className="route-empty glass">
            <div className="route-empty-art">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M9 4v14m6-11.5V20.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
            </div>
            <h2>아직 추천할 경로가 없어요</h2>
            <p>
              어디로 가실지 먼저 알려주세요.
              <br />
              말씀만 하시면 편한 길을 찾아드려요.
            </p>
            <div className="route-empty-actions">
              <button className="btn primary" onClick={onGoHome}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="8.5" y="2.5" width="7" height="11.5" rx="3.5" fill="currentColor" />
                  <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                목적지 말하기
              </button>
            </div>
            <div className="route-empty-hint">목적지만 정하면 편한 길을 바로 찾아드려요.</div>
          </div>
        )}

        {destination && !selected && <p className="screen-lead">편한 길을 찾고 있어요…</p>}

        {destination && result && selected && (
          <RouteView result={result} selected={selected} onNext={nextRoute} onGuide={onGuide} />
        )}
      </div>
    </section>
  )
}
