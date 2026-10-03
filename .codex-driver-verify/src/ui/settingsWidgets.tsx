import {
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
  type SelectHTMLAttributes,
  useRef,
} from 'react'
import { IconMask } from './IconMask'
import { joinClassNames } from './classNames'
import type { UiIconName } from './iconAssets'

export type SettingsMenuOption<T extends string> = {
  id: T
  label: string
  icon: UiIconName
}

type SettingsSidebarMenuProps<T extends string> = {
  options: readonly SettingsMenuOption<T>[]
  value: T
  onChange: (nextValue: T) => void
  ariaLabel: string
  testIdPrefix?: string
  iconSize?: number
  disabledReasons?: Partial<Record<T, string | null>>
}

export function SettingsSidebarMenu<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  testIdPrefix,
  iconSize = 20,
  disabledReasons,
}: SettingsSidebarMenuProps<T>) {
  return (
    <nav className="settings-sidebar-menu" aria-label={ariaLabel}>
      {options.map((option) => {
        const disabledReason = disabledReasons?.[option.id] ?? null
        const isDisabled = disabledReason !== null

        return (
          <button
            key={option.id}
            type="button"
            className={joinClassNames('settings-sidebar-item', value === option.id && 'is-active')}
            aria-pressed={value === option.id}
            aria-disabled={isDisabled}
            aria-label={option.label}
            title={disabledReason ?? option.label}
            data-testid={testIdPrefix ? `${testIdPrefix}-${option.id}` : undefined}
            disabled={isDisabled}
            onClick={() => onChange(option.id)}
          >
            <IconMask name={option.icon} size={iconSize} />
            <span className="settings-sidebar-label">{option.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

type SettingsInfoCardProps = {
  title: string
  subtitle?: string
  details: readonly string[]
  loadPercent: number
}

export function SettingsInfoCard({
  title,
  subtitle,
  details,
  loadPercent,
}: SettingsInfoCardProps) {
  const normalizedLoad = Math.max(0, Math.min(100, loadPercent))

  return (
    <article className="settings-info-card">
      <div className="settings-info-copy">
        <p className="settings-info-title">
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </p>
        <ul className="settings-info-details">
          {details.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div
        className="settings-info-gauge"
        style={{ '--settings-card-load': `${normalizedLoad}%` } as CSSProperties}
        aria-label={`Нагрузка ${Math.round(normalizedLoad)} процентов`}
      >
        <span>{Math.round(normalizedLoad)}</span>
      </div>
    </article>
  )
}

type SettingsToggleRowProps = {
  label: string
  checked: boolean
  onChange: (nextValue: boolean) => void
  testId?: string
  disabled?: boolean
}

export function SettingsToggleRow({
  label,
  checked,
  onChange,
  testId,
  disabled = false,
}: SettingsToggleRowProps) {
  return (
    <button
      type="button"
      className="settings-toggle-row"
      aria-pressed={checked}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-label">{label}</span>
      <span className={joinClassNames('settings-toggle-switch', checked && 'is-active')} aria-hidden="true" />
    </button>
  )
}

type SettingsSelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'children'> & {
  label: string
  value: string
  options: readonly string[]
  onChange: (nextValue: string) => void
}

export function SettingsSelectField({
  label,
  value,
  options,
  onChange,
  className,
  ...selectProps
}: SettingsSelectFieldProps) {
  return (
    <label className={joinClassNames('settings-select-field', className)}>
      <span className="settings-select-label">{label}</span>
      <select
        className="settings-select-control"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

export type VirtualKeyboardLanguage = 'ru' | 'en'

const VIRTUAL_KEYBOARD_LAYOUT: Record<VirtualKeyboardLanguage, string[][]> = {
  en: [
    ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\''],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ],
  ru: [
    ['ё', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ', '\\'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', '.'],
  ],
}

type SettingsVirtualKeyboardProps = {
  valueLabel: string
  value: string
  placeholder: string
  language?: VirtualKeyboardLanguage
  isCapsEnabled?: boolean
  rows?: ReadonlyArray<ReadonlyArray<string>>
  onKeyPress: (key: string, selection?: VirtualKeyboardSelection) => void
  onPreviewChange?: (value: string, selection: VirtualKeyboardSelection) => void
  onToggleLanguage?: () => void
  onToggleCaps?: () => void
  onClose: () => void
  onKeyMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
  showEnterKey?: boolean
  testId?: string
  previewTestId?: string
}

export type VirtualKeyboardSelection = {
  selectionStart: number
  selectionEnd: number
}

export function SettingsVirtualKeyboard({
  valueLabel,
  value,
  placeholder,
  language = 'ru',
  isCapsEnabled = false,
  rows,
  onKeyPress,
  onPreviewChange,
  onToggleLanguage = () => {},
  onToggleCaps = () => {},
  onClose,
  onKeyMouseDown,
  showEnterKey = false,
  testId,
  previewTestId,
}: SettingsVirtualKeyboardProps) {
  const previewInputRef = useRef<HTMLTextAreaElement | null>(null)
  const keyboardRows = rows ?? VIRTUAL_KEYBOARD_LAYOUT[language]
  const nextLanguage = language === 'ru' ? 'EN' : 'RU'
  const enterLabel = showEnterKey ? 'Enter' : 'Готово'

  function getPreviewSelection(): VirtualKeyboardSelection | undefined {
    const input = previewInputRef.current
    if (input === null || document.activeElement !== input) {
      return undefined
    }

    return {
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    }
  }

  function getNextPreviewCaret(key: string, selection: VirtualKeyboardSelection): number {
    const { selectionStart, selectionEnd } = selection
    if (key === 'backspace') {
      if (selectionStart !== selectionEnd) {
        return selectionStart
      }
      return Math.max(0, selectionStart - 1)
    }

    const insertValue = key === 'space'
      ? ' '
      : key === 'enter'
        ? '\n'
        : key
    return selectionStart + insertValue.length
  }

  function restorePreviewCaret(nextCaret: number): void {
    window.requestAnimationFrame(() => {
      const input = previewInputRef.current
      if (input === null || document.activeElement !== input) {
        return
      }
      input.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function handlePreviewChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onPreviewChange?.(event.currentTarget.value, {
      selectionStart: event.currentTarget.selectionStart,
      selectionEnd: event.currentTarget.selectionEnd,
    })
  }

  function handlePreviewKeyPress(key: string): void {
    const selection = getPreviewSelection()
    onKeyPress(key, selection)
    if (selection !== undefined && key !== 'close') {
      restorePreviewCaret(getNextPreviewCaret(key, selection))
    }
  }

  function normalizeKeyLabel(key: string): string {
    const isLetter = /[a-zа-яё]/i.test(key)
    if (!isLetter || !isCapsEnabled) {
      return key
    }
    return language === 'ru' ? key.toLocaleUpperCase('ru-RU') : key.toLocaleUpperCase('en-US')
  }

  return (
    <div className="virtual-keyboard-panel" data-testid={testId}>
      <div className="virtual-keyboard-preview">
        <p className="virtual-keyboard-preview-label">{valueLabel}</p>
        <textarea
          ref={previewInputRef}
          className="virtual-keyboard-preview-value virtual-keyboard-preview-input"
          value={value}
          onChange={handlePreviewChange}
          placeholder={placeholder}
          aria-label={valueLabel}
          data-testid={previewTestId}
          rows={1}
          wrap="off"
          spellCheck={false}
        />
      </div>

      {keyboardRows.map((row, rowIndex) => (
        <div className="virtual-keyboard-row" key={`virtual-keyboard-row-${rowIndex}`}>
          {row.map((key) => (
            <button
              key={`virtual-keyboard-key-${rowIndex}-${key}`}
              type="button"
              className="virtual-keyboard-key"
              onMouseDown={onKeyMouseDown}
              onClick={() => handlePreviewKeyPress(normalizeKeyLabel(key))}
              aria-label={`Символ ${normalizeKeyLabel(key)}`}
            >
              {normalizeKeyLabel(key)}
            </button>
          ))}
        </div>
      ))}

      <div className="virtual-keyboard-row virtual-keyboard-row-actions">
        <button
          type="button"
          className={joinClassNames(
            'virtual-keyboard-key',
            'virtual-keyboard-key-action',
            isCapsEnabled && 'is-active',
          )}
          onMouseDown={onKeyMouseDown}
          onClick={onToggleCaps}
          aria-label="Включить или выключить заглавные буквы"
        >
          CAPS
        </button>
        <button
          type="button"
          className="virtual-keyboard-key virtual-keyboard-key-action"
          onMouseDown={onKeyMouseDown}
          onClick={onToggleLanguage}
          aria-label={`Переключить язык на ${nextLanguage}`}
        >
          {nextLanguage}
        </button>
        <button
          type="button"
          className="virtual-keyboard-key virtual-keyboard-key-space"
          onMouseDown={onKeyMouseDown}
          onClick={() => handlePreviewKeyPress('space')}
          aria-label="Пробел"
        >
          Пробел
        </button>
        <button
          type="button"
          className="virtual-keyboard-key virtual-keyboard-key-action"
          onMouseDown={onKeyMouseDown}
          onClick={() => handlePreviewKeyPress('backspace')}
          aria-label="Удалить символ"
        >
          ⌫
        </button>
        <button
          type="button"
          className="virtual-keyboard-key virtual-keyboard-key-action"
          onMouseDown={onKeyMouseDown}
          onClick={() => handlePreviewKeyPress(showEnterKey ? 'enter' : 'close')}
          aria-label={showEnterKey ? 'Перенос строки' : 'Готово'}
        >
          {enterLabel}
        </button>
        <button
          type="button"
          className="virtual-keyboard-key virtual-keyboard-key-action"
          onMouseDown={onKeyMouseDown}
          onClick={onClose}
          aria-label="Скрыть клавиатуру"
        >
          Скрыть
        </button>
      </div>
    </div>
  )
}
