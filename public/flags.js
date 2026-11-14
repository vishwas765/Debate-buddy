// Country name -> ISO 3166-1 alpha-2 code, for the flag faces of MUN delegates.
// Flags are square SVGs from flag-icons (MIT), stored in public/flags/.
const CODES = {
  'afghanistan': 'af', 'albania': 'al', 'algeria': 'dz', 'andorra': 'ad', 'angola': 'ao', 'antigua and barbuda': 'ag', 'argentina': 'ar', 'armenia': 'am', 'australia': 'au', 'austria': 'at', 'azerbaijan': 'az',
  'bahamas': 'bs', 'bahrain': 'bh', 'bangladesh': 'bd', 'barbados': 'bb', 'belarus': 'by', 'belgium': 'be', 'belize': 'bz', 'benin': 'bj', 'bhutan': 'bt', 'bolivia': 'bo', 'bosnia and herzegovina': 'ba', 'botswana': 'bw', 'brazil': 'br', 'brunei darussalam': 'bn', 'brunei': 'bn', 'bulgaria': 'bg', 'burkina faso': 'bf', 'burundi': 'bi',
  'cabo verde': 'cv', 'cape verde': 'cv', 'cambodia': 'kh', 'cameroon': 'cm', 'canada': 'ca', 'central african republic': 'cf', 'chad': 'td', 'chile': 'cl', 'china': 'cn', "people's republic of china": 'cn', 'colombia': 'co', 'comoros': 'km', 'congo': 'cg', 'republic of the congo': 'cg', 'costa rica': 'cr', "côte d'ivoire": 'ci', 'cote d\'ivoire': 'ci', 'ivory coast': 'ci', 'croatia': 'hr', 'cuba': 'cu', 'cyprus': 'cy', 'czechia': 'cz', 'czech republic': 'cz',
  "democratic people's republic of korea": 'kp', 'north korea': 'kp', 'dprk': 'kp', 'democratic republic of the congo': 'cd', 'drc': 'cd', 'denmark': 'dk', 'djibouti': 'dj', 'dominica': 'dm', 'dominican republic': 'do',
  'ecuador': 'ec', 'egypt': 'eg', 'el salvador': 'sv', 'equatorial guinea': 'gq', 'eritrea': 'er', 'estonia': 'ee', 'eswatini': 'sz', 'swaziland': 'sz', 'ethiopia': 'et', 'fiji': 'fj', 'finland': 'fi', 'france': 'fr',
  'gabon': 'ga', 'gambia': 'gm', 'the gambia': 'gm', 'georgia': 'ge', 'germany': 'de', 'ghana': 'gh', 'greece': 'gr', 'grenada': 'gd', 'guatemala': 'gt', 'guinea': 'gn', 'guinea-bissau': 'gw', 'guyana': 'gy',
  'haiti': 'ht', 'honduras': 'hn', 'hungary': 'hu', 'iceland': 'is', 'india': 'in', 'indonesia': 'id', 'iran': 'ir', 'islamic republic of iran': 'ir', 'iraq': 'iq', 'ireland': 'ie', 'israel': 'il', 'italy': 'it',
  'jamaica': 'jm', 'japan': 'jp', 'jordan': 'jo', 'kazakhstan': 'kz', 'kenya': 'ke', 'kiribati': 'ki', 'kuwait': 'kw', 'kyrgyzstan': 'kg', "lao people's democratic republic": 'la', 'laos': 'la',
  'latvia': 'lv', 'lebanon': 'lb', 'lesotho': 'ls', 'liberia': 'lr', 'libya': 'ly', 'liechtenstein': 'li', 'lithuania': 'lt', 'luxembourg': 'lu',
  'madagascar': 'mg', 'malawi': 'mw', 'malaysia': 'my', 'maldives': 'mv', 'mali': 'ml', 'malta': 'mt', 'marshall islands': 'mh', 'mauritania': 'mr', 'mauritius': 'mu', 'mexico': 'mx', 'micronesia': 'fm', 'monaco': 'mc', 'mongolia': 'mn', 'montenegro': 'me', 'morocco': 'ma', 'mozambique': 'mz', 'myanmar': 'mm',
  'namibia': 'na', 'nauru': 'nr', 'nepal': 'np', 'netherlands': 'nl', 'the netherlands': 'nl', 'new zealand': 'nz', 'nicaragua': 'ni', 'niger': 'ne', 'nigeria': 'ng', 'north macedonia': 'mk', 'norway': 'no', 'oman': 'om',
  'pakistan': 'pk', 'palau': 'pw', 'panama': 'pa', 'papua new guinea': 'pg', 'paraguay': 'py', 'peru': 'pe', 'philippines': 'ph', 'the philippines': 'ph', 'poland': 'pl', 'portugal': 'pt', 'qatar': 'qa',
  'republic of korea': 'kr', 'south korea': 'kr', 'korea': 'kr', 'republic of moldova': 'md', 'moldova': 'md', 'romania': 'ro', 'russian federation': 'ru', 'russia': 'ru', 'rwanda': 'rw',
  'saint kitts and nevis': 'kn', 'saint lucia': 'lc', 'saint vincent and the grenadines': 'vc', 'samoa': 'ws', 'san marino': 'sm', 'sao tome and principe': 'st', 'saudi arabia': 'sa', 'senegal': 'sn', 'serbia': 'rs', 'seychelles': 'sc', 'sierra leone': 'sl', 'singapore': 'sg', 'slovakia': 'sk', 'slovenia': 'si', 'solomon islands': 'sb', 'somalia': 'so', 'south africa': 'za', 'south sudan': 'ss', 'spain': 'es', 'sri lanka': 'lk', 'sudan': 'sd', 'suriname': 'sr', 'sweden': 'se', 'switzerland': 'ch', 'syrian arab republic': 'sy', 'syria': 'sy',
  'tajikistan': 'tj', 'thailand': 'th', 'timor-leste': 'tl', 'east timor': 'tl', 'togo': 'tg', 'tonga': 'to', 'trinidad and tobago': 'tt', 'tunisia': 'tn', 'türkiye': 'tr', 'turkiye': 'tr', 'turkey': 'tr', 'turkmenistan': 'tm', 'tuvalu': 'tv',
  'uganda': 'ug', 'ukraine': 'ua', 'united arab emirates': 'ae', 'uae': 'ae', 'united kingdom': 'gb', 'uk': 'gb', 'great britain': 'gb', 'united kingdom of great britain and northern ireland': 'gb', 'united republic of tanzania': 'tz', 'tanzania': 'tz',
  'united states of america': 'us', 'united states': 'us', 'usa': 'us', 'us': 'us', 'america': 'us', 'uruguay': 'uy', 'uzbekistan': 'uz', 'vanuatu': 'vu', 'venezuela': 've', 'viet nam': 'vn', 'vietnam': 'vn', 'yemen': 'ye', 'zambia': 'zm', 'zimbabwe': 'zw',
  'holy see': 'va', 'vatican': 'va', 'holy see (observer)': 'va', 'state of palestine': 'ps', 'palestine': 'ps', 'state of palestine (observer)': 'ps', 'european union': 'eu', 'eu': 'eu'
};
export const FLAG_CODES = [...new Set(Object.values(CODES))];

const norm = s => String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\*\*/g, '').replace(/\s*\((?:observer)\)\s*$/, '').replace(/^(the )?(delegate|delegation|representative|ambassador)s? (of|from) (the )?/, '').replace(/[.:]+$/, '').trim();
// Accepts "Brazil", "Delegate of Brazil", "Delegation of the United States" and similar.
export function countryCode(...labels) {
  for (const label of labels) {
    const n = norm(label); if (!n) continue;
    if (CODES[n]) return CODES[n];
    if (CODES['the ' + n]) return CODES['the ' + n];
  }
  return null;
}
export const flagUrl = code => code ? `/flags/${code}.svg` : null;
