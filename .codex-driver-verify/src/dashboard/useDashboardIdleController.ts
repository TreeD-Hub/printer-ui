import {
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { DashboardIdleWidgetId } from './DashboardPage'

type IdleWidgetId = DashboardIdleWidgetId
export type DashboardIdleControlGroupId = 'heating' | 'maintenance'

type UseDashboardIdleControllerArgs = {
  isKeyboardOpen: boolean
  onKeyboardOpen: () => void
  onKeyboardClose: () => void
  onControlGroupOpen: (groupId: DashboardIdleControlGroupId) => void
}

type IdleNotesKeyboardSelection = {
  selectionStart: number
  selectionEnd: number
}

const IDLE_WIDGET_DRAG_HOLD_MS = 3000
const IDLE_NOTES_DEFAULT_TEXT = [
  'Экосистема TreeD V2.',
  'Перед запуском проверьте очистку стола и состояние поверхности.',
  'Если модель новая, сделайте короткий тест первого слоя.',
].join('\n')
const IDLE_NOTES_STORAGE_KEY = 'treed-shell:dashboard-idle-notes'
function readIdleNotesText(): string {
  if (typeof window === 'undefined') {
    return IDLE_NOTES_DEFAULT_TEXT
  }

  try {
    return window.localStorage.getItem(IDLE_NOTES_STORAGE_KEY) ?? IDLE_NOTES_DEFAULT_TEXT
  } catch {
    return IDLE_NOTES_DEFAULT_TEXT
  }
}

function writeIdleNotesText(value: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(IDLE_NOTES_STORAGE_KEY, value)
  } catch {
    // Ignore storage failures; notes should keep working for the current session.
  }
}

export function useDashboardIdleController({
  isKeyboardOpen,
  onKeyboardOpen,
  onKeyboardClose,
  onControlGroupOpen,
}: UseDashboardIdleControllerArgs) {
  const [idleNotesText, setIdleNotesText] = useState<string>(readIdleNotesText)
  const [idleWidgetOrder, setIdleWidgetOrder] = useState<IdleWidgetId[]>(['temperature', 'maintenance'])
  const [armedIdleWidgetId, setArmedIdleWidgetId] = useState<IdleWidgetId | null>(null)
  const [draggingIdleWidgetId, setDraggingIdleWidgetId] = useState<IdleWidgetId | null>(null)
  const idleNotesInputRef = useRef<HTMLTextAreaElement | null>(null)
  const idleWidgetRefs = useRef<Record<IdleWidgetId, HTMLElement | null>>({
    temperature: null,
    maintenance: null,
  })
  const idleWidgetHoldTimeoutRef = useRef<number | null>(null)
  const draggingIdleWidgetIdRef = useRef<IdleWidgetId | null>(null)

  const clearIdleWidgetHoldTimeout = useCallback((): void => {
    if (idleWidgetHoldTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(idleWidgetHoldTimeoutRef.current)
    idleWidgetHoldTimeoutRef.current = null
  }, [])

  const setIdleNotesKeyboardCaret = useCallback((nextCaret: number) => {
    if (typeof window === 'undefined') {
      return
    }

    window.requestAnimationFrame(() => {
      const input = idleNotesInputRef.current
      if (input === null) {
        return
      }
      input.focus()
      input.setSelectionRange(nextCaret, nextCaret)
    })
  }, [])

  const moveIdleWidgetByPointer = useCallback((widgetId: IdleWidgetId, pointerX: number): void => {
    const temperatureRect = idleWidgetRefs.current.temperature?.getBoundingClientRect()
    const maintenanceRect = idleWidgetRefs.current.maintenance?.getBoundingClientRect()

    if (temperatureRect === undefined || maintenanceRect === undefined) {
      return
    }

    const leftEdge = Math.min(temperatureRect.left, maintenanceRect.left)
    const rightEdge = Math.max(temperatureRect.right, maintenanceRect.right)
    const targetIndex = pointerX < leftEdge + ((rightEdge - leftEdge) / 2) ? 0 : 1

    setIdleWidgetOrder((currentOrder) => {
      const currentIndex = currentOrder.indexOf(widgetId)

      if (currentIndex === targetIndex) {
        return currentOrder
      }

      const otherWidgetId = currentOrder.find((currentWidgetId) => currentWidgetId !== widgetId)
      if (otherWidgetId === undefined) {
        return currentOrder
      }

      return targetIndex === 0 ? [widgetId, otherWidgetId] : [otherWidgetId, widgetId]
    })
  }, [])

  const openIdleWidgetTarget = useCallback((widgetId: IdleWidgetId): void => {
    onControlGroupOpen(widgetId === 'temperature' ? 'heating' : 'maintenance')
  }, [onControlGroupOpen])

  const handleIdleWidgetDragPointerDown = useCallback((
    event: PointerEvent<HTMLButtonElement>,
    widgetId: IdleWidgetId,
  ): void => {
    event.preventDefault()
    event.stopPropagation()

    clearIdleWidgetHoldTimeout()
    setArmedIdleWidgetId(widgetId)
    event.currentTarget.setPointerCapture(event.pointerId)

    idleWidgetHoldTimeoutRef.current = window.setTimeout(() => {
      draggingIdleWidgetIdRef.current = widgetId
      setArmedIdleWidgetId(null)
      setDraggingIdleWidgetId(widgetId)
      idleWidgetHoldTimeoutRef.current = null
    }, IDLE_WIDGET_DRAG_HOLD_MS)
  }, [clearIdleWidgetHoldTimeout])

  const handleIdleWidgetDragPointerMove = useCallback((
    event: PointerEvent<HTMLButtonElement>,
    widgetId: IdleWidgetId,
  ): void => {
    event.preventDefault()
    event.stopPropagation()

    if (draggingIdleWidgetIdRef.current !== widgetId) {
      return
    }

    moveIdleWidgetByPointer(widgetId, event.clientX)
  }, [moveIdleWidgetByPointer])

  const handleIdleWidgetDragPointerEnd = useCallback((event: PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()

    clearIdleWidgetHoldTimeout()
    setArmedIdleWidgetId(null)
    setDraggingIdleWidgetId(null)
    draggingIdleWidgetIdRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [clearIdleWidgetHoldTimeout])

  const handleIdleWidgetDragHandleClick = useCallback((event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const updateIdleNotesText = useCallback((nextValue: string): void => {
    setIdleNotesText(nextValue)
    writeIdleNotesText(nextValue)
  }, [])

  const handleIdleNotesChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    updateIdleNotesText(event.target.value)
  }, [updateIdleNotesText])

  const handleIdleNotesKeyboardOpen = useCallback(() => {
    onKeyboardOpen()
  }, [onKeyboardOpen])

  const handleIdleNotesKeyMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }, [])

  const handleIdleNotesKeyboardPreviewChange = useCallback((nextValue: string): void => {
    updateIdleNotesText(nextValue)
  }, [updateIdleNotesText])

  const handleIdleNotesVirtualKey = useCallback((key: string, selection?: IdleNotesKeyboardSelection) => {
    if (!isKeyboardOpen) {
      return
    }

    if (key === 'close') {
      onKeyboardClose()
      return
    }

    const input = idleNotesInputRef.current
    const currentValue = idleNotesText
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

    if (nextValue === currentValue) {
      if (selection === undefined) {
        setIdleNotesKeyboardCaret(nextCaret)
      }
      return
    }

    updateIdleNotesText(nextValue)
    if (selection === undefined) {
      setIdleNotesKeyboardCaret(nextCaret)
    }
  }, [idleNotesText, isKeyboardOpen, onKeyboardClose, setIdleNotesKeyboardCaret, updateIdleNotesText])

  useEffect(() => {
    return () => {
      clearIdleWidgetHoldTimeout()
    }
  }, [clearIdleWidgetHoldTimeout])

  return {
    idleWidgetOrder,
    armedIdleWidgetId,
    draggingIdleWidgetId,
    idleWidgetRefs,
    idleNotesInputRef,
    idleNotesText,
    isIdleNotesKeyboardOpen: isKeyboardOpen,
    openIdleWidgetTarget,
    handleIdleWidgetDragPointerDown,
    handleIdleWidgetDragPointerMove,
    handleIdleWidgetDragPointerEnd,
    handleIdleWidgetDragHandleClick,
    handleIdleNotesKeyboardOpen,
    handleIdleNotesChange,
    handleIdleNotesKeyMouseDown,
    handleIdleNotesKeyboardPreviewChange,
    handleIdleNotesVirtualKey,
    handleIdleNotesKeyboardClose: onKeyboardClose,
  }
}
