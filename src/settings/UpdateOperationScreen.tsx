import { useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import watermark from '../assets/treed-watermark.png'
import type { HostUpdateOperation } from '../core/hostUpdate'
import { useModalFocus } from '../ui/useModalFocus'
import './updateOperation.css'

type Props = {
  operation: HostUpdateOperation
  isReconnectPending?: boolean
  onDismiss: () => void
}

type ScreenWakeLock = {
  release: () => Promise<void>
  addEventListener: (type: string, listener: () => void) => void
}

const PHASE_LABELS: Record<HostUpdateOperation['phase'], string> = {
  queued: 'Подготовка обновления',
  validating: 'Проверка пакета',
  downloading: 'Загрузка обновления',
  installing: 'Установка обновления',
  restarting: 'Перезапуск',
  verifying: 'Проверка запуска',
  rolling_back: 'Восстановление предыдущей версии',
  complete: 'Проверка завершена',
  unknown: 'Выполняется обновление',
}

const STATUS_LABELS: Partial<Record<HostUpdateOperation['status'], string>> = {
  queued: 'В очереди',
  running: 'Выполняется',
  applied: 'Загружаем новую версию',
  error: 'Ошибка обновления',
  rolled_back: 'Предыдущая версия восстановлена',
  rejected: 'Обновление не запущено',
  busy: 'Выполняется другая операция',
}

const TERMINAL_STATUSES = new Set<HostUpdateOperation['status']>(['applied', 'error', 'rolled_back', 'rejected'])

const PHASE_DETAILS: Partial<Record<HostUpdateOperation['phase'], string>> = {
  queued: 'Ожидаем начала установки.',
  validating: 'Проверяем пакет и возможность установки.',
  downloading: 'Получаем файлы новой версии.',
  installing: 'Применяем новую версию.',
  restarting: 'Ожидаем запуска после обновления.',
  verifying: 'Проверяем работоспособность новой версии.',
  rolling_back: 'Возвращаем последнюю рабочую версию.',
}

function targetLabel(targetId: HostUpdateOperation['targetId']): string {
  return targetId === 'printer-ui' ? 'Обновление интерфейса' : 'Обновление системы'
}

export function UpdateOperationScreen({ operation, isReconnectPending = false, onDismiss }: Props) {
  const isTerminal = TERMINAL_STATUSES.has(operation.status)
  const canDismiss = isTerminal && operation.status !== 'applied'
  const progress = isReconnectPending ? null : operation.progress
  const statusLabel = STATUS_LABELS[operation.status] ?? 'Состояние обновления'
  const title = isReconnectPending
    ? 'Восстанавливаем связь'
    : isTerminal
      ? statusLabel
      : PHASE_LABELS[operation.phase]
  const repeatsTitle = operation.message.trim().replace(/[.!]+$/u, '') === title

  useLayoutEffect(() => {
    const appRoot = document.getElementById('root')
    const previousInert = appRoot?.inert ?? false
    const previousOverflow = document.body.style.overflow
    if (appRoot) appRoot.inert = true
    document.body.style.overflow = 'hidden'
    return () => {
      if (appRoot) appRoot.inert = previousInert
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const screenRef = useModalFocus<HTMLElement>(true, canDismiss ? onDismiss : undefined)

  useEffect(() => {
    if (canDismiss) screenRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [canDismiss, screenRef])

  useEffect(() => {
    let wakeLock: ScreenWakeLock | null = null
    let isDisposed = false
    let isRequesting = false
    const requestWakeLock = async (): Promise<void> => {
      if (isTerminal || isDisposed || isRequesting || wakeLock || document.visibilityState !== 'visible') return
      isRequesting = true
      try {
        const wakeLockApi = (navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<ScreenWakeLock> }
        }).wakeLock
        if (!wakeLockApi) return
        const nextWakeLock = await wakeLockApi.request('screen')
        if (isDisposed) {
          await nextWakeLock.release()
          return
        }
        wakeLock = nextWakeLock
        wakeLock.addEventListener('release', () => {
          wakeLock = null
        })
      } catch {
        // Устройство может не поддерживать Screen Wake Lock; systemd inhibitor остаётся задачей OS runtime.
      } finally {
        isRequesting = false
      }
    }
    void requestWakeLock()
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && wakeLock === null) void requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      isDisposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (wakeLock) void wakeLock.release()
    }
  }, [isTerminal])

  return createPortal(
    <section ref={screenRef} tabIndex={-1} className="update-operation-screen" role="dialog" aria-modal="true" aria-labelledby="update-operation-title" aria-describedby="update-operation-detail" data-testid="update-operation-screen">
      <header className="update-operation-header">
        <span>{targetLabel(operation.targetId)}</span>
        {operation.targetTag && <span className="update-operation-version">{operation.targetTag}</span>}
      </header>
      <div className="update-operation-content">
        <img className="update-operation-logo" src={watermark} alt="TreeD" width="500" height="144" />
        <div className="update-operation-status" aria-live="polite" aria-atomic="true">
          <h2 id="update-operation-title">{title}</h2>
          <p id="update-operation-detail" className="update-operation-detail">
            {isReconnectPending
              ? 'Ожидаем ответ принтера. Уточняем состояние обновления.'
              : isTerminal ? (repeatsTitle ? '' : operation.message) : PHASE_DETAILS[operation.phase] ?? operation.message}
          </p>
        </div>
        {canDismiss && (
          <div className="update-operation-action">
            <button type="button" className="update-operation-dismiss" onClick={onDismiss} data-testid="update-operation-dismiss" data-modal-initial-focus>
              К обновлениям
            </button>
          </div>
        )}
      </div>
      <footer className="update-operation-footer">
        {!isTerminal && <span>Не выключайте принтер</span>}
      </footer>
      {!isTerminal && (
        <div className="update-operation-progress" role="progressbar"
          aria-label={progress === null ? 'Ход обновления' : `Выполнено ${progress}%`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined}
          aria-valuetext={progress === null ? title : undefined}>
          <div className={`update-operation-progress-track${progress === null ? ' is-indeterminate' : ''}`}>
            {progress !== null && <span style={{ transform: `scaleX(${progress / 100})` }} />}
          </div>
          {progress !== null && <span className="update-operation-percent">{progress}%</span>}
        </div>
      )}
    </section>,
    document.body,
  )
}
