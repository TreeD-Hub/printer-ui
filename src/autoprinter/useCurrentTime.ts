import { useEffect, useState } from 'react'

export function useCurrentTime(enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [enabled])

  return now
}
