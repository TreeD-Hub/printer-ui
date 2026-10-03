import type { ComponentProps } from 'react'
import { FilesPage } from './FilesPage'

export type FilesContainerProps = ComponentProps<typeof FilesPage>

export function FilesContainer(props: FilesContainerProps) {
  return <FilesPage {...props} />
}
