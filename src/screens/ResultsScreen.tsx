import { useCallback, useEffect, useState } from 'react'
import { getRoutes } from '../api/route'
import { ApiError } from '../api/client'
import { speak } from '../state/tts'
import { TopBar } from '../components/TopBar'
import { MINI_PATHS, MINI_RESTS, applyStairChoice } from '../mock/route'
import type { LatLng, RouteErrorKind, RouteKey, RouteOption, RouteResult } from '../types/dto'

/**
 * 가는 길 (결과) — 7차 와이어프레임 #screen-results 이식.
 * 오늘의 추천 경로를 중심에 두고, '다른 길도 볼게요'로 편한 길·걷기 적은 길·똑버스(또는 콜택시)를 번갈아 본다.
 *
 * 7/31 회의 반영
 *  · 쉼터를 미니맵 위에 마커로 표시 — 점수에는 넣지 않고 "가는 길에 보이게"만 한다.
 *  · 계단이 '조금 어려움'이면 결과를 바로 보여주지 않고 계단 선택 화면을 먼저 띄운다.
 *  · 휠체어 이용자에게는 똑버스 대신 장애인 콜택시 안내가 후보로 들어온다.
 */


/**
 * 경로 조회 실패 안내 문구.
 * 설계 원칙: **막다른 길을 만들지 않는다** — 모든 원인에 다음 행동을 준다.
 * 어르신 대상이라 최후 수단으로 「전화로 도움 받기」를 항상 남긴다.
 */
const ROUTE_ERRORS: Record<RouteErrorKind, { title: string; text: string; hint: string }> = {
  quota: {
    title: '지금은 길을 찾지 못했어요',
    text: '교통정보를 불러오는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.',
    hint: '길 안내가 안 되더라도 전화로 도움을 받으실 수 있어요.',
  },
  none: {
    title: '갈 수 있는 길을 찾지 못했어요',
    text: '계단을 피하는 조건 때문일 수 있어요. 기본 설정을 조금 바꾸면 길이 나올 수 있어요.',
    hint: '설정에서 계단·보행 시간을 바꾸고 다시 찾아보실 수 있어요.',
  },
  outside: {
    title: '아직 안내할 수 없는 지역이에요',
    text: '지금은 수원시 안에서만 길을 찾아드릴 수 있어요.',
    hint: '수원시 안의 목적지로 다시 말씀해 주세요.',
  },
  offline: {
    title: '인터넷 연결이 끊겼어요',
    text: '연결을 확인하신 뒤 다시 시도해 주세요.',
    hint: '연결이 안 되어도 전화로 도움을 받으실 수 있어요.',
  },
  server: {
    title: '지금은 길을 찾지 못했어요',
    text: '잠시 문제가 생겼어요. 조금 뒤 다시 시도해 주세요.',
    hint: '길 안내가 안 되더라도 전화로 도움을 받으실 수 있어요.',
  },
}

/**
 * 실패 원인 판별.
 * ⚠️ `outside`(수원 밖)는 BE 가 별도 코드/메시지를 내려줘야 구분할 수 있다 — 응답 규약 확인 필요.
 */
function toErrorKind(e: unknown): RouteErrorKind {
  if (e instanceof ApiError) {
    if (e.status === 0) return 'offline'
    if (e.status === 429) return 'quota'
    if (e.status === 404) return 'none'
    return 'server'
  }
  return 'server'
}

/** 쉼터 마커 — 점수에 반영하지 않고 지도에 보여주기만 하는 참고 정보(7/31 회의) */
function RestMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r="7.5" fill="#fff" stroke="#167A55" strokeWidth="2" />
      <path
        d="M-3.4 -1.4h6.8M-3.4 -1.4v2.8M3.4 -1.4v2.8M-2.2 1.6h4.4"
        stroke="#167A55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>
  )
}

function MiniMap({ routeKey }: { routeKey: RouteKey }) {
  const accent = routeKey === 'drt' || routeKey === 'calltaxi' ? '#167A55' : '#6755F5'
  const d = MINI_PATHS[routeKey]
  const rests = MINI_RESTS[routeKey]
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
        {rests.map(([x, y]) => (
          <RestMark key={`${x}-${y}`} x={x} y={y} />
        ))}
        <g transform="translate(284,34)">
          <path d="M0 0 C-5 -8 -9 -12 -9 -17 A9 9 0 1 1 9 -17 C9 -12 5 -8 0 0 Z" fill={accent} stroke="#fff" strokeWidth="1.6" />
          <circle cx="0" cy="-17" r="4.6" fill="#fff" />
        </g>
      </svg>
      <span className="mini-map-badge">{rests.length > 0 ? '🗺️ 경로 · 쉼터 표시' : '🗺️ 경로 미리보기'}</span>
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
  onGuide: (guide: RouteOption['guide'], result: RouteResult) => void
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
          <button className="btn primary" onClick={() => onGuide(selected.guide, result)}>
            {selected.guide === 'drt'
              ? '똑버스 이용 방법 보기'
              : selected.guide === 'calltaxi'
                ? '콜택시 부르는 방법 보기'
                : '이 길로 안내받기'}
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
  departureDateTime,
  destinationCoords,
  stairChoice,
  onNeedStairChoice,
  onGoHome,
  onRestartChat,
  onSos,
  onGuide,
}: {
  destination: string | null
  /** 대화에서 고른 출발 시각('YYYY-MM-DDTHH:mm:ss'). 없으면 지금 기준으로 조회한다. */
  departureDateTime: string | null
  /** 대화에서 사용자가 확인한 목적지 좌표. 있으면 이름으로 다시 검색하지 않는다. */
  destinationCoords: LatLng | null
  /** 사용자가 이미 고른 계단 선택 (아직 안 골랐으면 null) */
  stairChoice: 'with' | 'none' | null
  /** 계단 선택을 물어야 할 때 — App 이 계단 선택 화면으로 넘긴다 */
  onNeedStairChoice: (comparison: NonNullable<RouteResult['stairComparison']>) => void
  onGoHome: () => void
  /** 목적지를 다시 말하러 대화 화면으로 */
  onRestartChat: () => void
  onSos: () => void
  onGuide: (guide: RouteOption['guide'], result: RouteResult) => void
}) {
  const [result, setResult] = useState<RouteResult | null>(null)
  const [selectedKey, setSelectedKey] = useState<RouteKey | null>(null)
  const [error, setError] = useState<RouteErrorKind | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!destination) {
      setResult(null)
      setSelectedKey(null)
      setError(null)
      return
    }
    let alive = true
    setError(null)
    setResult(null)
    getRoutes(destination, departureDateTime ?? undefined, destinationCoords ?? undefined).then(
      (r) => {
        if (!alive) return
        // 후보가 하나도 없으면 오류가 아니라 '갈 수 있는 길 없음'
        if (r.options.length === 0) {
          setError('none')
          return
        }
        setResult(r)
        setSelectedKey(r.recommendedKey)
      },
      (e: unknown) => {
        if (!alive) return
        setError(toErrorKind(e))
      },
    )
    return () => {
      alive = false
    }
    // 출발 시각이 바뀌면 다시 조회한다 — 시간대에 따라 대중교통 후보가 달라진다
  }, [destination, departureDateTime, destinationCoords, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // 글씨를 못 읽는 분도 상황을 알 수 있게 오류 제목은 음성으로도 안내한다
  useEffect(() => {
    if (!error) return
    speak(ROUTE_ERRORS[error].title, { auto: true })
  }, [error])

  // 계단이 '조금 어려움'인데 아직 안 고르셨으면, 결과 대신 두 경로 비교를 먼저 보여드린다
  useEffect(() => {
    if (result?.stairComparison && stairChoice === null) {
      onNeedStairChoice(result.stairComparison)
    }
  }, [result, stairChoice, onNeedStairChoice])

  // 고른 결과를 '가장 편한 길' 카드에 실제로 반영한다
  const options = result
    ? result.options.map((o) => (o.key === 'comfort' && stairChoice ? applyStairChoice(o, stairChoice) : o))
    : []

  const selected = result && selectedKey ? options.find((o) => o.key === selectedKey) ?? options[0] : null

  function nextRoute() {
    if (!result || !selectedKey) return
    const i = options.findIndex((o) => o.key === selectedKey)
    setSelectedKey(options[(i + 1) % options.length].key)
  }

  return (
    <section className="screen">
      <TopBar title="가는 길" onBack={onGoHome} backLabel="홈으로 돌아가기" onSos={onSos} />

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
              <button className="btn secondary" onClick={onRestartChat}>
                대화로 길찾기
              </button>
            </div>
            <div className="route-empty-hint">목적지만 정하면 편한 길을 바로 찾아드려요.</div>
          </div>
        )}

        {destination && error && (
          <div className="route-empty glass">
            <div className="route-empty-art error">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3 2.5 20h19L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M12 10v4m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h2>{ROUTE_ERRORS[error].title}</h2>
            <p>{ROUTE_ERRORS[error].text}</p>
            <div className="route-empty-actions">
              <button className="btn primary" onClick={retry}>
                다시 시도하기
              </button>
              <button className="btn secondary" onClick={onRestartChat}>
                목적지 다시 말하기
              </button>
              <a className="btn neutral" href="tel:031-228-2114">
                전화로 도움 받기
              </a>
            </div>
            <div className="route-empty-hint">{ROUTE_ERRORS[error].hint}</div>
          </div>
        )}

        {destination && !error && !selected && <p className="screen-lead">편한 길을 찾고 있어요…</p>}

        {destination && !error && result && selected && (
          <RouteView result={result} selected={selected} onNext={nextRoute} onGuide={onGuide} />
        )}
      </div>
    </section>
  )
}
