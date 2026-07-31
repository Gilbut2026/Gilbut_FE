import { useEffect, useState } from 'react'
import { listHistory } from '../api/history'
import type { RouteHistoryItem } from '../types/dto'

/** 상담 기록 — 6차 와이어프레임 #screen-history 이식. 항목을 누르면 그 경로를 다시 본다. */

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

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
      <header className="topbar">
        <button className="back-btn" onClick={onBack} aria-label="설정으로 돌아가기">
          <BackIcon />
        </button>
        <div className="topbar-title">
          <span className="brand-dot" />
          상담 기록
        </div>
        <button className="sos-btn-top" onClick={onSos}>
          SOS
        </button>
      </header>

      <div className="screen-body">
        <h2 className="screen-title" style={{ fontSize: 27 }}>
          지난 상담
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
