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

  function reload() {
    listFavorites().then(setPlaces)
  }
  useEffect(reload, [])

  async function handleDelete(id: number) {
    await deleteFavorite(id)
    reload()
    onToast('장소를 삭제했어요')
  }

  return (
    <section className="screen">
      <TopBar title="자주 가는 곳" onBack={onBack} backLabel="설정으로 돌아가기" onSos={onSos} />

      <div className="screen-body" ref={scrollRef}>
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
