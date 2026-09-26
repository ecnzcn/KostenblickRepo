import packageJson from '../../package.json'

/** Single source of truth for the app version (e.g. shown in a backup
 * export) - read directly from package.json instead of duplicating the
 * string anywhere else. */
export const APP_VERSION: string = packageJson.version
