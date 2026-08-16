/**
 * 가는 길 주변 시설 — 쉼터와 화장실.
 *
 * 7/31 회의에서 정한 것: **쉼터는 점수에 넣지 않고 지도에 표시만 한다.**
 * 어디로 갈지를 우리가 대신 정하지 않되, 쉬어 갈 곳이 있다는 것은 알려준다.
 *
 * 화장실도 함께 받는다. 어르신에게 화장실은 쉼터만큼 중요하다 —
 * 오래 걷는 길에서 화장실이 어디 있는지는 나갈지 말지를 실제로 가르는 정보다.
 *
 * BE 는 수원시 공공데이터 CSV 를 들고 있어(resources/data/facilities) 외부 호출이
 * 아니다. TMAP 쿼터와 무관하므로 마음 놓고 부를 수 있다.
 */
import type {
  AlongRouteFacilityResponse,
  FacilityItem,
  FacilityType,
  LatLng,
} from '../types/dto'
import { api } from './client'
import { useMock } from './mode'
import { mockFacilitiesAlongRoute } from '../mock/facility'

/**
 * 경로에서 이만큼 안쪽만 가져온다.
 * 넓히면 「가는 길에 있다」가 아니라 「이 동네에 있다」가 되어버린다.
 * 100m 는 걷다가 눈에 들어오고, 들렀다 와도 길을 크게 벗어나지 않는 거리다.
 */
export const FACILITY_RADIUS_M = 100

/**
 * 가는 길 바로 옆에 없을 때 넓혀 보는 반경.
 *
 * 「없어요」로 끝내면 사용자가 할 수 있는 것이 없다. 300m 는 걸어서 4분쯤이라,
 * 정말 쉬어야 하는 분에게는 들를 만한 거리다. 대신 **길에서 떨어져 있다는 것을
 * 화면에 밝힌다** — 가는 길에 있는 것처럼 보이면 안 된다.
 */
export const FACILITY_WIDE_RADIUS_M = 300

export interface FacilityLookup {
  items: FacilityItem[]
  /** 반경을 넓혀서 찾은 결과인가 — 화면 문구가 달라진다 */
  widened: boolean
}

/**
 * 좌표를 솎아낸다.
 *
 * 경로 좌표는 수백 개인데 그대로 보내면 요청이 커지고 BE 도 그만큼 훑는다.
 * 굽은 곳이 촘촘해서 몇 개 건너뛰어도 경로 모양은 거의 그대로다.
 * 끝점은 반드시 남긴다 — 목적지 주변이 가장 필요한 곳이다.
 */
function thin(points: LatLng[], max = 60): LatLng[] {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, i) => i % step === 0)
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/**
 * 이 경로 주변의 쉼터·화장실.
 *
 * 바로 옆(100m)에 없으면 한 번 넓혀서(300m) 다시 찾는다. 「없어요」로 끝내면
 * 사용자가 할 수 있는 것이 없는데, 조금 떨어진 곳이라도 알면 들를지 말지를 정할 수 있다.
 * 넓혀 찾았다는 사실은 그대로 돌려준다 — 화면이 그렇게 밝혀야 한다.
 *
 * 실패하면 빈 목록. 지도는 시설 없이도 그대로 굴러간다.
 */
export async function getFacilitiesAlongRoute(
  path: LatLng[],
  types: FacilityType[],
): Promise<FacilityLookup> {
  const empty: FacilityLookup = { items: [], widened: false }
  if (!path.length || !types.length) return empty

  const routePoints = thin(path).map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }))

  if (useMock('route')) {
    return { items: await mockFacilitiesAlongRoute(routePoints, types), widened: false }
  }

  const ask = async (radiusMeters: number) => {
    try {
      const res = await api.post<AlongRouteFacilityResponse>('/api/facilities/along-route', {
        routePoints,
        radiusMeters,
        types,
      })
      return res.items ?? []
    } catch {
      // 시설을 못 가져와도 길 안내는 그대로 된다. 조용히 비운다.
      return []
    }
  }

  const near = await ask(FACILITY_RADIUS_M)
  if (near.length) return { items: near, widened: false }

  const wide = await ask(FACILITY_WIDE_RADIUS_M)
  return wide.length ? { items: wide, widened: true } : empty
}
