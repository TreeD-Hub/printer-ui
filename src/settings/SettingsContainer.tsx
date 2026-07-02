import { SettingsPage, type SettingsPageProps } from './SettingsPage'
import { SystemSettingsPage } from './SystemSettingsPage'

export type SettingsContainerProps = SettingsPageProps

export function SettingsContainer(props: SettingsContainerProps) {
  if (props.activeSettingsGroup === 'system') {
    return (
      <SystemSettingsPage
        activeSettingsGroup={props.activeSettingsGroup}
        onSettingsGroupChange={props.onSettingsGroupChange}
        system={props.system}
      />
    )
  }

  return <SettingsPage {...props} />
}
