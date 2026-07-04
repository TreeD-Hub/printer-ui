import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { recordOperationalDiagnostic } from '../diagnostics'
import type { ExcludeObjectControllerArgs } from './types'

const REFRESH_AFTER_COMMAND_MS = 10_000
const CONFIRMATION_TIMEOUT_MS = 20_000

function createPrintSessionKey(snapshot: ExcludeObjectControllerArgs['snapshot']): string {
  return [
    snapshot.printJob.filePath ?? '',
    snapshot.printJob.filename,
    snapshot.printJob.state,
    snapshot.printJob.isActive ? 'active' : 'idle',
  ].join('|')
}

export function getExcludeObjectOpenBlockReason(snapshot: ExcludeObjectControllerArgs['snapshot']): string | null {
  if (snapshot.transport.state !== 'online') {
    return 'Moonraker недоступен: дождитесь восстановления связи.'
  }

  return null
}

export function useExcludeObjectController({
  snapshot,
  isOpen,
  pendingCommand,
  commandError,
  lastResult,
  executeCommand,
  getCommandBlockReason,
  refreshExcludeObjects,
  onClose,
  onRequestStopPrint,
}: ExcludeObjectControllerArgs) {
  const [selectedObjectName, setSelectedObjectName] = useState<string | null>(null)
  const [confirmationObjectName, setConfirmationObjectName] = useState<string | null>(null)
  const [pendingObjectName, setPendingObjectName] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sessionKey = createPrintSessionKey(snapshot)
  const sessionKeyRef = useRef(sessionKey)
  const pendingObjectNameRef = useRef<string | null>(null)
  const refreshTimeoutRef = useRef<number | null>(null)
  const confirmationTimeoutRef = useRef<number | null>(null)

  pendingObjectNameRef.current = pendingObjectName

  const selectedObject = useMemo(() => {
    return snapshot.excludeObjects.objects.find((item) => item.name === selectedObjectName) ?? null
  }, [selectedObjectName, snapshot.excludeObjects.objects])
  const confirmationObject = useMemo(() => {
    return snapshot.excludeObjects.objects.find((item) => item.name === confirmationObjectName) ?? null
  }, [confirmationObjectName, snapshot.excludeObjects.objects])
  const remainingObjectCount = useMemo(() => {
    return snapshot.excludeObjects.objects.filter((item) => (
      !item.isExcluded && !snapshot.excludeObjects.excludedObjectNames.includes(item.name)
    )).length
  }, [snapshot.excludeObjects.excludedObjectNames, snapshot.excludeObjects.objects])
  const selectedObjectBlockReason = selectedObject === null
    ? 'Выберите деталь.'
    : getCommandBlockReason('excludeObject', {
        command: 'excludeObject',
        objectName: selectedObject.name,
      })
  const isSelectedLastRemainingObject = selectedObject !== null && remainingObjectCount <= 1
  const submitLabel = isSelectedLastRemainingObject ? 'Остановить печать' : 'Исключить деталь'
  const submitBlockReason = selectedObjectBlockReason

  const clearTimers = useCallback((): void => {
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = null
    }
    if (confirmationTimeoutRef.current !== null) {
      window.clearTimeout(confirmationTimeoutRef.current)
      confirmationTimeoutRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    clearTimers()
    setSelectedObjectName(null)
    setConfirmationObjectName(null)
    setPendingObjectName(null)
    setNotice(null)
    onClose()
  }, [clearTimers, onClose])

  const selectObject = useCallback((objectName: string): void => {
    const object = snapshot.excludeObjects.objects.find((item) => item.name === objectName)
    if (object === undefined || object.isExcluded || snapshot.excludeObjects.excludedObjectNames.includes(objectName)) {
      return
    }

    setSelectedObjectName(objectName)
    setNotice(null)
    recordOperationalDiagnostic('command', 'exclude-object-selected', JSON.stringify({
      objectName,
      filename: snapshot.printJob.filename,
      printState: snapshot.printJob.state,
    }))
  }, [snapshot.excludeObjects.excludedObjectNames, snapshot.excludeObjects.objects, snapshot.printJob.filename, snapshot.printJob.state])

  const requestSubmit = useCallback((): void => {
    if (selectedObject === null) {
      return
    }

    if (isSelectedLastRemainingObject) {
      close()
      onRequestStopPrint()
      return
    }

    if (submitBlockReason !== null) {
      setNotice(submitBlockReason)
      return
    }

    setConfirmationObjectName(selectedObject.name)
  }, [close, isSelectedLastRemainingObject, onRequestStopPrint, selectedObject, submitBlockReason])

  const confirmExclude = useCallback(async (): Promise<void> => {
    if (confirmationObject === null || pendingObjectNameRef.current !== null) {
      return
    }

    const objectName = confirmationObject.name
    const blockReason = getCommandBlockReason('excludeObject', {
      command: 'excludeObject',
      objectName,
    })
    if (blockReason !== null) {
      setNotice(blockReason)
      setConfirmationObjectName(null)
      return
    }

    clearTimers()
    setPendingObjectName(objectName)
    setNotice('Исключение...')
    recordOperationalDiagnostic('command', 'exclude-object-command-sent', JSON.stringify({
      objectName,
      filename: snapshot.printJob.filename,
      printState: snapshot.printJob.state,
    }))

    refreshTimeoutRef.current = window.setTimeout(() => {
      void refreshExcludeObjects()
    }, REFRESH_AFTER_COMMAND_MS)
    confirmationTimeoutRef.current = window.setTimeout(() => {
      const message = 'Команда отправлена, но Klipper ещё не подтвердил изменение состояния.'
      setNotice(message)
      recordOperationalDiagnostic('command', 'exclude-object-confirmation-timeout', JSON.stringify({
        objectName,
        filename: snapshot.printJob.filename,
        printState: snapshot.printJob.state,
      }))
    }, CONFIRMATION_TIMEOUT_MS)

    const ok = await executeCommand({ command: 'excludeObject', objectName })
    if (!ok) {
      clearTimers()
      setPendingObjectName(null)
      setNotice(commandError || 'Команда исключения не выполнена.')
      recordOperationalDiagnostic('command', 'exclude-object-command-failed', JSON.stringify({
        objectName,
        filename: snapshot.printJob.filename,
        printState: snapshot.printJob.state,
      }))
      return
    }

    setConfirmationObjectName(null)
  }, [clearTimers, commandError, confirmationObject, executeCommand, getCommandBlockReason, refreshExcludeObjects, snapshot.printJob.filename, snapshot.printJob.state])

  useEffect(() => {
    if (!isOpen) {
      clearTimers()
      setSelectedObjectName(null)
      setConfirmationObjectName(null)
      setPendingObjectName(null)
      setNotice(null)
      sessionKeyRef.current = sessionKey
      return
    }

    if (!snapshot.printJob.isActive && !snapshot.printJob.isPaused) {
      close()
      return
    }

    if (sessionKeyRef.current !== sessionKey) {
      close()
      sessionKeyRef.current = sessionKey
    }
  }, [clearTimers, close, isOpen, sessionKey, snapshot.printJob.isActive, snapshot.printJob.isPaused])

  useEffect(() => {
    if (pendingObjectName === null) {
      return
    }

    if (!snapshot.excludeObjects.excludedObjectNames.includes(pendingObjectName)) {
      return
    }

    clearTimers()
    setPendingObjectName(null)
    setNotice('Klipper подтвердил исключение объекта.')
    recordOperationalDiagnostic('command', 'exclude-object-confirmed', JSON.stringify({
      objectName: pendingObjectName,
      filename: snapshot.printJob.filename,
      printState: snapshot.printJob.state,
    }))
  }, [clearTimers, pendingObjectName, snapshot.excludeObjects.excludedObjectNames, snapshot.printJob.filename, snapshot.printJob.state])

  useEffect(() => {
    if (lastResult?.command === 'excludeObject' && !lastResult.ok) {
      setNotice(lastResult.message)
    }
  }, [lastResult])

  useEffect(() => {
    return clearTimers
  }, [clearTimers])

  return {
    selectedObject,
    confirmationObject,
    pendingObjectName,
    notice,
    submitLabel,
    submitBlockReason,
    isCommandPending: pendingCommand === 'excludeObject' || pendingObjectName !== null,
    close,
    selectObject,
    requestSubmit,
    confirmExclude,
    cancelConfirmation: () => setConfirmationObjectName(null),
  }
}
