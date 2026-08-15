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

import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { listFavorites } from '../api/place'
import type { FavoritePlaceResponse } from '../types/dto'

/** 즐겨찾기가 없을 때 보여주는 카테고리 — 현재 위치 기준으로 검색된다 */
const CATEGORIES = [
  { emoji: '🏥', name: '병원' },
  { emoji: '💊', name: '약국' },
  { emoji: '🛒', name: '전통시장' },
  { emoji: '🏛️', name: '주민센터' },
]

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
}: {
  onMic: () => void
  onPlace: (destination: string) => void
  onSos: () => void
}) {
  const [favorites, setFavorites] = useState<FavoritePlaceResponse[] | null>(null)

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

  const hasFavorites = favorites !== null && favorites.length > 0

  // 저장한 곳이 있으면 그것을, 없으면 카테고리를 보여준다.
  // 불러오는 중(null)에는 카테고리를 먼저 보여줘서 빈 화면을 만들지 않는다.
  const items = hasFavorites
    ? favorites.slice(0, 6).map((f) => ({ emoji: emojiFor(f.name), name: f.name }))
    : CATEGORIES

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
          <button className="mic-button" onClick={onMic} aria-label="목적지를 음성으로 말하기">
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
    </section>
  )
}
