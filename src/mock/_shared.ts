/** Mock 공용 유틸 — 실제 네트워크처럼 살짝 지연을 준다. */
export function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

let seq = 1
/** Mock 엔티티용 증가 ID */
export function nextId(): number {
  return seq++
}
