import {
  filterWifiNetworks,
  getPreferredWifiNetworkId,
  type WifiNetworkItem,
} from '@treed/printer-logic'
import { runtimeMode } from '#runtime'
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
  type HostUpdateClient,
  type HostUpdateStatus,
} from '../core/hostUpdate'
import type { PrinterSnapshot } from '../core/transport/types'
import {
  DEFAULT_TIMEZONE_OPTION,
  LANGUAGE_OPTIONS,
  SETTINGS_NOTIFICATION_HISTORY,
  SLEEP_MODE_OPTIONS,
  TIMEZONE_OPTIONS,
  UPDATE_CURRENT_VERSION,
  UPDATE_RELEASE_TARGETS,
  type SettingsGroupId,
  type SettingsNotificationItem,
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
  const [notificationHistory] = useState<SettingsNotificationItem[]>(SETTINGS_NOTIFICATION_HISTORY)
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false)
  const [isCloudAiMonitoringEnabled, setIsCloudAiMonitoringEnabled] = useState<boolean>(false)
  const [cloudConnectionNotice, setCloudConnectionNotice] = useState<string>('Сервис облака не подключен.')
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false)
  const [isApplyingUpdate, setIsApplyingUpdate] = useState<boolean>(false)
  const [canApplySystemUpdate, setCanApplySystemUpdate] = useState<boolean>(false)
  const [updateReleaseResults, setUpdateReleaseResults] = useState(() =>
    runtimeMode === 'mock'
      ? createMockUpdateReleaseResults(UPDATE_RELEASE_TARGETS)
      : createUnknownUpdateReleaseResults(UPDATE_RELEASE_TARGETS),
  )
  const [updateNotice, setUpdateNotice] = useState<string>(
    runtimeMode === 'mock'
      ? 'Mock: GitHub Releases не проверяются.'
      : 'Проверьте наличие новых версий.',
  )
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
  const wifiIpLabel = hostNetworkStatus.ipAddress ?? '—'
  const networkCapabilityNotice = isNetworkCapabilityAvailable
    ? hostNetworkStatus.message
    : `Недоступно: ${hostNetworkStatus.message}`
  const cloudCapabilityNotice = isCloudCapabilityAvailable
    ? cloudConnectionNotice
    : 'Недоступно: Moonraker/V2 cloud capability не подтвержден.'
  const updateCapabilityNotice = isUpdatesCapabilityAvailable
    ? updateNotice
    : 'Недоступно: runtime не поддерживает fetch для проверки GitHub Releases.'
  const mainShellUpdateResult = useMemo(
    () => updateReleaseResults.find((release) => release.id === 'treed-mainshellos') ?? null,
    [updateReleaseResults],
  )
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

  useEffect(() => {
    let isDisposed = false

    void networkClient.getStatus()
      .then((nextStatus) => {
        if (!isDisposed) {
          applyHostNetworkStatus(nextStatus)
        }
      })
      .catch((error: unknown) => {
        if (!isDisposed) {
          applyHostNetworkError(error, 'Не удалось получить статус Wi-Fi.')
        }
      })

    return () => {
      isDisposed = true
    }
  }, [applyHostNetworkError, applyHostNetworkStatus, networkClient])

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
    if (!isUpdatesCapabilityAvailable) {
      setUpdateNotice(updateCapabilityNotice)
      return
    }

    if (runtimeMode === 'mock') {
      setUpdateReleaseResults(createMockUpdateReleaseResults(UPDATE_RELEASE_TARGETS))
      setUpdateNotice('Mock: GitHub Releases не проверяются.')
      setCanApplySystemUpdate(false)
      return
    }

    setIsCheckingUpdates(true)
    try {
      const status = await updateClient.check()
      applyHostUpdateStatus(status)
      return
    } catch (error) {
      if (!isMoonrakerHostUpdateEndpointUnavailable(error)) {
        setUpdateNotice(error instanceof Error ? error.message : 'Не удалось проверить host update endpoint.')
        setCanApplySystemUpdate(false)
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
    setCanApplySystemUpdate(false)
    setUpdateNotice(
      errorCount > 0
        ? `Проверка завершена с ошибками: ${errorCount}.`
        : `Host update endpoint недоступен. Read-only проверка: доступно обновлений ${availableCount}.`,
    )
    setIsCheckingUpdates(false)
  }

  function applyHostUpdateStatus(status: HostUpdateStatus): void {
    setUpdateReleaseResults(status.releaseResults)
    setCanApplySystemUpdate(status.canApply)
    setUpdateNotice(status.message)
  }

  async function handleApplySystemUpdate(): Promise<void> {
    if (!canApplySystemUpdate || mainShellUpdateResult === null) {
      setUpdateNotice('Системное обновление недоступно.')
      return
    }

    setIsApplyingUpdate(true)
    try {
      const status = await updateClient.apply({ targetTag: mainShellUpdateResult.latestTag })
      applyHostUpdateStatus(status)
    } catch (error) {
      setCanApplySystemUpdate(false)
      setUpdateNotice(error instanceof Error ? error.message : 'Не удалось запустить системное обновление.')
    } finally {
      setIsApplyingUpdate(false)
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
    onSettingsGroupChange: setActiveSettingsGroup,
    system: {
      contractStatus: snapshot.uiContract.status === 'compatible'
        ? `UI contract ${snapshot.uiContract.contractVersion}: совместим`
        : snapshot.uiContract.status === 'legacy'
          ? 'UI contract: legacy runtime'
          : snapshot.uiContract.message ?? 'UI contract: несовместим',
      runtimeStatus: `Transport: ${snapshot.transport.state}; Klippy: ${snapshot.klippy.state}`,
      onExportDiagnostics: () => downloadDiagnosticReport(snapshot, UPDATE_CURRENT_VERSION),
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
      isApplyingUpdate,
      canApplySystemUpdate,
      isCapabilityAvailable: isUpdatesCapabilityAvailable,
      notice: updateCapabilityNotice,
      onCheckUpdates: handleCheckUpdates,
      onApplySystemUpdate: handleApplySystemUpdate,
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
