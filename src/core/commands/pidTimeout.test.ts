import { expect, it, vi } from 'vitest'
import { createMoonrakerCommandClient } from './moonrakerCommandClient'

it('оставляет PID-запрос активным после обычного таймаута и принимает только завершённый ответ', async () => {
  vi.useFakeTimers()
  try {
    let finish!: (response: Response) => void
    let signal: AbortSignal | undefined
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal
      return new Promise<Response>((resolve) => { finish = resolve })
    })
    const client = createMoonrakerCommandClient({ fetchImpl: fetchImpl as typeof fetch })
    const pending = client.execute({ command: 'consoleGcode', script: 'PID_CALIBRATE HEATER=heater_bed TARGET=60' })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(signal?.aborted).toBe(false)
    finish(new Response(JSON.stringify({ result: 'ok' })))
    await expect(pending).resolves.toMatchObject({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    vi.useRealTimers()
  }
})
