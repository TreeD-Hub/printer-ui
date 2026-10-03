import { DashboardIdleView } from './DashboardIdleView'
import { DashboardPrintView } from './DashboardPrintView'
import type { DashboardPageProps } from './DashboardPage.types'

export type {
  DashboardIdleWidgetId,
  DashboardPageProps,
  DashboardTuneGroupId,
} from './DashboardPage.types'

export function DashboardPage(props: DashboardPageProps) {
  if (props.hasActivePrint) {
    return <DashboardPrintView {...props} />
  }

  return <DashboardIdleView {...props} />
}
