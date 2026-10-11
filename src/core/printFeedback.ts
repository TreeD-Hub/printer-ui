import { moonrakerUrl } from '../config'

export type PrintRating = 'good' | 'bad'
export type PrintFeedback = { sessionId: string; filename: string; rating: PrintRating | null }

function validateFeedback(value: unknown, filename: string): PrintFeedback {
  if (typeof value !== 'object' || value === null
    || !('sessionId' in value) || typeof value.sessionId !== 'string' || value.sessionId.trim() === ''
    || !('filename' in value) || value.filename !== filename
    || !('rating' in value) || ![null, 'good', 'bad'].includes(value.rating as PrintRating | null)) {
    throw new Error('Принтер не подтвердил запись этой печати.')
  }
  return value as PrintFeedback
}

export function createPrintFeedbackClient(source: 'live' | 'mock', mockSessionId: string) {
  let mockFeedback: PrintFeedback | null = null

  async function request(filename: string, feedback?: PrintFeedback, signal?: AbortSignal): Promise<PrintFeedback> {
    if (typeof filename !== 'string' || filename.trim() === '') throw new Error('Не указан файл завершённой печати.')
    if (feedback !== undefined) {
      validateFeedback(feedback, filename)
      if (feedback.rating === null) throw new Error('Выберите оценку печати.')
    }
    if (source === 'mock') {
      if (feedback !== undefined && (mockFeedback === null || feedback.sessionId !== mockFeedback.sessionId
        || filename !== mockFeedback.filename)) throw new Error('Запись этой печати не найдена.')
      mockFeedback = feedback ?? mockFeedback ?? { sessionId: mockSessionId, filename, rating: null }
      return { ...validateFeedback(mockFeedback, filename) }
    }
    const url = `${moonrakerUrl}/server/treed/print-feedback`
    const response = await fetch(feedback === undefined ? `${url}?filename=${encodeURIComponent(filename)}` : url, {
      method: feedback === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: feedback === undefined ? undefined : JSON.stringify(feedback),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
    })
    if (response.status === 404) throw Object.assign(new Error('Оценка недоступна: запись этой печати не найдена.'), { statusCode: response.status })
    if (!response.ok) throw Object.assign(new Error(`Оценка недоступна: ошибка принтера (HTTP ${response.status}).`), { statusCode: response.status })
    const confirmed = validateFeedback(await response.json(), filename)
    if (feedback !== undefined && (confirmed.sessionId !== feedback.sessionId || confirmed.rating !== feedback.rating)) {
      throw new Error('Принтер не подтвердил сохранение выбранной оценки.')
    }
    return confirmed
  }

  return {
    load: (filename: string, signal?: AbortSignal) => request(filename, undefined, signal),
    save: (feedback: PrintFeedback, rating: PrintRating) => request(feedback.filename, { ...feedback, rating }),
  }
}
