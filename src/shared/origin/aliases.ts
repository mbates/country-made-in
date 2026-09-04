import type { Alpha2 } from './types'

/**
 * Hand-maintained aliases, on top of the ICU name each country already has.
 *
 * Every entry here is a name a real product listing uses: ISO long forms, the
 * colloquial names ICU does not carry, former names still printed on packaging, and
 * the abbreviations. The prior art had no alias table at all, so `Viet Nam`,
 * `Republic of Korea` and `Great Britain` resolved to nothing.
 *
 * `St.` forms and parenthesised alternatives are derived automatically from the ICU
 * names in `countries.ts`, so they are not repeated here.
 */
export const COUNTRY_ALIASES: Readonly<Partial<Record<Alpha2, readonly string[]>>> = {
  AE: ['UAE', 'U.A.E.', 'United Arab Emirates'],
  BN: ['Brunei Darussalam'],
  BO: ['Plurinational State of Bolivia'],
  CD: [
    'DR Congo',
    'DRC',
    'Democratic Republic of the Congo',
    'Democratic Republic of Congo',
    'Congo-Kinshasa',
    'Zaire',
  ],
  CG: ['Republic of the Congo', 'Congo-Brazzaville'],
  CI: ["Cote d'Ivoire", 'Ivory Coast'],
  CN: ["People's Republic of China", 'PRC', 'Mainland China'],
  CV: ['Cabo Verde'],
  CZ: ['Czech Republic'],
  FM: ['Federated States of Micronesia'],
  GB: [
    'UK',
    'U.K.',
    'GB',
    'Great Britain',
    'Britain',
    'England',
    'Scotland',
    'Wales',
    'Northern Ireland',
  ],
  IR: ['Islamic Republic of Iran'],
  KP: ["Democratic People's Republic of Korea", 'DPRK', 'Korea, North'],
  KR: ['Republic of Korea', 'ROK', 'Korea, South', 'Korea'],
  LA: ["Lao People's Democratic Republic", 'Lao PDR'],
  MD: ['Republic of Moldova'],
  MK: ['Macedonia', 'FYROM'],
  MM: ['Burma'],
  MO: ['Macau'],
  NL: ['Holland', 'The Netherlands'],
  PS: ['Palestine', 'State of Palestine'],
  RU: ['Russian Federation'],
  SY: ['Syrian Arab Republic'],
  SZ: ['Swaziland'],
  TL: ['East Timor'],
  TR: ['Turkey', 'Turkiye'],
  TW: ['Taiwan, Province of China', 'Chinese Taipei', 'Republic of China'],
  TZ: ['United Republic of Tanzania'],
  US: ['USA', 'U.S.A.', 'US', 'U.S.', 'United States of America'],
  VA: ['Holy See', 'Vatican', 'Vatican City'],
  VE: ['Bolivarian Republic of Venezuela'],
  VN: ['Viet Nam', 'Socialist Republic of Vietnam'],
}

/**
 * Must never resolve, and there is a test that says so.
 *
 * `Congo` alone is genuinely ambiguous between Congo - Kinshasa and
 * Congo - Brazzaville, and neither ICU name nor any alias makes the bare word
 * resolvable. Guessing between them would be exactly the prior art's failure mode.
 */
export const DELIBERATELY_UNMAPPED: readonly string[] = ['Congo']
