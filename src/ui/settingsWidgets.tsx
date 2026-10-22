import {
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
  type ButtonHTMLAttributes,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { IconMask } from './IconMask'
import { SidebarIcon, type SidebarIconName } from './SidebarIcon'
import { joinClassNames } from './classNames'
import type { UiIconName } from './iconAssets'
import { useModalFocus } from './useModalFocus'

export type SettingsMenuOption<T extends string> = {
  id: T
  label: string
  icon: SidebarIconName
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
  iconSize = 28,
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
            <SidebarIcon name={option.icon} size={iconSize} />
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
  icon?: UiIconName
  description?: string
  title?: string
  checked: boolean
  onChange: (nextValue: boolean) => void
  testId?: string
  disabled?: boolean
}

export function SettingsToggleRow({
  label,
  icon,
  description,
  title,
  checked,
  onChange,
  testId,
  disabled = false,
}: SettingsToggleRowProps) {
  return (
    <button
      type="button"
      className="settings-toggle-row"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      data-testid={testId}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      {icon ? <IconMask name={icon} size={32} className="settings-toggle-icon" /> : null}
      <span className="settings-toggle-copy">
        <span className="settings-toggle-label">{label}</span>
        {description ? <span className="settings-toggle-description">{description}</span> : null}
      </span>
      <span className={joinClassNames('settings-toggle-switch', checked && 'is-active')} aria-hidden="true" />
    </button>
  )
}

type SettingsSelectFieldProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'children'> & {
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
  disabled = false,
  ...buttonProps
}: SettingsSelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const labelId = useId()
  const valueId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLElement>(isOpen && !disabled, () => setIsOpen(false))

  useEffect(() => {
    if (disabled) setIsOpen(false)
  }, [disabled])

  useLayoutEffect(() => {
    if (!isOpen) return
    const list = dialogRef.current?.querySelector<HTMLElement>('.settings-select-options')
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (list && selected) {
      list.scrollTop = selected.offsetTop - list.offsetTop - (list.clientHeight - selected.clientHeight) / 2
    }
  }, [isOpen, value, dialogRef])

  return (
    <div className={joinClassNames('settings-select-field', className)}>
      <span id={labelId} className="settings-select-label">{label}</span>
      <button
        {...buttonProps}
        ref={triggerRef}
        type="button"
        className="settings-select-control"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen && !disabled}
        disabled={disabled}
        tabIndex={-1}
        onClick={() => setIsOpen(true)}
      >
        <span id={valueId}>{value}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen && !disabled ? createPortal(
        <div className="settings-select-layer" onClick={() => setIsOpen(false)}>
          <section ref={dialogRef} className="settings-select-dialog" role="dialog" aria-modal="true"
            aria-labelledby={`${labelId}-dialog`} onClick={(event) => event.stopPropagation()}>
            <header>
              <h3 id={`${labelId}-dialog`}>{label}</h3>
              <button type="button" className="settings-select-close" tabIndex={-1} onClick={() => setIsOpen(false)}>Назад</button>
            </header>
            <div className="settings-select-options" role="listbox" aria-label={label}>
              {options.map((option) => (
                <button key={option} type="button" role="option" aria-selected={option === value}
                  className="settings-select-option" tabIndex={-1}
                  onClick={() => { onChange(option); setIsOpen(false) }}>
                  {option}
                </button>
              ))}
            </div>
          </section>
        </div>,
        triggerRef.current?.closest('.screen-shell') ?? document.body,
      ) : null}
    </div>
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
  isPassword?: boolean
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
  isPassword = false,
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
  const previewInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const PreviewInput = isPassword ? 'input' : 'textarea'
  const keyboardRows = rows ?? VIRTUAL_KEYBOARD_LAYOUT[language]
  const nextLanguage = language === 'ru' ? 'EN' : 'RU'
  const enterLabel = showEnterKey ? 'Enter' : 'Готово'

  useLayoutEffect(() => {
    const input = previewInputRef.current
    if (!showEnterKey || input === null) return
    const previousScrollTop = input.scrollTop
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
    input.scrollTop = input.selectionEnd === value.length ? input.scrollHeight : previousScrollTop
  }, [value, showEnterKey])

  function getPreviewSelection(): VirtualKeyboardSelection | undefined {
    const input = previewInputRef.current
    if (input === null || document.activeElement !== input) {
      return undefined
    }

    return {
      selectionStart: input.selectionStart ?? input.value.length,
      selectionEnd: input.selectionEnd ?? input.value.length,
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

  function handlePreviewChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    onPreviewChange?.(event.currentTarget.value, {
      selectionStart: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
      selectionEnd: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
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
    <div className="virtual-keyboard-panel" data-testid={testId}
      style={{ '--keyboard-columns': Math.max(...keyboardRows.map((row) => row.length)) } as CSSProperties}>
      <div className="virtual-keyboard-preview">
        <PreviewInput
          ref={(element: HTMLInputElement | HTMLTextAreaElement | null) => { previewInputRef.current = element }}
          type={isPassword ? 'password' : undefined}
          data-modal-initial-focus
          className={`virtual-keyboard-preview-value virtual-keyboard-preview-input${showEnterKey ? ' is-multiline' : ''}`}
          value={value}
          onChange={handlePreviewChange}
          placeholder={placeholder}
          aria-label={valueLabel}
          data-testid={previewTestId}
          rows={1}
          wrap={showEnterKey ? 'soft' : 'off'}
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
