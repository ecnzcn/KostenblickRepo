import { HOUSING_CATEGORY_ID } from './categories'

/**
 * Built-in, deliberately conservative suggestions (spec 14E): only names
 * that unambiguously identify a merchant, matched as whole words on the
 * counterparty. Salary is never guessed here. They rank below the user's
 * own rules and never touch a manual assignment.
 */
export const STANDARD_NAME_RULES: ReadonlyArray<{ words: readonly string[]; categoryId: string }> = [
  {
    words: ['REWE', 'EDEKA', 'ALDI', 'LIDL', 'KAUFLAND', 'NETTO', 'PENNY', 'NORMA', 'TEGUT', 'ALNATURA', 'DM', 'ROSSMANN'],
    categoryId: 'groceries',
  },
  { words: ['ARAL', 'SHELL', 'ESSO', 'JET', 'AVIA', 'TOTALENERGIES', 'EASYPARK'], categoryId: 'mobility' },
  { words: ['TELEKOM', 'VODAFONE', 'O2'], categoryId: 'telecom' },
]

/**
 * Card merchant category codes (ISO 18245, column "Gebührenschlüssel" of
 * the Sparkasse card export) → category. Only codes with an unambiguous
 * meaning are listed; anything else stays uncategorized.
 */
export const MERCHANT_CATEGORY_CODE_MAP: Readonly<Record<string, string>> = {
  // Groceries, bakeries, butchers, drugstores
  '5411': 'groceries',
  '5422': 'groceries',
  '5441': 'groceries',
  '5451': 'groceries',
  '5462': 'groceries',
  '5499': 'groceries',
  // Fuel, transit, taxis, parking
  '5541': 'mobility',
  '5542': 'mobility',
  '4111': 'mobility',
  '4112': 'mobility',
  '4121': 'mobility',
  '4131': 'mobility',
  '7523': 'mobility',
  // Restaurants, bars, fast food, cinema, recreation
  '5812': 'leisure',
  '5813': 'leisure',
  '5814': 'leisure',
  '5815': 'leisure',
  '5816': 'leisure',
  '7832': 'leisure',
  '7997': 'leisure',
  '7998': 'leisure',
  '7999': 'leisure',
  // Retail
  '5045': 'shopping',
  '5310': 'shopping',
  '5311': 'shopping',
  '5331': 'shopping',
  '5399': 'shopping',
  '5732': 'shopping',
  '5734': 'shopping',
  '5945': 'shopping',
  // Clothing
  '5611': 'clothing',
  '5621': 'clothing',
  '5631': 'clothing',
  '5641': 'clothing',
  '5651': 'clothing',
  '5661': 'clothing',
  '5691': 'clothing',
  '5699': 'clothing',
  // Furniture, health, telecom
  '5712': HOUSING_CATEGORY_ID,
  '5912': 'health',
  '7298': 'health',
  '4814': 'telecom',
  '4899': 'subscriptions',
}
