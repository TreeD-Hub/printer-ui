import {
  filterWifiNetworks,
  getPreferredWifiNetworkId,
  type WifiNetworkItem,
} from '@treed/printer-logic'
import { runtimeMode } from '#runtime'
import { usePrinterNotifications } from '../core/store/printerNotifications'
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import { downloadDiagnosticReport } from '../diagnostics'
import {
  areHostNetworkStatusesEqual,
  createUnavailableHostNetworkStatus,
  getHostNetworkErrorMessage,
  type HostNetworkClient,
  type HostNetworkStatus,
} from '../core/hostNetwork'
import {
  isMoonrakerHostUpdateEndpointUnavailable,
  isHostUpdateRequestRejected,
  getHostUpdateErrorMessage,
  type HostUpdateClient,
  type HostUpdateOperation,
  type HostUpdateStatus,
  type HostUpdateTargetId,
} from '../core/hostUpdate'
import { isPrintJobActive, type PrinterSnapshot } from '../core/transport/types'
import {
  DEFAULT_TIMEZONE_OPTION,
  LANGUAGE_OPTIONS,
  SLEEP_MODE_OPTIONS,
  TIMEZONE_OPTIONS,
  PRINTER_UI_CURRENT_VERSION,
  UPDATE_RELEASE_TARGETS,
  type SettingsGroupId,
} from './config'
import type { SettingsPageProps } from './SettingsPage'
import {
  checkUpdateReleases,
  createMockUpdateReleaseResults,
  createUnknownUpdateReleaseResults,
} from './updateReleaseClient'

export type { WifiNetworkItem } from '@treed/printer-logic'

export type SettingsKeyboardTarget = 'wifiSearch' | 'wifiPassword' | 'consoleCommand'

type SettingsKeyboardMeta = {
  valueLabel: string
  placeholder: string
  testId: string
  previewTestId: string
  isMultiline: boolean
}

type UseSettingsControllerArgs = {
  snapshot: PrinterSnapshot
  connectionLabel: string
  networkClient: HostNetworkClient
  updateClient: HostUpdateClient
  onUpdateApplied?: () => void
  executeCommand: (args: ExecuteCommandArgs) => Promise<boolean>
  getCommandBlockReason: (command: PrinterCommandId, args?: ExecuteCommandArgs) => string | null
  activeKeyboardTarget: SettingsKeyboardTarget | null
  openKeyboard: (target: SettingsKeyboardTarget) => void
  closeKeyboard: () => void
}

type SettingsKeyboardController = {
  value: string
  meta: SettingsKeyboardMeta | null
  isConsoleOpen: boolean
  onKeyPress: (key: string, selection?: KeyboardSelectionRange) => void
  onPreviewChange: (value: string, selection: KeyboardSelectionRange) => void
}

type KeyboardSelectionRange = {
  selectionStart: number
  selectionEnd: number
}

type UseSettingsControllerResult = {
  activeSettingsGroup: SettingsGroupId
  pageProps: SettingsPageProps
  keyboard: SettingsKeyboardController
  isKeyboardTargetAllowed: (target: SettingsKeyboardTarget) => boolean
}

export function isSettingsKeyboardTarget(target: string | null): target is SettingsKeyboardTarget {
  return target === 'wifiSearch' || target === 'wifiPassword' || target === 'consoleCommand'
}

export function getSettingsKeyboardMeta(target: SettingsKeyboardTarget): SettingsKeyboardMeta {
  if (target === 'wifiSearch') {
    return {
      valueLabel: 'Ввод имени сети',
      placeholder: 'Введите имя сети...',
      testId: 'settings-wifi-search-keyboard',
      previewTestId: 'settings-wifi-search-keyboard-preview',
      isMultiline: false,
    }
  }

  if (target === 'wifiPassword') {
    return {
      valueLabel: 'Ввод пароля',
      placeholder: 'Введите пароль...',
      testId: 'settings-wifi-keyboard',
      previewTestId: 'settings-wifi-keyboard-preview',
      isMultiline: false,
    }
  }

  return {
    valueLabel: 'Ввод команды',
    placeholder: 'Введите команду...',
    testId: 'settings-console-keyboard',
    previewTestId: 'settings-console-keyboard-preview',
    isMultiline: true,
  }
}

export function useSettingsController({
  snapshot,
  connectionLabel,
  networkClient,
  updateClient,
  onUpdateApplied,
  executeCommand,
  getCommandBlockReason,
  activeKeyboardTarget,
  openKeyboard,
  closeKeyboard,
}: UseSettingsControllerArgs): UseSettingsControllerResult {
  const [activeSettingsGroup, setActiveSettingsGroup] = useState<SettingsGroupId>('system')
  const [isDarkThemeEnabled, setIsDarkThemeEnabled] = useState<boolean>(true)
  const [isMaxPerformanceModeEnabled, setIsMaxPerformanceModeEnabled] = useState<boolean>(false)
  const [sleepModeValue, setSleepModeValue] = useState<string>(SLEEP_MODE_OPTIONS[2])
  const [timezoneValue, setTimezoneValue] = useState<string>(
    TIMEZONE_OPTIONS.find((option) => option === DEFAULT_TIMEZONE_OPTION) ?? TIMEZONE_OPTIONS[0],
  )
  const [languageValue, setLanguageValue] = useState<string>(LANGUAGE_OPTIONS[0])
  const [isExternalVoiceEnabled, setIsExternalVoiceEnabled] = useState<boolean>(false)
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState<boolean>(true)
  const [isNotificationSoundsEnabled, setIsNotificationSoundsEnabled] = useState<boolean>(true)
  const printerNotifications = usePrinterNotifications()
  const notificationHistory = printerNotifications.history.map((entry) => ({
    ...entry, createdAt: new Date(entry.receivedAt).toLocaleTimeString('ru-RU'),
  }))
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false)
  const [isCloudAiMonitoringEnabled, setIsCloudAiMonitoringEnabled] = useState<boolean>(false)
  const [cloudConnectionNotice, setCloudConnectionNotice] = useState<string>('Сервис облака не подключен.')
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false)
  const [applyingUpdateTarget, setApplyingUpdateTarget] = useState<HostUpdateTargetId | null>(null)
  const [pausedUpdateTarget, setPausedUpdateTarget] = useState<HostUpdateTargetId | null>(null)
  const [updateOperation, setUpdateOperation] = useState<HostUpdateOperation | null>(null)
  const pendingUpdateRef = useRef<(Pick<HostUpdateOperation, 'operationId' | 'requestId' | 'targetId' | 'targetTag'> & { errorMessage?: string }) | null>(null)
  const [supportsCombinedUpdate, setSupportsCombinedUpdate] = useState(false)
  const updateSubmitInFlight = useRef(false)
  const isUpdateOperationActive = updateOperation !== null &&
    !['applied', 'error', 'rolled_back', 'rejected'].includes(updateOperation.status)
  const [isUpdateReconnectPending, setIsUpdateReconnectPending] = useState(false)
  const [dismissedUpdateOperationId, setDismissedUpdateOperationId] = useState<string | null>(null)
  const updateOperationId = updateOperation?.operationId ?? updateOperation?.requestId ?? updateOperation?.status ?? null
  const [updateReleaseResults, setUpdateReleaseResults] = useState(() =>
    runtimeMode === 'mock'
      ? createMockUpdateReleaseResults(UPDATE_RELEASE_TARGETS)
      : createUnknownUpdateReleaseResults(UPDATE_RELEASE_TARGETS),
  )
  const [updateNotice, setUpdateNotice] = useState<string>('')
  const [canResetOverrides, setCanResetOverrides] = useState(false)
  const [isResettingOverrides, setIsResettingOverrides] = useState(false)
  const resetInFlight = useRef(false)
  const [resetOverridesNotice, setResetOverridesNotice] = useState('')
  const [consoleCommandValue, setConsoleCommandValue] = useState<string>('')
  const [pendingConsoleCommand, setPendingConsoleCommand] = useState<string | null>(null)
  const [consoleHistory, setConsoleHistory] = useState<Array<{ id: string; command: string; createdAt: string }>>([])
  const [consoleNotice, setConsoleNotice] = useState<string>('Введите G-code или макрос и отправьте команду.')
  const [hostNetworkStatus, setHostNetworkStatus] = useState<HostNetworkStatus>(() =>
    createUnavailableHostNetworkStatus('Host network bridge недоступен.'),
  )
  const [isNetworkBusy, setIsNetworkBusy] = useState<boolean>(false)
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetworkItem[]>([])
  const [wifiSearchQuery, setWifiSearchQuery] = useState<string>('')
  const [selectedWifiNetworkId, setSelectedWifiNetworkId] = useState<string | null>(null)
  const [wifiPasswordValue, setWifiPasswordValue] = useState<string>('')
  const [isWifiPasswordVisible, setIsWifiPasswordVisible] = useState<boolean>(false)
  const [wifiConnectionNotice, setWifiConnectionNotice] = useState<string>('')
  const wifiSearchInputRef = useRef<HTMLInputElement | null>(null)
  const wifiPasswordInputRef = useRef<HTMLInputElement | null>(null)
  const consoleInputRef = useRef<HTMLTextAreaElement | null>(null)
  const isNetworkCapabilityAvailable = hostNetworkStatus.available
  const isCloudCapabilityAvailable = snapshot.capabilities.cloud
  const isUpdatesCapabilityAvailable = runtimeMode === 'mock' || typeof fetch === 'function'
  const isActivePrintJob = isPrintJobActive(snapshot.printJob)
  const isUpdateBlockedByActivePrint = isActivePrintJob && snapshot.printJob.state !== 'paused'
  const wifiIpLabel = hostNetworkStatus.ipAddress ?? '—'
  const networkCapabilityNotice = isNetworkCapabilityAvailable
    ? hostNetworkStatus.message
    : hostNetworkStatus.message === 'Failed to fetch'
      ? 'Нет связи со службой Wi-Fi принтера. Проверьте соединение и повторите попытку.'
      : 'Управление Wi-Fi пока недоступно на этом принтере.'
  const cloudCapabilityNotice = isCloudCapabilityAvailable
    ? cloudConnectionNotice
    : 'Облачный сервис пока недоступен на этом принтере.'
  const updateCapabilityNotice = isUpdatesCapabilityAvailable
    ? updateNotice
    : 'Проверка обновлений недоступна в этом режиме интерфейса.'
  const selectedWifiNetwork = useMemo(() => {
    if (selectedWifiNetworkId === null) {
      return null
    }

    return wifiNetworks.find((item) => item.id === selectedWifiNetworkId) ?? null
  }, [selectedWifiNetworkId, wifiNetworks])
  const filteredWifiNetworks = useMemo(
    () => filterWifiNetworks(wifiNetworks, wifiSearchQuery),
    [wifiNetworks, wifiSearchQuery],
  )
  const connectedWifiNetwork = useMemo(
    () => wifiNetworks.find((item) => item.connected) ?? null,
    [wifiNetworks],
  )
  const keyboardMeta = activeKeyboardTarget === null ? null : getSettingsKeyboardMeta(activeKeyboardTarget)
  const keyboardValue = activeKeyboardTarget === 'wifiSearch'
    ? wifiSearchQuery
    : activeKeyboardTarget === 'wifiPassword'
      ? wifiPasswordValue
      : activeKeyboardTarget === 'consoleCommand'
        ? consoleCommandValue
        : ''

  const setKeyboardValue = useCallback((target: SettingsKeyboardTarget, nextValue: string): void => {
    if (target === 'wifiSearch') {
      setWifiSearchQuery(nextValue)
    } else if (target === 'wifiPassword') {
      setWifiPasswordValue(nextValue)
    } else {
      setConsoleCommandValue(nextValue)
      setPendingConsoleCommand(null)
    }
  }, [])

  const setKeyboardCaret = useCallback((target: SettingsKeyboardTarget, nextCaret: number): void => {
    if (typeof window === 'undefined') {
      return
    }

    window.requestAnimationFrame(() => {
      const input = target === 'wifiSearch'
        ? wifiSearchInputRef.current
        : target === 'wifiPassword'
          ? wifiPasswordInputRef.current
          : consoleInputRef.current
      if (input === null) {
        return
      }
      input.focus()
      input.setSelectionRange(nextCaret, nextCaret)
    })
  }, [])

  const applyHostNetworkStatus = useCallback((nextStatus: HostNetworkStatus, notice?: string): void => {
    setHostNetworkStatus((currentStatus) =>
      areHostNetworkStatusesEqual(currentStatus, nextStatus) ? currentStatus : nextStatus,
    )
    setWifiNetworks((currentNetworks) =>
      areHostNetworkStatusesEqual(
        { ...nextStatus, networks: currentNetworks },
        nextStatus,
      )
        ? currentNetworks
        : nextStatus.networks,
    )
    setSelectedWifiNetworkId((previousNetworkId) =>
      getPreferredWifiNetworkId(nextStatus.networks, previousNetworkId),
    )
    if (notice !== undefined) {
      setWifiConnectionNotice(notice)
    }
  }, [])

  const applyHostNetworkError = useCallback((error: unknown, fallback: string): void => {
    const message = getHostNetworkErrorMessage(error, fallback)
    applyHostNetworkStatus(createUnavailableHostNetworkStatus(message), message)
  }, [applyHostNetworkStatus])

  const refreshHostNetworkStatus = useCallback((isDisposed: () => boolean = () => false): void => {
    void networkClient.getStatus()
      .then((nextStatus) => {
        if (!isDisposed()) {
          applyHostNetworkStatus(nextStatus)
        }
      })
      .catch((error: unknown) => {
        if (!isDisposed()) {
          applyHostNetworkError(error, 'Не удалось получить статус Wi-Fi.')
        }
      })
  }, [applyHostNetworkError, applyHostNetworkStatus, networkClient])

  const consumeUpdateStatus = useCallback((status: HostUpdateStatus): void => {
    setCanResetOverrides(status.canResetOverrides === true)
    applyHostUpdateStatus(status)
    const activeOperation = status.operation ?? (status.busy ? {
      operationId: null,
      requestId: null,
      status: 'running' as const,
      phase: 'unknown' as const,
      progress: null,
      resultCode: null,
      message: status.message || 'Операция обновления продолжается.',
      targetId: status.targetId,
      targetTag: status.targetTag,
      startedAt: null,
      updatedAt: null,
      finishedAt: null,
    } : null)
    const nextOperation = activeOperation ?? status.latestOperation ?? null
    const isApplied = !status.busy && nextOperation?.status === 'applied'
    const pending = pendingUpdateRef.current
    const isSameOperation = pending !== null && nextOperation !== null && (
      pending.operationId && nextOperation.operationId
        ? pending.operationId === nextOperation.operationId
        : pending.requestId && nextOperation.requestId
          ? pending.requestId === nextOperation.requestId
          : pending.targetId === nextOperation.targetId && pending.targetTag === nextOperation.targetTag
    )
    if (nextOperation && !['applied', 'error', 'rolled_back', 'rejected'].includes(nextOperation.status)) {
      pendingUpdateRef.current = nextOperation
    } else if (nextOperation) {
      pendingUpdateRef.current = null
    }
    // Исторический успех после загрузки страницы не открывает заставку и не создаёт цикл reload.
    setUpdateOperation(isApplied ? null : nextOperation)
    setIsUpdateReconnectPending(false)
    if (nextOperation && !isApplied) {
      setUpdateNotice(nextOperation.message)
    } else if (nextOperation === null && !status.busy && pending?.errorMessage) {
      // Подтверждённый idle не должен стирать ошибку запуска при повторном опросе.
      setUpdateNotice(pending.errorMessage)
      pendingUpdateRef.current = null
    }
    if (isApplied && isSameOperation) onUpdateApplied?.()
  }, [onUpdateApplied])

  useEffect(() => {
    let isDisposed = false

    refreshHostNetworkStatus(() => isDisposed)

    return () => {
      isDisposed = true
    }
  }, [refreshHostNetworkStatus])

  const handleSettingsGroupChange = useCallback((nextGroup: SettingsGroupId): void => {
    setActiveSettingsGroup(nextGroup)
    if (nextGroup === 'network') {
      refreshHostNetworkStatus()
    }
  }, [refreshHostNetworkStatus])

  useEffect(() => {
    let isDisposed = false

    void updateClient.getStatus()
      .then((status) => {
        if (!isDisposed) {
          consumeUpdateStatus(status)
        }
      })
      .catch((error: unknown) => {
        if (!isDisposed && !isMoonrakerHostUpdateEndpointUnavailable(error)) {
          setUpdateNotice(getHostUpdateErrorMessage(error, 'Не удалось получить состояние обновлений.'))
        }
      })

    return () => {
      isDisposed = true
    }
  }, [consumeUpdateStatus, updateClient])

  useEffect(() => {
    if (!isUpdateOperationActive) {
      return
    }
    let isDisposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const status = await updateClient.getStatus()
        if (isDisposed) return
        consumeUpdateStatus(status)
      } catch {
        if (isDisposed) return
        setIsUpdateReconnectPending(true)
      }
      if (!isDisposed) timer = setTimeout(() => void poll(), 1800)
    }
    timer = setTimeout(() => void poll(), 900)
    return () => {
      isDisposed = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [consumeUpdateStatus, updateClient, isUpdateOperationActive])

  useEffect(() => {
    if (updateOperationId !== dismissedUpdateOperationId) {
      setDismissedUpdateOperationId(null)
    }
  }, [dismissedUpdateOperationId, updateOperationId])

  function handleWifiSearchQueryChange(event: ChangeEvent<HTMLInputElement>): void {
    setWifiSearchQuery(event.target.value)
  }

  function handleWifiSearchInputFocus(): void {
    openKeyboard('wifiSearch')
  }

  function handleWifiScan(): void {
    if (!isNetworkCapabilityAvailable || isNetworkBusy) {
      setWifiConnectionNotice(networkCapabilityNotice)
      return
    }

    setIsNetworkBusy(true)
    setWifiConnectionNotice('Поиск Wi-Fi сетей...')
    void networkClient.scan()
      .then((nextStatus) => {
        applyHostNetworkStatus(nextStatus, 'Список Wi-Fi сетей обновлен.')
      })
      .catch((error: unknown) => {
        setWifiConnectionNotice(getHostNetworkErrorMessage(error, 'Не удалось обновить список Wi-Fi сетей.'))
      })
      .finally(() => {
        setIsNetworkBusy(false)
      })
  }

  function handleWifiNetworkSelect(networkId: string): void {
    if (!isNetworkCapabilityAvailable || isNetworkBusy) {
      return
    }

    setSelectedWifiNetworkId(networkId)
    setWifiConnectionNotice('')
    setWifiPasswordValue('')
    setIsWifiPasswordVisible(false)
  }

  function handleWifiPasswordChange(event: ChangeEvent<HTMLInputElement>): void {
    setWifiPasswordValue(event.target.value)
  }

  function handleWifiPasswordInputFocus(): void {
    openKeyboard('wifiPassword')
  }

  function handleWifiPasswordVisibilityToggle(): void {
    setIsWifiPasswordVisible((prevValue) => !prevValue)
  }

  function handleWifiConnect(): void {
    if (!isNetworkCapabilityAvailable || isNetworkBusy) {
      setWifiConnectionNotice(networkCapabilityNotice)
      return
    }

    if (selectedWifiNetwork === null) {
      return
    }

    if (selectedWifiNetwork.security !== 'open' && wifiPasswordValue.trim().length < 8) {
      setWifiConnectionNotice('Введите пароль (минимум 8 символов).')
      return
    }

    setIsNetworkBusy(true)
    setWifiConnectionNotice(`Подключение к ${selectedWifiNetwork.ssid}...`)
    void networkClient.connect({
      ssid: selectedWifiNetwork.ssid,
      password: selectedWifiNetwork.security === 'open' ? undefined : wifiPasswordValue,
    })
      .then((nextStatus) => {
        applyHostNetworkStatus(nextStatus, nextStatus.message)
        setWifiPasswordValue('')
        setIsWifiPasswordVisible(false)
      })
      .catch((error: unknown) => {
        setWifiConnectionNotice(getHostNetworkErrorMessage(error, `Не удалось подключиться к ${selectedWifiNetwork.ssid}.`))
      })
      .finally(() => {
        setIsNetworkBusy(false)
      })
  }

  function handleWifiForgetSelected(): void {
    if (!isNetworkCapabilityAvailable || isNetworkBusy) {
      setWifiConnectionNotice(networkCapabilityNotice)
      return
    }

    if (selectedWifiNetwork === null) {
      return
    }

    setIsNetworkBusy(true)
    setWifiConnectionNotice(`Удаление сети ${selectedWifiNetwork.ssid}...`)
    void networkClient.forget({ ssid: selectedWifiNetwork.ssid })
      .then((nextStatus) => {
        applyHostNetworkStatus(nextStatus, nextStatus.message)
        setWifiPasswordValue('')
        setIsWifiPasswordVisible(false)
      })
      .catch((error: unknown) => {
        setWifiConnectionNotice(getHostNetworkErrorMessage(error, `Не удалось забыть сеть ${selectedWifiNetwork.ssid}.`))
      })
      .finally(() => {
        setIsNetworkBusy(false)
      })
  }

  function handleCloudConnectionToggle(): void {
    if (!isCloudCapabilityAvailable) {
      setCloudConnectionNotice(cloudCapabilityNotice)
      return
    }

    setIsCloudConnected((prevValue) => {
      const nextValue = !prevValue
      setCloudConnectionNotice(
        nextValue
          ? 'Подключение к сервису AI-контроля ошибок активно.'
          : 'Сервис облака отключен.',
      )
      if (!nextValue) {
        setIsCloudAiMonitoringEnabled(false)
      }
      return nextValue
    })
  }

  function handleCloudAiMonitoringToggle(nextValue: boolean): void {
    if (!isCloudCapabilityAvailable) {
      setCloudConnectionNotice(cloudCapabilityNotice)
      return
    }

    if (!isCloudConnected) {
      setCloudConnectionNotice('Сначала подключите облачный сервис.')
      return
    }
    setIsCloudAiMonitoringEnabled(nextValue)
  }

  async function handleCheckUpdates(): Promise<void> {
    if (isUpdateOperationActive) {
      setUpdateNotice('Проверка версий недоступна, пока выполняется обновление.')
      return
    }
    if (!isUpdatesCapabilityAvailable) {
      setUpdateNotice(updateCapabilityNotice)
      return
    }

    setIsCheckingUpdates(true)
    try {
      const status = await updateClient.check()
      consumeUpdateStatus(status)
      return
    } catch (error) {
      if (!isMoonrakerHostUpdateEndpointUnavailable(error)) {
        setUpdateNotice(getHostUpdateErrorMessage(error, 'Не удалось проверить наличие обновлений.'))
        return
      }
    } finally {
      setIsCheckingUpdates(false)
    }

    setIsCheckingUpdates(true)
    const results = await checkUpdateReleases(UPDATE_RELEASE_TARGETS)
    const availableCount = results.filter((result) => result.status === 'available').length
    const errorCount = results.filter((result) => result.status === 'error').length

    setUpdateReleaseResults(results)
    setUpdateNotice(
      errorCount > 0
      ? `Проверка завершена с ошибками: ${errorCount}.`
      : `Служба обновлений недоступна. Найдено доступных обновлений: ${availableCount}.`,
    )
    setIsCheckingUpdates(false)
  }

  function applyHostUpdateStatus(status: HostUpdateStatus): void {
    setSupportsCombinedUpdate(status.supportsCombinedUpdate === true)
    setUpdateReleaseResults(status.releaseResults)
    setUpdateNotice(
      !status.available
        ? 'Служба обновлений недоступна. Повторите проверку позже.'
        : status.releaseResults.some((release) => release.status === 'error')
          ? 'Не удалось проверить обновления. Повторите попытку.'
          : '',
    )
  }

  async function handleApplyUpdate(cancelPausedPrint = false): Promise<void> {
    if (resetInFlight.current || updateSubmitInFlight.current || isCheckingUpdates || applyingUpdateTarget !== null) return
    if (updateOperation !== null && !['applied', 'error', 'rolled_back', 'rejected'].includes(updateOperation.status)) {
      return
    }
    if (isUpdateBlockedByActivePrint) {
      setUpdateNotice('Обновление недоступно во время активной печати или паузы.')
      return
    }

    const releases = updateReleaseResults.filter((item) =>
      (item.id === 'printer-core' || item.id === 'printer-ui') && item.status === 'available' &&
      item.canApply === true && item.latestTag !== null)
    const release = releases.find((item) => item.id === 'printer-core') ?? releases[0]
    if (!release) {
      setUpdateNotice('Нет доступных обновлений. Проверьте версии ещё раз.')
      return
    }
    const targetId = release.id as HostUpdateTargetId
    const uiTargetTag = releases.length === 2 ? releases.find((item) => item.id === 'printer-ui')?.latestTag : null
    if (uiTargetTag && !supportsCombinedUpdate) {
      setUpdateNotice('Служба принтера не поддерживает совместное обновление. Сначала обновите службу TreeD.')
      return
    }

    if (snapshot.printJob.state === 'paused' && !cancelPausedPrint) {
      setPausedUpdateTarget(targetId)
      return
    }

    setApplyingUpdateTarget(targetId)
    updateSubmitInFlight.current = true
    const requestId = globalThis.crypto.randomUUID()
    pendingUpdateRef.current = { operationId: null, requestId, targetId, targetTag: release.latestTag }
    try {
      const status = await updateClient.apply({ targetId, targetTag: release.latestTag, requestId,
        ...(uiTargetTag ? { uiTargetTag } : {}),
        ...(cancelPausedPrint ? { cancelPausedPrint: true } : {}) })
      consumeUpdateStatus(status)
      if (!status.busy && status.operation === null) {
        setUpdateNotice(status.message || 'Служба не подтвердила запуск операции.')
      }
    } catch (error) {
      if (isHostUpdateRequestRejected(error)) {
        pendingUpdateRef.current = null
        setUpdateOperation(null)
        setIsUpdateReconnectPending(false)
        setUpdateNotice(getHostUpdateErrorMessage(error, 'Служба отклонила запрос обновления.'))
        return
      }
      const errorMessage = getHostUpdateErrorMessage(error, 'Не удалось подтвердить запуск. Проверяем состояние операции.')
      pendingUpdateRef.current = { operationId: null, requestId, targetId, targetTag: release.latestTag, errorMessage }
      setUpdateOperation({
        operationId: null,
        requestId,
        status: 'queued',
        phase: 'queued',
        progress: null,
        resultCode: null,
        message: 'Проверяем, приняла ли служба запрос. Операция могла начаться, даже если ответ не дошёл.',
        targetId,
        targetTag: release.latestTag,
        startedAt: null,
        updatedAt: null,
        finishedAt: null,
      })
      setIsUpdateReconnectPending(true)
      setUpdateNotice(errorMessage)
      void updateClient.getStatus().then(consumeUpdateStatus).catch(() => undefined)
    } finally {
      updateSubmitInFlight.current = false
      setApplyingUpdateTarget(null)
    }
  }

  async function handleResetOverrides(): Promise<void> {
    if (resetInFlight.current || !canResetOverrides || !updateClient.resetOverrides ||
      isActivePrintJob || isUpdateOperationActive || applyingUpdateTarget !== null) return
    resetInFlight.current = true
    setIsResettingOverrides(true)
    setResetOverridesNotice('Сохраняем копию и сбрасываем локальные настройки…')
    try {
      const result = await updateClient.resetOverrides()
      setResetOverridesNotice(result.message)
    } catch (error) {
      setResetOverridesNotice(error instanceof Error ? error.message : 'Не удалось сбросить настройки.')
    } finally {
      resetInFlight.current = false
      setIsResettingOverrides(false)
    }
  }

  function handleConsoleInputChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setConsoleCommandValue(event.target.value)
    setPendingConsoleCommand(null)
  }

  function handleConsoleKeyboardOpen(): void {
    openKeyboard('consoleCommand')
  }

  function handleConsoleQuickCommandInsert(command: string): void {
    setConsoleCommandValue(command)
    setPendingConsoleCommand(null)
    setConsoleNotice(`Команда подготовлена: ${command}`)
    openKeyboard('consoleCommand')
    setKeyboardCaret('consoleCommand', command.length)
  }

  function handleConsoleSubmit(): void {
    const consoleBlockReason = getCommandBlockReason('consoleGcode')
    if (consoleBlockReason !== null) {
      setConsoleNotice(consoleBlockReason)
      return
    }

    const trimmed = consoleCommandValue.trim()
    if (trimmed.length === 0) {
      setConsoleNotice('Введите команду перед отправкой.')
      setPendingConsoleCommand(null)
      return
    }

    if (pendingConsoleCommand !== trimmed) {
      setPendingConsoleCommand(trimmed)
      setConsoleNotice(`Опасная команда подготовлена: ${trimmed}. Нажмите "Отправить" еще раз для подтверждения.`)
      return
    }

    const now = new Date().toLocaleTimeString('ru-RU')
    setConsoleHistory((current) => [
      {
        id: `${Date.now()}-${current.length}`,
        command: trimmed,
        createdAt: now,
      },
      ...current,
    ])
    setConsoleNotice(`Команда отправлена: ${trimmed}`)
    setConsoleCommandValue('')
    setPendingConsoleCommand(null)
    void executeCommand({ command: 'consoleGcode', gcode: trimmed }).then((ok) => {
      if (!ok) {
        setConsoleNotice(`Команда не выполнена: ${trimmed}`)
      }
    })
  }

  const handleKeyboardPreviewChange = useCallback((nextValue: string): void => {
    if (activeKeyboardTarget === null) {
      return
    }

    setKeyboardValue(activeKeyboardTarget, nextValue)
  }, [activeKeyboardTarget, setKeyboardValue])

  const handleKeyboardKey = useCallback((key: string, selection?: KeyboardSelectionRange): void => {
    if (activeKeyboardTarget === null) {
      return
    }

    if (key === 'close') {
      closeKeyboard()
      return
    }

    const input = activeKeyboardTarget === 'wifiSearch'
      ? wifiSearchInputRef.current
      : activeKeyboardTarget === 'wifiPassword'
        ? wifiPasswordInputRef.current
        : consoleInputRef.current
    const currentValue = activeKeyboardTarget === 'wifiSearch'
      ? wifiSearchQuery
      : activeKeyboardTarget === 'wifiPassword'
        ? wifiPasswordValue
        : consoleCommandValue
    const meta = getSettingsKeyboardMeta(activeKeyboardTarget)
    const selectionStart = Math.min(
      selection?.selectionStart ?? input?.selectionStart ?? currentValue.length,
      currentValue.length,
    )
    const selectionEnd = Math.min(
      selection?.selectionEnd ?? input?.selectionEnd ?? currentValue.length,
      currentValue.length,
    )
    let nextValue = currentValue
    let nextCaret = selectionStart

    if (key === 'enter' && !meta.isMultiline) {
      closeKeyboard()
      return
    }

    if (key === 'backspace') {
      if (selectionStart !== selectionEnd) {
        nextValue = `${currentValue.slice(0, selectionStart)}${currentValue.slice(selectionEnd)}`
        nextCaret = selectionStart
      } else if (selectionStart > 0) {
        nextValue = `${currentValue.slice(0, selectionStart - 1)}${currentValue.slice(selectionStart)}`
        nextCaret = selectionStart - 1
      }
    } else {
      const insertValue = key === 'space'
        ? ' '
        : key === 'enter'
          ? '\n'
          : key
      nextValue = `${currentValue.slice(0, selectionStart)}${insertValue}${currentValue.slice(selectionEnd)}`
      nextCaret = selectionStart + insertValue.length
    }

    if (nextValue !== currentValue) {
      setKeyboardValue(activeKeyboardTarget, nextValue)
    }
    if (selection === undefined) {
      setKeyboardCaret(activeKeyboardTarget, nextCaret)
    }
  }, [
    activeKeyboardTarget,
    closeKeyboard,
    consoleCommandValue,
    setKeyboardCaret,
    setKeyboardValue,
    wifiPasswordValue,
    wifiSearchQuery,
  ])

  const isKeyboardTargetAllowed = useCallback((target: SettingsKeyboardTarget): boolean => {
    if (target === 'wifiSearch' || target === 'wifiPassword') {
      return activeSettingsGroup === 'network'
    }

    return activeSettingsGroup === 'console'
  }, [activeSettingsGroup])

  const pageProps: SettingsPageProps = {
    activeSettingsGroup,
    onSettingsGroupChange: handleSettingsGroupChange,
    system: {
      contractStatus: snapshot.uiContract.status === 'compatible'
        ? `UI contract ${snapshot.uiContract.contractVersion}: совместим`
        : snapshot.uiContract.status === 'legacy'
          ? 'UI contract: legacy runtime'
          : snapshot.uiContract.message ?? 'UI contract: несовместим',
      runtimeStatus: `Transport: ${snapshot.transport.state}; Klippy: ${snapshot.klippy.state}`,
      onExportDiagnostics: () => downloadDiagnosticReport(snapshot, PRINTER_UI_CURRENT_VERSION),
      factoryReset: {
        canReset: canResetOverrides && typeof updateClient.resetOverrides === 'function' &&
          !isActivePrintJob && !isUpdateOperationActive && applyingUpdateTarget === null,
        isResetting: isResettingOverrides,
        notice: resetOverridesNotice,
        onReset: handleResetOverrides,
      },
    },
    interfaceSettings: {
      isDarkThemeEnabled,
      isMaxPerformanceModeEnabled,
      sleepModeValue,
      timezoneValue,
      onDarkThemeChange: setIsDarkThemeEnabled,
      onMaxPerformanceModeChange: setIsMaxPerformanceModeEnabled,
      onSleepModeChange: setSleepModeValue,
      onTimezoneChange: setTimezoneValue,
    },
    network: {
      isCapabilityAvailable: isNetworkCapabilityAvailable,
      isBusy: isNetworkBusy,
      searchInputRef: wifiSearchInputRef,
      passwordInputRef: wifiPasswordInputRef,
      searchQuery: wifiSearchQuery,
      selectedWifiNetworkId,
      selectedWifiNetwork,
      filteredWifiNetworks,
      passwordValue: wifiPasswordValue,
      isPasswordVisible: isWifiPasswordVisible,
      currentSsid: hostNetworkStatus.ssid,
      wifiIpLabel,
      connectedWifiNetwork,
      connectionLabel,
      notice: wifiConnectionNotice,
      capabilityNotice: networkCapabilityNotice,
      onSearchQueryChange: handleWifiSearchQueryChange,
      onSearchInputFocus: handleWifiSearchInputFocus,
      onScan: handleWifiScan,
      onNetworkSelect: handleWifiNetworkSelect,
      onPasswordChange: handleWifiPasswordChange,
      onPasswordInputFocus: handleWifiPasswordInputFocus,
      onPasswordVisibilityToggle: handleWifiPasswordVisibilityToggle,
      onConnect: handleWifiConnect,
      onForgetSelected: handleWifiForgetSelected,
    },
    notifications: {
      isNotificationsEnabled,
      isNotificationSoundsEnabled,
      history: notificationHistory,
      onNotificationsEnabledChange: setIsNotificationsEnabled,
      onNotificationSoundsEnabledChange: setIsNotificationSoundsEnabled,
    },
    cloud: {
      isCapabilityAvailable: isCloudCapabilityAvailable,
      isConnected: isCloudConnected,
      isAiMonitoringEnabled: isCloudAiMonitoringEnabled,
      notice: cloudCapabilityNotice,
      onConnectionToggle: handleCloudConnectionToggle,
      onAiMonitoringToggle: handleCloudAiMonitoringToggle,
    },
    updates: {
      releaseResults: updateReleaseResults,
      isCheckingUpdates,
      applyingUpdateTarget,
      isApplyBlockedByActivePrint: isUpdateBlockedByActivePrint,
      isCapabilityAvailable: isUpdatesCapabilityAvailable,
      notice: updateCapabilityNotice,
      operation: dismissedUpdateOperationId !== null && updateOperationId === dismissedUpdateOperationId ? null : updateOperation,
      isReconnectPending: isUpdateReconnectPending,
      onDismissOperation: () => setDismissedUpdateOperationId(updateOperationId),
      onCheckUpdates: handleCheckUpdates,
      onApplyUpdate: () => handleApplyUpdate(),
      pausedUpdateTarget,
      onCancelPausedUpdate: () => setPausedUpdateTarget(null),
      onConfirmPausedUpdate: async () => {
        const target = pausedUpdateTarget
        setPausedUpdateTarget(null)
        if (target !== null) await handleApplyUpdate(true)
      },
    },
    language: {
      languageValue,
      isExternalVoiceEnabled,
      onLanguageChange: setLanguageValue,
      onExternalVoiceChange: setIsExternalVoiceEnabled,
    },
    console: {
      inputRef: consoleInputRef,
      commandValue: consoleCommandValue,
      notice: consoleNotice,
      history: consoleHistory,
      onInputChange: handleConsoleInputChange,
      onKeyboardOpen: handleConsoleKeyboardOpen,
      onSubmit: handleConsoleSubmit,
      onQuickCommandInsert: handleConsoleQuickCommandInsert,
    },
  }

  return {
    activeSettingsGroup,
    pageProps,
    keyboard: {
      value: keyboardValue,
      meta: keyboardMeta,
      isConsoleOpen: activeKeyboardTarget === 'consoleCommand',
      onKeyPress: handleKeyboardKey,
      onPreviewChange: handleKeyboardPreviewChange,
    },
    isKeyboardTargetAllowed,
  }
}
