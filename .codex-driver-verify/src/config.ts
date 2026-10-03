export const moonrakerUrl = import.meta.env.VITE_MOONRAKER_URL ?? 'http://127.0.0.1:7125'
export const printerUiReleaseApiUrl = import.meta.env.VITE_PRINTER_UI_RELEASE_API_URL
  ?? import.meta.env.VITE_TREED_SHELL_RELEASE_API_URL
  ?? 'https://api.github.com/repos/TreeD-Hub/printer-ui/releases'
export const printerCoreReleaseApiUrl = import.meta.env.VITE_PRINTER_CORE_RELEASE_API_URL
  ?? import.meta.env.VITE_TREED_MAIN_SHELL_RELEASE_API_URL
  ?? 'https://api.github.com/repos/TreeD-Hub/printer-core/releases'
