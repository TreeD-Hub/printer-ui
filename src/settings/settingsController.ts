import { type ChangeEvent, useCallback, useMemo, useRef, useState } from 'react'
import type { ExecuteCommandArgs, PrinterCommandId } from '../core/commands'
import type { PrinterSnapshot } from '../core/transport/types'
import {
  DEFAULT_SELECTED_WIFI_NETWORK_ID,
  DEFAULT_TIMEZONE_OPTION,
  LANGUAGE_OPTIONS,
  SETTINGS_NOTIFICATION_HISTORY,
  SLEEP_MODE_OPTIONS,
  TIMEZONE_OPTIONS,
  UPDATE_AVAILABLE_VERSION,
  WIFI_NETWORK_LIBRARY,
  type SettingsGroupId,
  type SettingsNotificationItem,
  type WifiNetworkItem,
} from './config'
import type { SettingsPageProps } from './SettingsPage'

export type { WifiNetworkItem } from './config'

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

function clampSignalPercent(value: number): number {
  return Math.min(100, Math.max(18, value))
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

export function filterWifiNetworks(networks: readonly WifiNetworkItem[], query: string): WifiNetworkItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')

  return networks
    .filter((item) => item.ssid.toLocaleLowerCase('ru-RU').includes(normalizedQuery))
    .sort((left, right) => {
      if (left.connected !== right.connected) {
        return left.connected ? -1 : 1
      }
      return right.signalPercent - left.signalPercent
    })
}

export function useSettingsController({
  snapshot,
  connectionLabel,
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
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetworkItem[]>(() => [...WIFI_NETWORK_LIBRARY])
  const [wifiSearchQuery, setWifiSearchQuery] = useState<string>('')
  const [selectedWifiNetworkId, setSelectedWifiNetworkId] = useState<string | null>(DEFAULT_SELECTED_WIFI_NETWORK_ID)
  const [wifiPasswordValue, setWifiPasswordValue] = useState<string>('')
  const [isWifiPasswordVisible, setIsWifiPasswordVisible] = useState<boolean>(false)
  const [wifiConnectionNotice, setWifiConnectionNotice] = useState<string>('')
  const wifiSearchInputRef = useRef<HTMLInputElement | null>(null)
  const wifiPasswordInputRef = useRef<HTMLInputElement | null>(null)
  const consoleInputRef = useRef<HTMLTextAreaElement | null>(null)
  const isRuntimeCurrent = snapshot.connection === 'online' || snapshot.connection === 'degraded'
  const isNetworkCapabilityAvailable = snapshot.capabilities.network
  const isCloudCapabilityAvailable = snapshot.capabilities.cloud
  const isUpdatesCapabilityAvailable = snapshot.capabilities.updates
  const wifiIpLabel = isRuntimeCurrent ? snapshot.ipAddress : '—'
  const networkCapabilityNotice = isNetworkCapabilityAvailable
    ? 'Выберите сеть и выполните подключение.'
    : 'Недоступно: Moonraker/V2 Wi-Fi capability не подтвержден.'
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

  function handleWifiSearchQueryChange(event: ChangeEvent<HTMLInputElement>): void {
    setWifiSearchQuery(event.target.value)
  }

  function handleWifiSearchInputFocus(): void {
    openKeyboard('wifiSearch')
  }

  function handleWifiScan(): void {
    if (!isNetworkCapabilityAvailable) {
      setWifiConnectionNotice(networkCapabilityNotice)
      return
    }

    setWifiNetworks((current) => current.map((item, index) => ({
      ...item,
      signalPercent: clampSignalPercent(item.signalPercent + (index % 2 === 0 ? 3 : -2)),
    })))
    setWifiConnectionNotice('Список Wi-Fi сетей обновлен.')
  }

  function handleWifiNetworkSelect(networkId: string): void {
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
    if (!isNetworkCapabilityAvailable) {
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

    setWifiNetworks((current) => current.map((item) => {
      if (item.id === selectedWifiNetwork.id) {
        return {
          ...item,
          connected: true,
          saved: true,
        }
      }

      return {
        ...item,
        connected: false,
      }
    }))

    setWifiConnectionNotice(`Подключено к ${selectedWifiNetwork.ssid}.`)
    setWifiPasswordValue('')
    setIsWifiPasswordVisible(false)
  }

  function handleWifiForgetSelected(): void {
    if (!isNetworkCapabilityAvailable) {
      setWifiConnectionNotice(networkCapabilityNotice)
      return
    }

    if (selectedWifiNetwork === null) {
      return
    }

    setWifiNetworks((current) => current.map((item) => {
      if (item.id !== selectedWifiNetwork.id) {
        return item
      }

      return {
        ...item,
        connected: false,
        saved: false,
      }
    }))
    setWifiConnectionNotice(`Сеть ${selectedWifiNetwork.ssid} удалена из сохраненных.`)
    setWifiPasswordValue('')
    setIsWifiPasswordVisible(false)
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
      searchInputRef: wifiSearchInputRef,
      passwordInputRef: wifiPasswordInputRef,
      searchQuery: wifiSearchQuery,
      selectedWifiNetworkId,
      selectedWifiNetwork,
      filteredWifiNetworks,
      passwordValue: wifiPasswordValue,
      isPasswordVisible: isWifiPasswordVisible,
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
