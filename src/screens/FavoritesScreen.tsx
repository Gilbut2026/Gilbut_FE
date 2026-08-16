import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { deleteFavorite, listFavorites } from '../api/place'
import type { FavoritePlaceResponse } from '../types/dto'
import { useScrollMemory } from '../state/scrollMemory'

/**
 * 자주 가는 곳 — 7차 와이어프레임 #screen-favorites 이식.
 * api/place (BE /api/users/me/favorites) 연동. 장소를 누르면 바로 길찾기(결과)로.
 */


export function FavoritesScreen({
  onBack,
  onSos,
  onToast,
  onPick,
}: {
  onBack: () => void
  onSos: () => void
  onToast: (msg: string) => void
  onPick: (destination: string) => void
}) {
  const [places, setPlaces] = useState<FavoritePlaceResponse[]>([])
  const scrollRef = useScrollMemory('favorites', places.length > 0)

  // 불러오는 중 · 없음 · 못 불러옴을 가른다 — 셋이 다 빈 화면이면 원인을 알 수 없다
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  function reload() {
    listFavorites()
      .then((list) => {
        setPlaces(list)
        setState('ready')
      })
      .catch(() => setState('error'))
  }
  useEffect(reload, [])

  async function handleDelete(id: number) {
    try {
      await deleteFavorite(id)
      reload()
      onToast('장소를 삭제했어요')
    } catch {
      // 실패했는데 「삭제했어요」가 뜨면, 목록에 그대로 있는 것을 보고 더 혼란스럽다
      onToast('삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요')
    }
  }

  return (
    <section className="screen">
      <TopBar title="자주 가는 곳" onBack={onBack} backLabel="설정으로 돌아가기" onSos={onSos} />

      <div className="screen-body" ref={scrollRef}>
        {state === 'loading' && <p className="list-note">불러오는 중이에요…</p>}
        {state === 'error' && (
          <p className="list-note">자주 가는 곳을 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</p>
        )}
        {state === 'ready' && places.length === 0 && (
          <p className="list-note">아직 저장한 곳이 없어요.</p>
        )}
        <h2 className="screen-title" style={{ fontSize: 27 }}>
          자주 가는 곳
        </h2>
        <p className="screen-lead">장소를 누르면 바로 편한 길을 찾아드려요.</p>

        {places.map((p) => (
          <div key={p.id} className="list-card glass">
            <div className="list-item">
              <button
                className="list-copy"
                style={{ border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                onClick={() => onPick(p.name)}
              >
                <b>{p.name}</b>
                <span>{p.address}</span>
              </button>
              <div className="list-actions">
                <button onClick={() => handleDelete(p.id)} aria-label={`${p.name} 삭제`}>
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}

        <button className="btn secondary" onClick={() => onToast('장소 추가는 곧 준비할게요')}>
          ＋ 장소 추가하기
        </button>
      </div>
    </section>
  )
}
