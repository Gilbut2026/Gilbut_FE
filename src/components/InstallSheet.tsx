import { isIPad, platform, type InstallPlatform } from '../state/install'

/**
 * 「홈 화면에 추가」 안내 시트.
 *
 * 왜 넣었나 — 브라우저로 쓰면 위에 주소창이 남는다. 화면이 좁아지는 것도 있지만,
 * 더 큰 문제는 **어르신이 주소창을 눌러 다른 곳으로 가버리는 일이 잦다**는 것이다.
 * 홈 화면에 두면 앱처럼 열려 그럴 일이 없다.
 *
 * 기기별로 화면을 따로 만들지 않는다. 어느 기기인지는 우리가 알아내고
 * (state/install) **해당하는 방법 하나만** 보여준다. "안드로이드세요, 아이폰이세요?"를
 * 묻는 순간 절반은 거기서 멈춘다.
 *
 * 자동 설치 배너는 없다. 서비스워커를 일부러 두지 않았기 때문이다(index.html).
 * 그래서 안드로이드도 손으로 메뉴를 눌러야 하고, 이 안내가 그만큼 더 필요하다.
 */

interface Guide {
  title: string
  /** 왜 사파리로 옮겨야 하는지 같은, 단계 앞에 와야 하는 말 */
  before?: string
  steps: string[]
  note?: string
}

/*
 * 아이폰과 아이패드는 공유 버튼 자리가 다르다 — 아이폰은 화면 아래 가운데,
 * 아이패드는 오른쪽 위다. 같은 'ios-safari' 로 묶여 있어서 아이패드로 여신 분께
 * 아래를 보라고 안내하고 있었다(2026-08-23). 기기 이름도 「아이폰」으로 나왔다.
 *
 * 안내를 통째로 하나 더 만들지는 않는다 — 나머지 단계는 완전히 같아서, 갈리는
 * 두 마디만 여기서 갈라 둔다.
 */
const IPAD = isIPad()
const DEVICE = IPAD ? '아이패드' : '아이폰'
const SHARE = IPAD
  ? '오른쪽 위 공유 버튼을 누르세요 (네모에서 화살표가 위로 나가는 모양)'
  : '화면 아래 가운데 공유 버튼을 누르세요 (네모에서 화살표가 위로 나가는 모양)'

const GUIDES: Record<InstallPlatform, Guide> = {
  'ios-safari': {
    title: `${DEVICE} 홈 화면에 두기`,
    steps: [
      SHARE,
      '목록을 아래로 내려 「홈 화면에 추가」를 누르세요',
      '오른쪽 위 「추가」를 누르면 끝이에요',
    ],
    note: '홈 화면에 「길벗」 아이콘이 생겨요.',
  },
  'ios-other': {
    title: `${DEVICE} 홈 화면에 두기`,
    // iOS 16.4 부터는 크롬에서도 되지만, 버전을 알 수 없으니 확실한 길로 안내한다.
    // 안 되는 버전에서 시도하면 주소창이 달린 채로 추가되어 원인을 엉뚱한 데서 찾게 된다.
    before: '지금 쓰시는 브라우저에서는 안 될 수 있어요. 먼저 사파리로 이 페이지를 열어주세요.',
    steps: [
      '사파리(나침반 모양)를 열고 이 주소로 들어오세요',
      SHARE,
      '「홈 화면에 추가」 → 오른쪽 위 「추가」',
    ],
  },
  android: {
    title: '홈 화면에 두기',
    /*
     * 브라우저를 가리지 않는 문구로 적는다.
     *
     * 처음에는 「오른쪽 위 점 세 개(⋮)」라고 적었는데 그건 크롬 기준이었다.
     * 갤럭시 기본인 삼성 인터넷은 메뉴가 아래쪽에 있고 이름도 다르다 —
     * 어르신 사용자 상당수가 그쪽인데 없는 곳을 찾게 만들고 있었다.
     *
     * 삼성 인터넷을 따로 판별할 수도 있지만(UA 에 SamsungBrowser),
     * 실기기로 메뉴 이름을 확인하기 전까지는 또 틀린 것을 적게 된다.
     * 덜 친절하더라도 틀리지 않는 쪽을 골랐다.
     */
    steps: [
      '화면 구석의 메뉴를 누르세요 (점 세 개 ⋮ 또는 줄 세 개 ≡ 모양이에요)',
      '「홈 화면에 추가」를 찾아 누르세요',
      '「추가」를 누르면 끝이에요',
    ],
    note: '브라우저마다 메뉴 위치와 이름이 조금씩 달라요. 「앱 설치」나 「현재 페이지 추가」로 되어 있기도 해요.',
  },
  inapp: {
    title: '먼저 브라우저로 열어주세요',
    // 우리는 링크를 카톡으로 주고받는 팀이라 이 경우가 실제로 흔하다.
    // 앱 안의 브라우저에는 「홈 화면에 추가」 메뉴가 아예 없다.
    before: '카카오톡이나 다른 앱 안에서 열려 있어서, 지금은 홈 화면에 추가할 수 없어요.',
    steps: [
      '화면 구석의 점 세 개(⋮)를 누르세요',
      '「다른 브라우저로 열기」를 누르세요',
      '열린 브라우저에서 이 안내를 다시 보시면 돼요',
    ],
  },
  desktop: {
    title: '앱처럼 열기',
    steps: [
      '주소창 오른쪽 끝의 설치 아이콘을 누르세요',
      '「설치」를 누르면 별도 창으로 열려요',
    ],
    note: '휴대폰에서 열면 홈 화면에 아이콘으로 둘 수 있어요.',
  },
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const guide = GUIDES[platform()]

  return (
    <>
      <div className={`scrim${open ? ' show' : ''}`} onClick={onClose} />
      <div
        className={`sheet${open ? ' show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="홈 화면에 추가하는 방법"
      >
        <div className="sheet-grip" />
        <h3>{guide.title}</h3>
        <p>홈 화면에 두시면 앱처럼 바로 열려요. 주소창이 없어져 화면도 넓어져요.</p>

        {guide.before && <div className="install-before">{guide.before}</div>}

        <ol className="install-steps">
          {guide.steps.map((s, i) => (
            <li key={s}>
              <span className="num" aria-hidden="true">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {guide.note && <p className="install-note">{guide.note}</p>}

        <div className="sheet-actions">
          <button className="btn neutral" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </>
  )
}
