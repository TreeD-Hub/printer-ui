import { useEffect, useRef, useState } from 'react'
import { createPrintFeedbackClient, type PrintFeedback, type PrintRating } from '../core/printFeedback'
import type { PrinterSnapshot } from '../core/transport/types'
import { PrintCompletionModal } from './PrintCompletionModal'

type Props = {
  snapshot: PrinterSnapshot
  isPrintBusy: boolean
  restartBlockReason: string | null
  onRestart: (filename: string) => Promise<boolean>
  getRestartError: () => string
  onOpenChange?: (isOpen: boolean) => void
}
type CompletedJob = { id: number; filename: string; source: 'live' | 'mock' }

export function PrintCompletionFlow({ snapshot, onOpenChange, ...actions }: Props) {
  const active = useRef<CompletedJob | null>(null)
  const sequence = useRef(0)
  const [job, setJob] = useState<CompletedJob | null>(null)

  useEffect(() => {
    const state = snapshot.printJob.state
    const source = snapshot.source
    if (active.current !== null && active.current.source !== source) active.current = null
    if (snapshot.transport.state !== 'online' || snapshot.klippy.state !== 'ready') {
      return
    }
    const filename = snapshot.printJob.filename
    if (state === 'printing' || state === 'paused') {
      setJob(null)
      if (!filename) return
      if (active.current === null || active.current.filename !== filename || active.current.source !== source) {
        active.current = { id: ++sequence.current, filename, source }
      }
      return
    }
    const completed = active.current
    active.current = null
    if (state === 'complete' && completed !== null && completed.source === source
      && (!filename || filename === completed.filename)) {
      setJob(completed)
    }
  }, [snapshot.source, snapshot.transport.state, snapshot.klippy.state, snapshot.printJob.state,
    snapshot.printJob.filePath, snapshot.printJob.filename])

  const isOpen = job !== null
  useEffect(() => { onOpenChange?.(isOpen) }, [isOpen, onOpenChange])

  return job === null ? null : (
    <PrintCompletionDialog key={job.id} job={job} {...actions}
      onClose={() => setJob((current) => current?.id === job.id ? null : current)} />
  )
}

function PrintCompletionDialog({ job, isPrintBusy, restartBlockReason, onRestart, getRestartError, onClose }:
  Omit<Props, 'snapshot' | 'onOpenChange'> & { job: CompletedJob; onClose: () => void }) {
  const [client] = useState(() => createPrintFeedbackClient(job.source, `mock-${job.id}`))
  const [feedback, setFeedback] = useState<PrintFeedback | null>(null)
  const [selected, setSelected] = useState<PrintRating | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const alive = useRef(true)
  const feedbackInFlight = useRef(true)
  const startInFlight = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retries = 0
    feedbackInFlight.current = true
    setLoading(true)
    setFeedbackError('')
    async function load() {
      try {
        const result = await client.load(job.filename, controller.signal)
        if (!controller.signal.aborted) { setFeedback(result); setSelected(result.rating) }
      } catch (error: unknown) {
        if (controller.signal.aborted) return
        if (retries < 2 && typeof error === 'object' && error !== null
          && 'statusCode' in error && error.statusCode === 409) {
          retries += 1
          retryTimer = setTimeout(() => { retryTimer = null; void load() }, 500)
          return
        }
        setFeedbackError((error instanceof Error ? error.message : '') || 'Оценка недоступна: нет связи с принтером.')
      } finally {
        if (!controller.signal.aborted && retryTimer === null) {
          feedbackInFlight.current = false
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      controller.abort()
      if (retryTimer !== null) clearTimeout(retryTimer)
    }
  }, [client, job.filename, loadAttempt])

  async function save(rating: PrintRating) {
    if (feedback === null || feedbackInFlight.current || startInFlight.current) return
    if (feedback.rating === rating && !feedbackError) return
    feedbackInFlight.current = true
    setSelected(rating)
    setSaving(true)
    setFeedbackError('')
    try {
      const result = await client.save(feedback, rating)
      if (alive.current) setFeedback(result)
    } catch (error) {
      if (alive.current) setFeedbackError((error instanceof Error ? error.message : '') || 'Не удалось сохранить оценку. Повторите попытку.')
    } finally {
      feedbackInFlight.current = false
      if (alive.current) setSaving(false)
    }
  }

  const unsaved = selected !== null && selected !== feedback?.rating
  const blockReason = restartBlockReason || (unsaved ? 'Сохраните выбранную оценку перед повтором.' : null)

  function close() {
    if (feedbackInFlight.current || startInFlight.current) return
    onClose()
  }

  function retryRating() {
    if (feedbackInFlight.current || startInFlight.current) return
    if (feedback !== null && selected !== null) void save(selected)
    else {
      feedbackInFlight.current = true
      setLoadAttempt((attempt) => attempt + 1)
    }
  }

  async function restart() {
    if (startInFlight.current || feedbackInFlight.current || isPrintBusy || blockReason) return
    startInFlight.current = true
    setStarting(true)
    setStartError('')
    try {
      const success = await onRestart(job.filename)
      if (!alive.current) return
      if (success) onClose()
      else setStartError(getRestartError() || 'Не удалось начать печать. Повторите попытку.')
    } catch (error) {
      if (alive.current) setStartError((error instanceof Error ? error.message : '') || getRestartError() || 'Не удалось начать печать. Повторите попытку.')
    } finally {
      startInFlight.current = false
      if (alive.current) setStarting(false)
    }
  }

  const status = loading ? 'Ищем запись печати…' : saving ? 'Сохраняем оценку…'
    : (feedback?.rating ? `Оценка сохранена: ${feedback.rating === 'good' ? 'хорошо' : 'плохо'}${job.source === 'mock' ? ' (симуляция)' : ''}`
      : job.source === 'mock' ? 'Симуляция: оценка хранится только в этом окне.' : '')

  return (
    <PrintCompletionModal filename={job.filename} rating={selected} ratingStatus={status}
      ratingError={feedbackError || null} isRatingBusy={loading || saving || starting}
      isRatingAvailable={feedback !== null} onRate={(rating) => void save(rating)} onRetryRating={retryRating}
      restartBlockReason={blockReason} restartError={startError || (starting ? 'Запускаем печать…' : null)}
      isPrintBusy={isPrintBusy || starting} onRestart={() => void restart()} onClose={close} />
  )
}
