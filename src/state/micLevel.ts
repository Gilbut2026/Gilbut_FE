/**
 * 마이크로 지금 들어오는 소리의 세기 — 듣는 화면의 막대를 실제 목소리에 맞춰 움직인다.
 *
 * 왜 필요한가 — 지금 막대는 정해진 대로 흔들릴 뿐이라, 말을 해도 가만히 있어도 똑같다.
 * 어르신이 「내 말이 들어가고 있나」를 확인할 방법이 없다. 소리를 내면 막대가 커지는
 * 것만으로도 「지금 듣고 있구나」가 전해진다.
 *
 * ⚠️ 음성 인식(SpeechRecognition)이 이미 마이크를 잡고 있는데 여기서 하나를 더 연다.
 *    크롬에서는 대개 함께 되지만 기기에 따라 다를 수 있어서, **실패하면 조용히 포기한다.**
 *    그러면 화면은 원래 애니메이션으로 움직인다 — 막대가 안 움직이는 것보다야
 *    실제와 안 맞는 편이 낫고, 무엇보다 **음성 인식이 우선이다.**
 */

/**
 * 세기를 재기 시작한다.
 *
 * @param onLevel 0(조용) ~ 1(큼). 화면 새로고침마다 불린다
 * @returns 그만 재게 하는 함수. 반드시 불러야 마이크가 놓인다
 */
export function startMicLevel(onLevel: (level: number) => void): () => void {
  let stopped = false
  let raf = 0
  let ctx: AudioContext | null = null
  let stream: MediaStream | null = null

  const AudioCtor =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioCtor || !navigator.mediaDevices?.getUserMedia) return () => {}

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => {
      // 여는 사이에 화면을 떠났으면 바로 놓는다 — 안 그러면 마이크가 켜진 채 남는다
      if (stopped) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      stream = s
      ctx = new AudioCtor()
      const analyser = ctx.createAnalyser()
      // 512 면 사람 목소리를 따라가기에 충분하고 계산도 가볍다
      analyser.fftSize = 512
      ctx.createMediaStreamSource(s).connect(analyser)

      const buf = new Uint8Array(analyser.fftSize)
      let smooth = 0

      const tick = () => {
        if (stopped) return
        analyser.getByteTimeDomainData(buf)
        // 파형의 실효값(RMS) — 0.5(무음) 기준으로 얼마나 출렁이는가
        let sum = 0
        for (let i = 0; i < buf.length; i += 1) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        /*
         * 보통 말소리의 RMS 는 0.02~0.2 언저리다. 그대로 쓰면 막대가 거의 안 움직인다.
         * 6배로 키우고 1에서 자른다 — 크게 말한다고 더 커질 필요는 없다.
         */
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 6)
        /*
         * 값이 그대로 튀면 막대가 덜덜 떨려서 보기 나쁘다. 오르는 것은 빠르게,
         * 내리는 것은 천천히 — 말이 잠깐 끊겨도 막대가 뚝 떨어지지 않는다.
         */
        smooth = level > smooth ? level : smooth * 0.82 + level * 0.18
        onLevel(smooth)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    .catch(() => {
      /* 마이크를 하나 더 못 열었다. 화면은 원래 애니메이션으로 움직인다 */
    })

  return () => {
    stopped = true
    if (raf) cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    void ctx?.close().catch(() => {})
  }
}
