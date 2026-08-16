/**
 * Mock 쉼터·화장실.
 *
 * 실서버는 수원시 공공데이터에서 찾아주지만, 로컬은 전부 Mock 이라 그 호출이 안 나간다.
 * 화면(마커 크기·겹침·토글)을 다듬으려면 무언가는 찍혀야 하므로,
 * **넘어온 경로 좌표 위에 몇 개를 얹어** 돌려준다.
 *
 * ⚠️ 이름과 운영시간은 지어낸 값이다. 좌표만 진짜 경로 위에 있다.
 *    실서버에서는 전부 실제 시설로 바뀐다 — 화면 배치를 보는 용도로만 쓴다.
 */
import type { FacilityItem, FacilityType, LatLng } from '../types/dto'
import { delay } from './_shared'

const SHELTER_NAMES = ['경로당 쉼터', '무더위쉼터(주민센터)', '작은도서관 쉼터', '공원 그늘쉼터']
const TOILET_NAMES = ['공원 공중화장실', '주민센터 화장실', '지하철역 화장실']

/** 경로 위에 고르게 몇 군데를 고른다 — 한쪽에 몰리면 겹침을 볼 수 없다 */
function pickAlong(points: LatLng[], count: number): LatLng[] {
  if (points.length < 2 || count < 1) return []
  const out: LatLng[] = []
  for (let i = 1; i <= count; i += 1) {
    out.push(points[Math.floor((points.length * i) / (count + 1))])
  }
  return out
}

export function mockFacilitiesAlongRoute(
  routePoints: LatLng[],
  types: FacilityType[],
): Promise<FacilityItem[]> {
  const items: FacilityItem[] = []

  if (types.includes('SHELTER')) {
    pickAlong(routePoints, 3).forEach((at, i) => {
      items.push({
        type: 'SHELTER',
        facilityId: `mock-shelter-${i}`,
        name: SHELTER_NAMES[i % SHELTER_NAMES.length],
        category: '쉼터',
        address: '수원시 (Mock)',
        // 경로에서 조금 비켜 놓는다 — 실제로도 길 위가 아니라 옆 건물에 있다
        latitude: at.latitude + 0.0004,
        longitude: at.longitude + 0.0003,
        distanceFromRouteM: 40 + i * 15,
        phone: null,
        operatingHours: '09:00~18:00',
        status: '영업',
      })
    })
  }

  if (types.includes('TOILET')) {
    pickAlong(routePoints, 2).forEach((at, i) => {
      items.push({
        type: 'TOILET',
        facilityId: `mock-toilet-${i}`,
        name: TOILET_NAMES[i % TOILET_NAMES.length],
        category: '화장실',
        address: '수원시 (Mock)',
        latitude: at.latitude - 0.0004,
        longitude: at.longitude - 0.0002,
        distanceFromRouteM: 55 + i * 20,
        phone: null,
        operatingHours: '24시간',
        status: '개방',
      })
    })
  }

  return delay(items)
}
