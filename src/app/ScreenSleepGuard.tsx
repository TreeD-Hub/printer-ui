import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'

const WAKE_GUARD_MS = 250

type ScreenSleepGuardProps = {
  timeoutMs: number
}

export function ScreenSleepGuard({ timeoutMs }: ScreenSleepGuardProps) {
  const [isSleeping, setIsSleeping] = useState(false)
  const [isWaking, setIsWaking] = useState(false)
  const idleTimerRef = useRef<number | null>(null)
  const wakeTimerRef = useRef<number | null>(null)

  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
    }
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null
      setIsSleeping(true)
    }, Math.max(1, timeoutMs))
  }, [timeoutMs])

  useEffect(() => {
    const handleActivity = (): void => {
      if (!isSleeping && !isWaking) {
        armIdleTimer()
      }
    }

    if (!isSleeping && !isWaking) {
      armIdleTimer()
    }
    window.addEventListener('pointerdown', handleActivity, true)
    window.addEventListener('keydown', handleActivity, true)

    return () => {
      window.removeEventListener('pointerdown', handleActivity, true)
      window.removeEventListener('keydown', handleActivity, true)
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
    }
  }, [armIdleTimer, isSleeping, isWaking])

  useEffect(() => () => {
    if (wakeTimerRef.current !== null) {
      window.clearTimeout(wakeTimerRef.current)
    }
  }, [])

  function stopWakePointer(event: PointerEvent<HTMLButtonElement>): void {
    event.stopPropagation()
  }

  function wakeScreen(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (isWaking) {
      return
    }

    setIsWaking(true)
    wakeTimerRef.current = window.setTimeout(() => {
      wakeTimerRef.current = null
      setIsSleeping(false)
      setIsWaking(false)
    }, WAKE_GUARD_MS)
  }

  if (!isSleeping) {
    return null
  }

  return (
    <button
      type="button"
      className={`screen-sleep-guard ${isWaking ? 'is-waking' : ''}`}
      aria-label="Пробудить экран"
      data-testid="screen-sleep-guard"
      onPointerDown={stopWakePointer}
      onPointerUp={stopWakePointer}
      onClick={wakeScreen}
      onContextMenu={wakeScreen}
    />
  )
}
