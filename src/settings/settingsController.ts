import {
  filterWifiNetworks,
  getPreferredWifiNetworkId,
  type WifiNetworkItem,
} from '@treed/printer-logic'
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import {
  areHostNetworkStatusesEqual,
  createUnavailableHostNetworkStatus,
  getHostNetworkErrorMessage,
  type HostNetworkClient,
  type HostNetworkStatus,
} from '../core/hostNetwork'
import type { PrinterSnapshot } from '../core/transport/types'
import {
  DEFAULT_TIMEZONE_OPTION,
  LANGUAGE_OPTIONS,
  SETTINGS_NOTIFICATION_HISTORY,
  SLEEP_MODE_OPTIONS,
  TIMEZONE_OPTIONS,
  UPDATE_AVAILABLE_VERSION,
  type SettingsGroupId,
  type SettingsNotificationItem,
} from './config'
import type { SettingsPageProps } from './SettingsPage'

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
  onKeyPress: (key: string) => void
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
  const [availableUpdateVersion, setAvailableUpdateVersion] = useState<string | null>(null)
  const [updateNotice, setUpdateNotice] = useState<string>('Проверьте наличие новых версий.')
  const [consoleCommandValue, setConsoleCommandValue] = useState<string>('')
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
  const isUpdatesCapabilityAvailable = snapshot.capabilities.updates
  const wifiIpLabel = hostNetworkStatus.ipAddress ?? '—'
  const networkCapabilityNotice = isNetworkCapabilityAvailable
    ? hostNetworkStatus.message
    : `Недоступно: ${hostNetworkStatus.message}`
  const cloudCapabilityNotice = isCloudCapabilityAvailable
    ? cloudConnectionNotice
    : 'Недоступно: Moonraker/V2 cloud capability не подтвержден.'
  const updateCapabilityNotice = isUpdatesCapabilityAvailable
    ? updateNotice
    : 'Недоступно: Moonraker/V2 update capability не подтвержден.'
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

  function handleCheckUpdates(): void {
    if (!isUpdatesCapabilityAvailable) {
      setUpdateNotice(updateCapabilityNotice)
      return
    }

    setIsCheckingUpdates(true)
    setAvailableUpdateVersion(UPDATE_AVAILABLE_VERSION)
    setUpdateNotice(`Доступна версия ${UPDATE_AVAILABLE_VERSION}.`)
    setIsCheckingUpdates(false)
  }

  function handleConsoleInputChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setConsoleCommandValue(event.target.value)
  }

  function handleConsoleKeyboardOpen(): void {
    openKeyboard('consoleCommand')
  }

  function handleConsoleQuickCommandInsert(command: string): void {
    setConsoleCommandValue(command)
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
    void executeCommand({ command: 'consoleGcode', gcode: trimmed }).then((ok) => {
      if (!ok) {
        setConsoleNotice(`Команда не выполнена: ${trimmed}`)
      }
    })
  }

  const handleKeyboardKey = useCallback((key: string): void => {
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
    const selectionStart = input?.selectionStart ?? currentValue.length
    const selectionEnd = input?.selectionEnd ?? currentValue.length
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
    setKeyboardCaret(activeKeyboardTarget, nextCaret)
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
      availableUpdateVersion,
      isCheckingUpdates,
      isCapabilityAvailable: isUpdatesCapabilityAvailable,
      notice: updateCapabilityNotice,
      onCheckUpdates: handleCheckUpdates,
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
    },
    isKeyboardTargetAllowed,
  }
}
