import { platform, type InstallPlatform } from '../state/install'

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

const GUIDES: Record<InstallPlatform, Guide> = {
  'ios-safari': {
    title: '아이폰 홈 화면에 두기',
    steps: [
      '화면 아래 가운데 공유 버튼을 누르세요 (네모에서 화살표가 위로 나가는 모양)',
      '목록을 아래로 내려 「홈 화면에 추가」를 누르세요',
      '오른쪽 위 「추가」를 누르면 끝이에요',
    ],
    note: '홈 화면에 「길벗」 아이콘이 생겨요.',
  },
  'ios-other': {
    title: '아이폰 홈 화면에 두기',
    // iOS 16.4 부터는 크롬에서도 되지만, 버전을 알 수 없으니 확실한 길로 안내한다.
    // 안 되는 버전에서 시도하면 주소창이 달린 채로 추가되어 원인을 엉뚱한 데서 찾게 된다.
    before: '지금 쓰시는 브라우저에서는 안 될 수 있어요. 먼저 사파리로 이 페이지를 열어주세요.',
    steps: [
      '사파리(나침반 모양)를 열고 이 주소로 들어오세요',
      '화면 아래 가운데 공유 버튼을 누르세요 (네모에서 화살표가 위로 나가는 모양)',
      '「홈 화면에 추가」 → 오른쪽 위 「추가」',
    ],
  },
  android: {
    title: '홈 화면에 두기',
    steps: [
      '화면 오른쪽 위 점 세 개(⋮)를 누르세요',
      '「홈 화면에 추가」 또는 「앱 설치」를 누르세요',
      '「추가」를 누르면 끝이에요',
    ],
    note: '크롬이 아니어도 돼요. 삼성 인터넷이나 다른 브라우저에도 같은 메뉴가 있어요.',
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
