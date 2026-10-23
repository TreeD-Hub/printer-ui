import { afterEach, describe, expect, it, vi } from 'vitest'
import { moonrakerUrl } from '../config'
import { createPrintFeedbackClient, type PrintFeedback } from './printFeedback'

const filename = 'models/деталь #1.gcode'
const feedback: PrintFeedback = { sessionId: 'closed-session-1', filename, rating: null }
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })

afterEach(() => { vi.unstubAllGlobals() })

describe('printFeedback', () => {
  it('читает raw JSON по полному пути и сохраняет выбранную закрытую сессию', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(feedback))
      .mockResolvedValueOnce(json({ ...feedback, rating: 'bad' }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createPrintFeedbackClient('live', 'unused')
    const loaded = await client.load(filename)
    await expect(client.save(loaded, 'bad')).resolves.toEqual({ ...feedback, rating: 'bad' })
    expect(fetchMock.mock.calls[0]).toEqual([
      `${moonrakerUrl}/server/treed/print-feedback?filename=${encodeURIComponent(filename)}`,
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
    ])
    expect(fetchMock.mock.calls[1]).toEqual([
      `${moonrakerUrl}/server/treed/print-feedback`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ ...feedback, rating: 'bad' }) }),
    ])
  })

  it.each([
    null, { result: feedback }, { ...feedback, sessionId: '' },
    { ...feedback, filename: 'other.gcode' }, { ...feedback, rating: 'unknown' },
  ])('отклоняет чужой или неверный ответ %j', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(response)))
    await expect(createPrintFeedbackClient('live', '').load(filename)).rejects.toThrow('не подтвердил')
  })

  it.each([
    { ...feedback, sessionId: 'different-session', rating: 'good' },
    { ...feedback, rating: 'bad' },
  ])('не считает оценку сохранённой без подтверждения id и значения', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(response)))
    await expect(createPrintFeedbackClient('live', '').save(feedback, 'good')).rejects.toThrow('не подтвердил')
  })

  it('отклоняет невалидный запрос до отправки', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = createPrintFeedbackClient('live', '')
    await expect(client.load('')).rejects.toThrow('Не указан файл')
    await expect(client.save({ ...feedback, sessionId: '' }, 'good')).rejects.toThrow('не подтвердил')
    await expect(client.save(feedback, 'invalid' as 'good')).rejects.toThrow('не подтвердил')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('показывает отсутствие сессии и ошибку HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 503 })))
    const client = createPrintFeedbackClient('live', '')
    await expect(client.load(filename)).rejects.toMatchObject({ message: expect.stringContaining('не найдена'), statusCode: 404 })
    await expect(client.load(filename)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('прерывает зависшее чтение по таймауту 5 секунд', async () => {
    vi.useFakeTimers()
    let requestSignal!: AbortSignal
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init.signal as AbortSignal
      requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const request = createPrintFeedbackClient('live', '').load(filename)
      const timedOut = expect(request).rejects.toMatchObject({ name: 'TimeoutError' })
      await vi.advanceTimersByTimeAsync(5_000)
      await timedOut
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(requestSignal.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('работает в Chromium без AbortSignal.any', async () => {
    const any = vi.spyOn(AbortSignal, 'any').mockImplementation(() => { throw new TypeError('AbortSignal.any is unavailable') })
    vi.useFakeTimers()
    const controller = new AbortController()
    const reason = new Error('user cancelled')
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const requestSignal = init.signal as AbortSignal
      requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const client = createPrintFeedbackClient('live', '')
      const request = client.load(filename, controller.signal)
      controller.abort(reason)
      await expect(request).rejects.toBe(reason)
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
      expect(vi.getTimerCount()).toBe(0)

      const alreadyAborted = new AbortController()
      alreadyAborted.abort(reason)
      await expect(client.load(filename, alreadyAborted.signal)).rejects.toBe(reason)
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      any.mockRestore()
      vi.useRealTimers()
    }
  })

  it('в mock не обращается к принтеру и не переносит оценку в следующую печать', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const first = createPrintFeedbackClient('mock', 'mock-1')
    const second = createPrintFeedbackClient('mock', 'mock-2')
    const loaded = await first.load(filename)
    await expect(first.save(loaded, 'good')).resolves.toEqual({ ...loaded, rating: 'good' })
    await expect(second.load(filename)).resolves.toEqual({ sessionId: 'mock-2', filename, rating: null })
    await expect(second.save(loaded, 'bad')).rejects.toThrow('не найдена')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
