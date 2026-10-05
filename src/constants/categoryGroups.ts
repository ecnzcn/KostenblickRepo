/**
 * Phase 14G: one fixed color per category group (Category.group, or the
 * category itself when it has no group) for the dashboard donut, bars and
 * symbol tiles. The colors are the eight slots of a validated categorical
 * palette (light surface: lightness band, chroma and colorblind separation
 * checked). There are more groups than distinguishable hues, so only the
 * eight most common expense groups get a hue; every other group - and the
 * combined rest - is neutral gray. Color always follows the group, never
 * its rank, and every chart names its groups in text, so identity never
 * depends on color alone.
 */
export const UNCATEGORIZED_GROUP_ID = 'none'
export const OTHER_GROUPS_ID = 'more'

const GROUP_COLORS: Record<string, string> = {
  housing: '#2a78d6',
  shopping: '#eb6834',
  groceries: '#1baf7a',
  mobility: '#eda100',
  subscriptions: '#e87ba4',
  credit_card_unitemized: '#008300',
  leisure: '#4a3aa7',
  health: '#e34948',
}

/** Shared by all groups without an own hue. */
export const NEUTRAL_GROUP_COLOR = '#8a8984'

export function categoryGroupColor(groupId: string): string {
  return GROUP_COLORS[groupId] ?? NEUTRAL_GROUP_COLOR
}

/** Income and expenses in the monthly chart (validated pair). */
export const INCOME_SERIES_COLOR = '#2a78d6'
export const EXPENSE_SERIES_COLOR = '#eb6834'
