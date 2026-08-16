import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { listHistory } from '../api/history'
import type { RouteHistoryItem } from '../types/dto'
import { useScrollMemory } from '../state/scrollMemory'

/** 상담 기록 — 7차 와이어프레임 #screen-history 이식. 항목을 누르면 그 경로를 다시 본다. */


export function HistoryScreen({
  onBack,
  onSos,
  onPick,
}: {
  onBack: () => void
  onSos: () => void
  onPick: (destination: string) => void
}) {
  const [items, setItems] = useState<RouteHistoryItem[]>([])
  /*
   * 불러오는 중인지, 없는 건지, 못 불러온 건지를 가른다.
   * 예전에는 셋 다 **빈 화면**으로 똑같이 보였다. 제목만 덩그러니 남아서
   * 기록이 없는 건지 고장난 건지 알 수 없었다.
   */
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const scrollRef = useScrollMemory('history', items.length > 0)

  useEffect(() => {
    let alive = true
    listHistory()
      .then((list) => {
        if (!alive) return
        setItems(list)
        setState('ready')
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="screen">
      <TopBar title="길찾기 기록" onBack={onBack} backLabel="설정으로 돌아가기" onSos={onSos} />

      <div className="screen-body" ref={scrollRef}>
        <h2 className="screen-title" style={{ fontSize: 27 }}>
          지난 길찾기
        </h2>
        <p className="screen-lead">경로를 다시 보거나 보호자에게 공유할 수 있어요.</p>

        {state === 'loading' && <p className="list-note">불러오는 중이에요…</p>}
        {state === 'error' && (
          <p className="list-note">지난 기록을 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</p>
        )}
        {state === 'ready' && items.length === 0 && (
          <p className="list-note">아직 길을 찾은 기록이 없어요. 길을 한 번 찾으면 여기에 남아요.</p>
        )}

        {items.map((it) => (
          <button key={it.id} className="history-card glass" style={{ width: '100%', border: 0, textAlign: 'left' }} onClick={() => onPick(it.destination)}>
            <div className="copy">
              <b>{it.destination}</b>
              <span>{it.when}</span>
            </div>
            <span className={`history-badge${it.badgeTone === 'default' ? '' : ` ${it.badgeTone}`}`}>{it.badgeLabel}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
