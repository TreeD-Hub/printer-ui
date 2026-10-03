import { useLayoutEffect, useRef } from 'react'

const modalStack: HTMLElement[] = []
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    if (element.closest('[hidden], [inert]') !== null || element.tabIndex < 0) return false
    for (let parent: HTMLElement | null = element; parent !== null; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (parent === dialog) break
    }
    return true
  })
}

/** Управляет только фокусом; закрытие и подтверждение остаются у владельца окна. */
export function useModalFocus<T extends HTMLElement>(isOpen: boolean, onClose?: () => void) {
  const dialogRef = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    if (!isOpen || dialogRef.current === null) return
    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousTabIndex = dialog.getAttribute('tabindex')
    dialog.tabIndex = -1
    modalStack.push(dialog)

    function isTopModal() {
      return modalStack[modalStack.length - 1] === dialog
    }

    function focusInitial() {
      const initial = getFocusableElements(dialog).find((element) => element.matches('[data-modal-initial-focus], button[aria-label^="Закрыть"]'))
      const target = initial ?? dialog
      target.focus({ preventScroll: true })
    }

    function handleTab(event: KeyboardEvent) {
      if (!isTopModal()) return
      if (event.key === 'Escape' && onCloseRef.current !== undefined) {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = getFocusableElements(dialog)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (first === undefined || last === undefined) {
        event.preventDefault()
        dialog.focus()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    function handleFocus(event: FocusEvent) {
      if (isTopModal() && event.target instanceof Node && !dialog.contains(event.target)) focusInitial()
    }

    focusInitial()
    document.addEventListener('keydown', handleTab, true)
    document.addEventListener('focusin', handleFocus)
    return () => {
      document.removeEventListener('keydown', handleTab, true)
      document.removeEventListener('focusin', handleFocus)
      const index = modalStack.indexOf(dialog)
      if (index !== -1) modalStack.splice(index, 1)
      if (previousTabIndex === null) dialog.removeAttribute('tabindex')
      else dialog.setAttribute('tabindex', previousTabIndex)
      const remainingDialog = modalStack[modalStack.length - 1]
      if (previousFocus?.isConnected && (remainingDialog === undefined || remainingDialog.contains(previousFocus))) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [isOpen])

  return dialogRef
}
