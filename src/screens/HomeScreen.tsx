/**
 * 홈 — 7차 와이어프레임 #screen-home 이식.
 * 마이크(음성으로 목적지 말하기) + 자주 가는 곳. 하단 탭은 App 셸이 렌더한다.
 *
 * 2026-08-15 "자주 가는 곳"을 실제 데이터로 바꿈.
 *   예전에는 ['○○병원','전통시장','주민센터','수원역'] 이 하드코딩돼 있었다.
 *   서버도 위치도 보지 않았고, '○○병원'은 검색되지 않는 자리표시자라 누르면 그대로 막혔다.
 *
 *   이제 두 단계로 보여준다.
 *     1. 저장해둔 즐겨찾기가 있으면 그것을 보여준다 (진짜 "자주 가는 곳")
 *     2. 없으면 카테고리 바로가기를 보여준다. 이건 누르면 대화 화면이
 *        현재 위치를 중심으로 검색하므로, 어디서 열든 근처 장소가 나온다.
 */

import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { listFavorites } from '../api/place'
import { SPEECH_ERROR_TEXT, listenOnce, type SpeechSession } from '../state/speech'
import type { FavoritePlaceResponse } from '../types/dto'
import { QUICK_DESTINATIONS } from './quickDestinations'

/** 즐겨찾기 이름으로 어울리는 아이콘을 고른다 (서버는 아이콘을 주지 않는다) */
function emojiFor(name: string): string {
  if (/병원|의원|치과|한의원/.test(name)) return '🏥'
  if (/약국/.test(name)) return '💊'
  if (/시장|마트/.test(name)) return '🛒'
  if (/주민센터|구청|시청|행정/.test(name)) return '🏛️'
  if (/역$|역\s|터미널/.test(name)) return '🚉'
  if (/공원|호수/.test(name)) return '🌳'
  if (/도서관|학교|대학/.test(name)) return '📚'
  if (/복지관|경로당/.test(name)) return '🧓'
  return '📍'
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8.5" y="2.5" width="7" height="11.5" rx="3.5" fill="currentColor" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function HomeScreen({
  onMic,
  onPlace,
  onSos,
  onToast,
}: {
  /**
   * 마이크로 들은 말을 그대로 넘긴다. 대화 화면이 이 말을 **사용자의 첫 발화**로 이어받는다.
   * 못 들었으면 인자 없이 부른다(대화 화면이 처음부터 물어본다).
   */
  onMic: (utterance?: string) => void
  onPlace: (destination: string) => void
  onSos: () => void
  onToast: (msg: string) => void
}) {
  const [favorites, setFavorites] = useState<FavoritePlaceResponse[] | null>(null)
  // 듣는 중 화면. 예전에는 마이크를 눌러도 대화창으로 넘어가기만 해서,
  // 거기서 마이크를 한 번 더 눌러야 했다. 홈에서 바로 듣고 그 말을 들고 넘어간다.
  const [listening, setListening] = useState(false)
  const sessionRef = useRef<SpeechSession | null>(null)

  useEffect(() => {
    let alive = true
    listFavorites()
      .then((list) => {
        if (alive) setFavorites(list)
      })
      // 즐겨찾기를 못 불러와도 홈은 떠야 한다 — 카테고리 바로가기로 넘어간다
      .catch(() => {
        if (alive) setFavorites([])
      })
    return () => {
      alive = false
    }
  }, [])

  // 화면을 떠날 때 듣던 것을 정리한다 (마이크가 계속 열려 있지 않도록)
  useEffect(() => () => sessionRef.current?.cancel(), [])

  function startListening() {
    if (listening) return
    setListening(true)
    sessionRef.current = listenOnce({
      onResult: (text) => {
        sessionRef.current = null
        setListening(false)
        onMic(text) // 들은 말을 그대로 대화로 넘긴다
      },
      onError: (kind) => {
        sessionRef.current = null
        setListening(false)
        onToast(SPEECH_ERROR_TEXT[kind])
      },
    })
  }

  function stopListening() {
    sessionRef.current?.cancel()
    sessionRef.current = null
    setListening(false)
  }

  const hasFavorites = favorites !== null && favorites.length > 0

  // 저장한 곳이 있으면 그것을, 없으면 카테고리를 보여준다.
  // 불러오는 중(null)에는 카테고리를 먼저 보여줘서 빈 화면을 만들지 않는다.
  const items = hasFavorites
    ? favorites.slice(0, 6).map((f) => ({ emoji: emojiFor(f.name), name: f.name }))
    : QUICK_DESTINATIONS

  return (
    <section className="screen">
      <TopBar title="AI 길벗" onSos={onSos} />

      <div className="screen-body">
        <div className="home-hero glass">
          <h2>
            안녕하세요!
            <br />
            <em>어디로</em> 가고 싶으세요?
          </h2>
        </div>

        <div className="mic-zone">
          <button
            className={`mic-button${listening ? ' listening' : ''}`}
            onClick={startListening}
            aria-label="목적지를 음성으로 말하기"
            disabled={listening}
          >
            <MicIcon />
          </button>
          <div className="mic-label">누르고 목적지를 말씀하세요</div>
          <div className="mic-help">예: “병원에 가고 싶어요”</div>
        </div>

        <div className="home-section-label">{hasFavorites ? '자주 가는 곳' : '어디로 가실까요'}</div>
        <div className="quick-grid">
          {items.map((p) => (
            <button key={p.name} className="place-btn" onClick={() => onPlace(p.name)}>
              <span className="place-emoji">{p.emoji}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/*
        듣는 중 화면. 화면을 덮어 "지금 듣고 있다"를 분명히 한다 —
        어르신이 말해도 되는 때를 몰라 머뭇거리는 것이 가장 흔한 실패다.
        말이 끝나면 브라우저가 알아서 인식을 끝내므로 따로 누를 필요가 없다.
      */}
      {listening && (
        <div className="listening" role="status" aria-live="assertive">
          <div className="listening-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="listening-mic" aria-hidden="true">
            <MicIcon />
          </div>
          <h2>듣고 있어요</h2>
          <p>어디로 가고 싶으신지 말씀해 주세요</p>
          <span className="listening-help">말씀이 끝나면 저절로 넘어가요</span>
          <button className="btn neutral listening-cancel" onClick={stopListening}>
            그만두기
          </button>
        </div>
      )}
    </section>
  )
}
