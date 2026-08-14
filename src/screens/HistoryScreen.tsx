import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { listHistory } from '../api/history'
import type { RouteHistoryItem } from '../types/dto'

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

  useEffect(() => {
    listHistory().then(setItems)
  }, [])

  return (
    <section className="screen">
      <TopBar title="길찾기 기록" onBack={onBack} backLabel="설정으로 돌아가기" onSos={onSos} />

      <div className="screen-body">
        <h2 className="screen-title" style={{ fontSize: 27 }}>
          지난 길찾기
        </h2>
        <p className="screen-lead">경로를 다시 보거나 보호자에게 공유할 수 있어요.</p>

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
