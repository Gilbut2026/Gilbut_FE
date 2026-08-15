import { useLayoutEffect, useRef, useState } from 'react'
import { areaOf, areasDiffer, type RankedPlaces } from '../api/placeRank'
import type { PlaceItemResponse } from '../types/dto'

/**
 * 장소 후보 카드 — 검색 결과에서 갈 곳을 고르는 화면.
 *
 * 처음에는 세 곳만 보여준다.
 * 순위는 이미 정리돼 있어서(api/placeRank) 찾는 곳은 거의 맨 위에 있다. 그런데도
 * 여덟 곳을 한꺼번에 펼치면, 첫 줄에 답이 있는데도 전부 읽고 비교하게 만든다.
 * 어르신에게는 그 자체가 부담이다. 세 곳이면 한 눈에 들어온다.
 *
 * 없을 때 갈 곳은 두 갈래다.
 *   · **더 보기** — 검색은 맞았는데 위쪽이 아닐 때. 나머지를 펼친다
 *   · **다시 말하기** — 검색어 자체가 틀렸을 때. 처음부터 다시 말한다
 *
 * 예전엔 "찾는 곳이 없어요 · 다시 말하기" 하나뿐이라, 네 번째 후보가 정답인 사람도
 * 처음부터 다시 말해야 했다. 두 경우는 필요한 것이 다르므로 버튼도 나눈다.
 *
 * 펼친 뒤에도 없으면 그때는 다시 말하기만 남는다 — 더 펼칠 것이 없으니 그 버튼도 없앤다.
 * 눌러도 아무 일이 없는 버튼은 어르신에게 "내가 잘못 눌렀나" 하는 불안을 준다.
 */

/** 처음에 보여줄 개수 */
const FIRST_PAGE = 3

/**
 * 더 보기로 펼쳤을 때의 최대 개수.
 * TMAP 은 같은 건물의 정문·후문·주차장까지 40건 넘게 준다. 다 보여줘도 고를 수 없다.
 * 여덟 곳에 없으면 검색어가 틀린 것이므로 다시 말하는 편이 빠르다.
 */
const MAX_SHOWN = 8

export function PlaceCandidates({
  ranked,
  onPick,
  onRedo,
  disabled,
}: {
  ranked: RankedPlaces
  onPick: (place: PlaceItemResponse) => void
  /** "찾는 곳이 없어요" — 목적지를 처음부터 다시 묻는다 */
  onRedo: () => void
  disabled?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  /*
   * 펼치면 늘어난 만큼 아래로 따라간다.
   *
   * 대화 목록은 새 말풍선이 생길 때만 아래로 스크롤한다(ChatView). 그런데 더 보기는
   * 말풍선을 만드는 게 아니라 카드 안에서 펼치는 것이라, 그대로 두면 **누른 자리에서
   * 화면이 멈춰 있고 늘어난 후보는 화면 밖에 숨는다.**
   * 어르신에게는 "눌렀는데 아무 일도 안 일어났다"로 보이고, 그래서 다시 누른다.
   *
   * 처음 그릴 때는 움직이지 않는다 — 이제 막 도착한 카드를 밀어 올릴 이유가 없다.
   */
  useLayoutEffect(() => {
    if (!expanded) return
    // ⚠️ scrollIntoView 는 스크롤되는 조상을 전부 굴려서 **창까지 밀어버린다.**
    //    우리가 굴릴 것은 대화 목록 하나뿐이다.
    const box = endRef.current?.closest<HTMLElement>('.chat-scroll')
    box?.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
  }, [expanded])

  /*
   * 첫 화면은 **대표 장소만** 보여준다. 접어둔 것(같은 건물의 별관·정문·주차장)은
   * 더 보기에서 나온다 — 처음부터 섞으면 "아주대학교병원" 아래에 "아주대학교병원 정문"이
   * 붙어서, 무엇이 다른지 읽어봐야 알 수 있다.
   */
  const all = [...ranked.primary, ...ranked.more].slice(0, MAX_SHOWN)
  const firstCount = Math.min(ranked.primary.length, FIRST_PAGE)
  const shown = expanded ? all : all.slice(0, firstCount)
  const more = all.length - firstCount
  // 후보가 다 같은 동네면 지역을 안 붙인다 — 같은 글자를 세 번 읽게 하지 않는다
  const showArea = areasDiffer(shown)

  return (
    <>
      <h3>어디로 모실까요?</h3>
      <p>가시려는 곳을 골라주세요.</p>

      {/* key 에 순번을 섞는다 — BE 응답의 placeId 가 중복으로 온다
          (본원·정문·후문·지하주차장이 모두 "159346"). placeId 만 쓰면 React 가
          항목을 잘못 매칭해 누른 것과 다른 곳이 선택될 수 있다. */}
      {shown.map((p, i) => (
        <button
          key={`${p.placeId}-${i}`}
          className="chat-place pick"
          disabled={disabled}
          onClick={() => onPick(p)}
        >
          <span className="pin">📍</span>
          <span>
            <b>{p.name}</b>
            {showArea && <span>{areaOf(p.address)}</span>}
          </span>
        </button>
      ))}

      <div className="chat-card-actions">
        {!expanded && more > 0 && (
          <button className="full" onClick={() => setExpanded(true)}>
            다른 곳 {more}개 더 보기
          </button>
        )}
        <button className="full" onClick={onRedo}>
          찾는 곳이 없어요 · 다시 말하기
        </button>
      </div>
      {/* 펼쳤을 때 여기까지 따라간다 */}
      <div ref={endRef} />
    </>
  )
}
