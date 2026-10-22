import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSnapshot } from '../../mocks/runtime'
import type { PrintFeedback, PrintRating } from '../core/printFeedback'
import type { PrinterSnapshot } from '../core/transport/types'
import { PrintCompletionFlow } from './PrintCompletionFlow'

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), create: vi.fn() }))
vi.mock('../core/printFeedback', () => ({
  createPrintFeedbackClient: (source: string, id: string) => {
    api.create(source, id)
    return { load: api.load, save: api.save }
  },
}))

const filename = 'models/деталь.gcode'
const feedback: PrintFeedback = { sessionId: 'closed-1', filename, rating: null }

function snapshot(state: PrinterSnapshot['printJob']['state'], path = filename): PrinterSnapshot {
  const value = createMockSnapshot()
  return { ...value, source: 'live', transport: { state: 'online', message: null },
    klippy: { state: 'ready', message: '' },
    printJob: { ...value.printJob, state, filePath: path, filename: path } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function mount(initial = snapshot('printing'), overrides = {}) {
  const props = { isPrintBusy: false, restartBlockReason: null,
    onRestart: vi.fn<(filename: string) => Promise<boolean>>().mockResolvedValue(true),
    getRestartError: () => '', ...overrides }
  const view = render(<PrintCompletionFlow snapshot={initial} {...props} />)
  return { ...view, props,
    change: (next: PrinterSnapshot) => view.rerender(<PrintCompletionFlow snapshot={next} {...props} />) }
}

async function complete(view: ReturnType<typeof mount>, next = snapshot('complete')) {
  view.change(next)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Хорошо' })).toBeEnabled())
}

beforeEach(() => {
  vi.clearAllMocks()
  api.load.mockReset().mockResolvedValue(feedback)
  api.save.mockReset().mockImplementation((loaded: PrintFeedback, rating: PrintRating) => Promise.resolve({ ...loaded, rating }))
})

describe('PrintCompletionFlow', () => {
  it('фиксирует фактическую статистику завершённой печати и массу её файла', async () => {
    const view = mount()
    const done = snapshot('complete')
    done.printJob.printDurationSec = 6000
    done.printJob.filamentUsedMm = 7340
    done.printFiles = [
      { ...done.printFiles[0], path: 'other.gcode', weight: '99 г' },
      { ...done.printFiles[0], path: filename, weight: '22 г' },
    ]
    await complete(view, done)
    expect(screen.getByText('1 ч 40 мин')).toBeVisible()
    expect(screen.getByText('7,34 м')).toBeVisible()
    expect(screen.getByText('22 г')).toBeVisible()
    expect(screen.queryByText('99 г')).not.toBeInTheDocument()
    view.change(snapshot('idle'))
    expect(screen.getByText('1 ч 40 мин')).toBeVisible()
    expect(screen.getByText('7,34 м')).toBeVisible()
    expect(screen.getByText('22 г')).toBeVisible()
  })

  it('не подменяет отсутствующую статистику и массу оценочными значениями', async () => {
    const view = mount()
    const done = snapshot('complete')
    done.printJob.printDurationSec = Number.NaN
    done.printJob.filamentUsedMm = -1
    done.printFiles = []
    await complete(view, done)
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('не открывает старую завершённую печать после загрузки приложения', () => {
    mount(snapshot('complete'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.load).not.toHaveBeenCalled()
  })

  it.each(['cancelled', 'error'] as const)('не открывает окно после %s', (state) => {
    const view = mount()
    view.change(snapshot(state))
    view.change(snapshot('complete'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('не принимает завершение другого файла за наблюдаемую печать', () => {
    const view = mount()
    view.change(snapshot('complete', 'other.gcode'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('сохраняет путь после paused и не открывается повторно от дубликата complete', async () => {
    const view = mount(snapshot('paused'))
    await complete(view, snapshot('complete', ''))
    expect(api.load).toHaveBeenCalledWith(filename, expect.any(AbortSignal))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    view.change(snapshot('complete'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.load).toHaveBeenCalledTimes(1)
  })

  it('использует относительный путь print_stats для оценки и повтора печати', async () => {
    const onRestart = vi.fn().mockResolvedValue(true)
    const view = mount(snapshot('printing', 'jobs/benchy.gcode'), { onRestart })
    const completed = snapshot('complete', 'jobs/benchy.gcode')
    completed.printJob.filePath = '/gcodes/jobs/benchy.gcode'
    await complete(view, completed)
    expect(api.load).toHaveBeenCalledWith('jobs/benchy.gcode', expect.any(AbortSignal))
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Печатать снова' }))
    })
    expect(onRestart).toHaveBeenCalledExactlyOnceWith('jobs/benchy.gcode')
  })

  it('открывает новую печать того же файла с новым окном и сброшенным подтверждением', async () => {
    const view = mount()
    await complete(view)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    view.change(snapshot('printing'))
    await complete(view)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(api.load).toHaveBeenCalledTimes(2)
    expect(api.create.mock.calls[0][1]).not.toBe(api.create.mock.calls[1][1])
  })

  it('не использует offline complete и дожидается восстановления связи', async () => {
    const view = mount()
    const offline = snapshot('complete')
    offline.transport.state = 'offline'
    view.change(offline)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await complete(view)
  })

  it('не переносит наблюдаемую печать между mock и live источниками', () => {
    const view = mount()
    const other = snapshot('complete')
    other.source = 'mock'
    view.change(other)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('повторяет чтение при недоступности оценки', async () => {
    api.load.mockRejectedValueOnce(new Error('Запись ещё недоступна'))
    const view = mount()
    view.change(snapshot('complete'))
    expect(await screen.findByText('Запись ещё недоступна')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Хорошо' })).toBeEnabled())
    expect(api.load).toHaveBeenCalledTimes(2)
  })

  it('повторяет GET после временного HTTP 409', async () => {
    api.load.mockRejectedValueOnce(Object.assign(new Error('Сессия закрывается'), { statusCode: 409 }))
      .mockResolvedValueOnce(feedback)
    const view = mount()
    await complete(view)
    expect(api.load).toHaveBeenCalledTimes(2)
  })

  it('отменяет отложенный повтор GET при закрытии задания', async () => {
    vi.useFakeTimers()
    try {
      api.load.mockRejectedValueOnce(Object.assign(new Error('Сессия закрывается'), { statusCode: 409 }))
      const view = mount()
      await act(async () => {
        view.change(snapshot('complete'))
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(api.load).toHaveBeenCalledTimes(1)
      view.change(snapshot('printing'))
      await act(async () => { await vi.advanceTimersByTimeAsync(500) })
      expect(api.load).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('не закрывается и не запускает печать во время сохранения; повтор оценки не отправляет POST', async () => {
    const pending = deferred<PrintFeedback>()
    api.save.mockReturnValueOnce(pending.promise)
    const view = mount()
    await complete(view)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Хорошо' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Печатать снова' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(view.props.onRestart).not.toHaveBeenCalled()
    await act(async () => { pending.resolve({ ...feedback, rating: 'good' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Хорошо' }))
    expect(api.save).toHaveBeenCalledTimes(1)
  })

  it('оставляет выбранную оценку и повторяет запись в тот же sessionId после ошибки', async () => {
    api.save.mockRejectedValueOnce(new Error('Нет связи'))
    const view = mount()
    await complete(view)
    fireEvent.click(screen.getByRole('button', { name: 'Плохо' }))
    expect(await screen.findByText('Нет связи')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Плохо' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Печатать снова' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Печатать снова' })).toBeEnabled())
    expect(api.save.mock.calls).toEqual([[feedback, 'bad'], [feedback, 'bad']])
  })

  it('требует снятия детали и блокирует double tap на повтор полного пути', async () => {
    const pending = deferred<boolean>()
    const onRestart = vi.fn().mockReturnValue(pending.promise)
    const view = mount(snapshot('printing'), { onRestart })
    await complete(view)
    const button = screen.getByRole('button', { name: 'Печатать снова' })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    act(() => { fireEvent.click(button); fireEvent.click(button) })
    expect(onRestart).toHaveBeenCalledExactlyOnceWith(filename)
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled()
    await act(async () => { pending.resolve(true) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([{ isPrintBusy: true }, { restartBlockReason: 'Запуск запрещён' }])('сохраняет guard повторного запуска %j', async (overrides) => {
    const view = mount(snapshot('printing'), overrides)
    view.change(snapshot('complete'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Закрыть' })).toBeEnabled())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Печатать снова' }))
    expect(view.props.onRestart).not.toHaveBeenCalled()
  })

  it.each([false, new Error('Команда не отправлена')])('показывает отказ запуска и оставляет окно: %s', async (result) => {
    const onRestart = result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result)
    const view = mount(snapshot('printing'), { onRestart, getRestartError: () => 'Принтер отклонил команду' })
    await complete(view)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Печатать снова' }))
    expect(await screen.findByText(result instanceof Error ? result.message : 'Принтер отклонил команду')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('поздний GET старой печати не меняет окно нового задания', async () => {
    const old = deferred<PrintFeedback>()
    api.load.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...feedback, sessionId: 'closed-2', rating: 'bad' })
    const view = mount()
    view.change(snapshot('complete'))
    view.change(snapshot('printing'))
    view.change(snapshot('complete'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Плохо' })).toHaveAttribute('aria-pressed', 'true'))
    expect((api.load.mock.calls[0][1] as AbortSignal).aborted).toBe(true)
    await act(async () => { old.resolve({ ...feedback, rating: 'good' }) })
    expect(screen.getByRole('button', { name: 'Плохо' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('новая печать во время POST не переназначает сохранение и его результат', async () => {
    const old = deferred<PrintFeedback>()
    api.save.mockReturnValueOnce(old.promise)
    const view = mount()
    await complete(view)
    fireEvent.click(screen.getByRole('button', { name: 'Хорошо' }))
    view.change(snapshot('printing', 'other.gcode'))
    api.load.mockResolvedValueOnce({ sessionId: 'closed-2', filename: 'other.gcode', rating: null })
    await complete(view, snapshot('complete', 'other.gcode'))
    await act(async () => { old.resolve({ ...feedback, rating: 'good' }) })
    expect(api.save).toHaveBeenCalledExactlyOnceWith(feedback, 'good')
    expect(screen.getByRole('button', { name: 'Хорошо' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('other.gcode')).toBeInTheDocument()
  })

  it('StrictMode отменяет прежний GET, не теряя повторное чтение', async () => {
    const old = deferred<PrintFeedback>()
    api.load.mockReturnValueOnce(old.promise)
    const props = { isPrintBusy: false, restartBlockReason: null, onRestart: vi.fn().mockResolvedValue(true), getRestartError: () => '' }
    const view = render(<StrictMode><PrintCompletionFlow snapshot={snapshot('printing')} {...props} /></StrictMode>)
    view.rerender(<StrictMode><PrintCompletionFlow snapshot={snapshot('complete')} {...props} /></StrictMode>)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Хорошо' })).toBeEnabled())
    expect((api.load.mock.calls[0][1] as AbortSignal).aborted).toBe(true)
    await act(async () => { old.resolve({ ...feedback, rating: 'bad' }) })
    expect(screen.getByRole('button', { name: 'Плохо' })).toHaveAttribute('aria-pressed', 'false')
  })
})
