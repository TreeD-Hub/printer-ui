export function getExcludeObjectTestIdSuffix(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]+/g, '_')
}
