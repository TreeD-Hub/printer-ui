import { SettingsPage, type SettingsPageProps } from './SettingsPage'
import { SystemSettingsPage } from './SystemSettingsPage'
import type { MoonrakerSystemStatusController } from './useMoonrakerSystemStatus'

export type SettingsContainerProps = SettingsPageProps & {
  systemStatus: MoonrakerSystemStatusController
}

export function SettingsContainer(props: SettingsContainerProps) {
  const { systemStatus, ...settingsPageProps } = props

  if (props.activeSettingsGroup === 'system') {
    return (
      <SystemSettingsPage
        activeSettingsGroup={props.activeSettingsGroup}
        onSettingsGroupChange={props.onSettingsGroupChange}
        system={props.system}
        systemStatus={systemStatus}
      />
    )
  }

  return <SettingsPage {...settingsPageProps} />
}
