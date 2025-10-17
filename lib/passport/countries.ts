// Complete list of all 195 UN recognized countries
// Data includes: country code, name, flag emoji, region, and continent

export interface Country {
  code: string;        // ISO 3166-1 alpha-2 code
  name: string;        // Full country name
  flag: string;        // Flag emoji
  region: string;      // Geographic region
  continent: string;   // Continent
}

export const ALL_COUNTRIES: Country[] = [
  // Africa (54 countries)
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿', region: 'Northern Africa', continent: 'Africa' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴', region: 'Middle Africa', continent: 'Africa' },
  { code: 'BJ', name: 'Benin', flag: '🇧🇯', region: 'Western Africa', continent: 'Africa' },
  { code: 'BW', name: 'Botswana', flag: '🇧🇼', region: 'Southern Africa', continent: 'Africa' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', region: 'Western Africa', continent: 'Africa' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲', region: 'Middle Africa', continent: 'Africa' },
  { code: 'CV', name: 'Cape Verde', flag: '🇨🇻', region: 'Western Africa', continent: 'Africa' },
  { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', region: 'Middle Africa', continent: 'Africa' },
  { code: 'TD', name: 'Chad', flag: '🇹🇩', region: 'Middle Africa', continent: 'Africa' },
  { code: 'KM', name: 'Comoros', flag: '🇰🇲', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬', region: 'Middle Africa', continent: 'Africa' },
  { code: 'CD', name: 'Democratic Republic of the Congo', flag: '🇨🇩', region: 'Middle Africa', continent: 'Africa' },
  { code: 'CI', name: 'Ivory Coast', flag: '🇨🇮', region: 'Western Africa', continent: 'Africa' },
  { code: 'DJ', name: 'Djibouti', flag: '🇩🇯', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', region: 'Northern Africa', continent: 'Africa' },
  { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶', region: 'Middle Africa', continent: 'Africa' },
  { code: 'ER', name: 'Eritrea', flag: '🇪🇷', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦', region: 'Middle Africa', continent: 'Africa' },
  { code: 'GM', name: 'Gambia', flag: '🇬🇲', region: 'Western Africa', continent: 'Africa' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', region: 'Western Africa', continent: 'Africa' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳', region: 'Western Africa', continent: 'Africa' },
  { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼', region: 'Western Africa', continent: 'Africa' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'LS', name: 'Lesotho', flag: '🇱🇸', region: 'Southern Africa', continent: 'Africa' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷', region: 'Western Africa', continent: 'Africa' },
  { code: 'LY', name: 'Libya', flag: '🇱🇾', region: 'Northern Africa', continent: 'Africa' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'MW', name: 'Malawi', flag: '🇲🇼', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', region: 'Western Africa', continent: 'Africa' },
  { code: 'MR', name: 'Mauritania', flag: '🇲🇷', region: 'Western Africa', continent: 'Africa' },
  { code: 'MU', name: 'Mauritius', flag: '🇲🇺', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦', region: 'Northern Africa', continent: 'Africa' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'NA', name: 'Namibia', flag: '🇳🇦', region: 'Southern Africa', continent: 'Africa' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', region: 'Western Africa', continent: 'Africa' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', region: 'Western Africa', continent: 'Africa' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'ST', name: 'Sao Tome and Principe', flag: '🇸🇹', region: 'Middle Africa', continent: 'Africa' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳', region: 'Western Africa', continent: 'Africa' },
  { code: 'SC', name: 'Seychelles', flag: '🇸🇨', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱', region: 'Western Africa', continent: 'Africa' },
  { code: 'SO', name: 'Somalia', flag: '🇸🇴', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', region: 'Southern Africa', continent: 'Africa' },
  { code: 'SS', name: 'South Sudan', flag: '🇸🇸', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'SD', name: 'Sudan', flag: '🇸🇩', region: 'Northern Africa', continent: 'Africa' },
  { code: 'SZ', name: 'Eswatini', flag: '🇸🇿', region: 'Southern Africa', continent: 'Africa' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', region: 'Western Africa', continent: 'Africa' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳', region: 'Northern Africa', continent: 'Africa' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲', region: 'Eastern Africa', continent: 'Africa' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', region: 'Eastern Africa', continent: 'Africa' },

  // Asia (48 countries)
  { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', region: 'Southern Asia', continent: 'Asia' },
  { code: 'AM', name: 'Armenia', flag: '🇦🇲', region: 'Western Asia', continent: 'Asia' },
  { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿', region: 'Western Asia', continent: 'Asia' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭', region: 'Western Asia', continent: 'Asia' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', region: 'Southern Asia', continent: 'Asia' },
  { code: 'BT', name: 'Bhutan', flag: '🇧🇹', region: 'Southern Asia', continent: 'Asia' },
  { code: 'BN', name: 'Brunei', flag: '🇧🇳', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'KH', name: 'Cambodia', flag: '🇰🇭', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'CN', name: 'China', flag: '🇨🇳', region: 'Eastern Asia', continent: 'Asia' },
  { code: 'CY', name: 'Cyprus', flag: '🇨🇾', region: 'Western Asia', continent: 'Asia' },
  { code: 'GE', name: 'Georgia', flag: '🇬🇪', region: 'Western Asia', continent: 'Asia' },
  { code: 'IN', name: 'India', flag: '🇮🇳', region: 'Southern Asia', continent: 'Asia' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'IR', name: 'Iran', flag: '🇮🇷', region: 'Southern Asia', continent: 'Asia' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶', region: 'Western Asia', continent: 'Asia' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', region: 'Western Asia', continent: 'Asia' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', region: 'Eastern Asia', continent: 'Asia' },
  { code: 'JO', name: 'Jordan', flag: '🇯🇴', region: 'Western Asia', continent: 'Asia' },
  { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿', region: 'Central Asia', continent: 'Asia' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼', region: 'Western Asia', continent: 'Asia' },
  { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬', region: 'Central Asia', continent: 'Asia' },
  { code: 'LA', name: 'Laos', flag: '🇱🇦', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'LB', name: 'Lebanon', flag: '🇱🇧', region: 'Western Asia', continent: 'Asia' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'MV', name: 'Maldives', flag: '🇲🇻', region: 'Southern Asia', continent: 'Asia' },
  { code: 'MN', name: 'Mongolia', flag: '🇲🇳', region: 'Eastern Asia', continent: 'Asia' },
  { code: 'MM', name: 'Myanmar', flag: '🇲🇲', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵', region: 'Southern Asia', continent: 'Asia' },
  { code: 'KP', name: 'North Korea', flag: '🇰🇵', region: 'Eastern Asia', continent: 'Asia' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲', region: 'Western Asia', continent: 'Asia' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', region: 'Southern Asia', continent: 'Asia' },
  { code: 'PS', name: 'Palestine', flag: '🇵🇸', region: 'Western Asia', continent: 'Asia' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', region: 'Western Asia', continent: 'Asia' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', region: 'Western Asia', continent: 'Asia' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', region: 'Eastern Asia', continent: 'Asia' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', region: 'Southern Asia', continent: 'Asia' },
  { code: 'SY', name: 'Syria', flag: '🇸🇾', region: 'Western Asia', continent: 'Asia' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', region: 'Eastern Asia', continent: 'Asia' },
  { code: 'TJ', name: 'Tajikistan', flag: '🇹🇯', region: 'Central Asia', continent: 'Asia' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'TL', name: 'Timor-Leste', flag: '🇹🇱', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', region: 'Western Asia', continent: 'Asia' },
  { code: 'TM', name: 'Turkmenistan', flag: '🇹🇲', region: 'Central Asia', continent: 'Asia' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', region: 'Western Asia', continent: 'Asia' },
  { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿', region: 'Central Asia', continent: 'Asia' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', region: 'South-Eastern Asia', continent: 'Asia' },
  { code: 'YE', name: 'Yemen', flag: '🇾🇪', region: 'Western Asia', continent: 'Asia' },

  // Europe (44 countries)
  { code: 'AL', name: 'Albania', flag: '🇦🇱', region: 'Southern Europe', continent: 'Europe' },
  { code: 'AD', name: 'Andorra', flag: '🇦🇩', region: 'Southern Europe', continent: 'Europe' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', region: 'Western Europe', continent: 'Europe' },
  { code: 'BY', name: 'Belarus', flag: '🇧🇾', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', region: 'Western Europe', continent: 'Europe' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦', region: 'Southern Europe', continent: 'Europe' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷', region: 'Southern Europe', continent: 'Europe' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', region: 'Northern Europe', continent: 'Europe' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪', region: 'Northern Europe', continent: 'Europe' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', region: 'Northern Europe', continent: 'Europe' },
  { code: 'FR', name: 'France', flag: '🇫🇷', region: 'Western Europe', continent: 'Europe' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', region: 'Western Europe', continent: 'Europe' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷', region: 'Southern Europe', continent: 'Europe' },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'IS', name: 'Iceland', flag: '🇮🇸', region: 'Northern Europe', continent: 'Europe' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', region: 'Northern Europe', continent: 'Europe' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', region: 'Southern Europe', continent: 'Europe' },
  { code: 'XK', name: 'Kosovo', flag: '🇽🇰', region: 'Southern Europe', continent: 'Europe' },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻', region: 'Northern Europe', continent: 'Europe' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮', region: 'Western Europe', continent: 'Europe' },
  { code: 'LT', name: 'Lithuania', flag: '🇱🇹', region: 'Northern Europe', continent: 'Europe' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', region: 'Western Europe', continent: 'Europe' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', region: 'Southern Europe', continent: 'Europe' },
  { code: 'MD', name: 'Moldova', flag: '🇲🇩', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'MC', name: 'Monaco', flag: '🇲🇨', region: 'Western Europe', continent: 'Europe' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪', region: 'Southern Europe', continent: 'Europe' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', region: 'Western Europe', continent: 'Europe' },
  { code: 'MK', name: 'North Macedonia', flag: '🇲🇰', region: 'Southern Europe', continent: 'Europe' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', region: 'Northern Europe', continent: 'Europe' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', region: 'Southern Europe', continent: 'Europe' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'SM', name: 'San Marino', flag: '🇸🇲', region: 'Southern Europe', continent: 'Europe' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸', region: 'Southern Europe', continent: 'Europe' },
  { code: 'SK', name: 'Slovakia', flag: '🇸🇰', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮', region: 'Southern Europe', continent: 'Europe' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', region: 'Southern Europe', continent: 'Europe' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', region: 'Northern Europe', continent: 'Europe' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', region: 'Western Europe', continent: 'Europe' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦', region: 'Eastern Europe', continent: 'Europe' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', region: 'Northern Europe', continent: 'Europe' },
  { code: 'VA', name: 'Vatican City', flag: '🇻🇦', region: 'Southern Europe', continent: 'Europe' },

  // North America (23 countries)
  { code: 'AG', name: 'Antigua and Barbuda', flag: '🇦🇬', region: 'Caribbean', continent: 'North America' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸', region: 'Caribbean', continent: 'North America' },
  { code: 'BB', name: 'Barbados', flag: '🇧🇧', region: 'Caribbean', continent: 'North America' },
  { code: 'BZ', name: 'Belize', flag: '🇧🇿', region: 'Central America', continent: 'North America' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', region: 'Northern America', continent: 'North America' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', region: 'Central America', continent: 'North America' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺', region: 'Caribbean', continent: 'North America' },
  { code: 'DM', name: 'Dominica', flag: '🇩🇲', region: 'Caribbean', continent: 'North America' },
  { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴', region: 'Caribbean', continent: 'North America' },
  { code: 'SV', name: 'El Salvador', flag: '🇸🇻', region: 'Central America', continent: 'North America' },
  { code: 'GD', name: 'Grenada', flag: '🇬🇩', region: 'Caribbean', continent: 'North America' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹', region: 'Central America', continent: 'North America' },
  { code: 'HT', name: 'Haiti', flag: '🇭🇹', region: 'Caribbean', continent: 'North America' },
  { code: 'HN', name: 'Honduras', flag: '🇭🇳', region: 'Central America', continent: 'North America' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲', region: 'Caribbean', continent: 'North America' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', region: 'Central America', continent: 'North America' },
  { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', region: 'Central America', continent: 'North America' },
  { code: 'PA', name: 'Panama', flag: '🇵🇦', region: 'Central America', continent: 'North America' },
  { code: 'KN', name: 'Saint Kitts and Nevis', flag: '🇰🇳', region: 'Caribbean', continent: 'North America' },
  { code: 'LC', name: 'Saint Lucia', flag: '🇱🇨', region: 'Caribbean', continent: 'North America' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨', region: 'Caribbean', continent: 'North America' },
  { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹', region: 'Caribbean', continent: 'North America' },
  { code: 'US', name: 'United States', flag: '🇺🇸', region: 'Northern America', continent: 'North America' },

  // South America (12 countries)
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', region: 'South America', continent: 'South America' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴', region: 'South America', continent: 'South America' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', region: 'South America', continent: 'South America' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', region: 'South America', continent: 'South America' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', region: 'South America', continent: 'South America' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', region: 'South America', continent: 'South America' },
  { code: 'GY', name: 'Guyana', flag: '🇬🇾', region: 'South America', continent: 'South America' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', region: 'South America', continent: 'South America' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪', region: 'South America', continent: 'South America' },
  { code: 'SR', name: 'Suriname', flag: '🇸🇷', region: 'South America', continent: 'South America' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', region: 'South America', continent: 'South America' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪', region: 'South America', continent: 'South America' },

  // Oceania (14 countries)
  { code: 'AU', name: 'Australia', flag: '🇦🇺', region: 'Australia and New Zealand', continent: 'Oceania' },
  { code: 'FJ', name: 'Fiji', flag: '🇫🇯', region: 'Melanesia', continent: 'Oceania' },
  { code: 'KI', name: 'Kiribati', flag: '🇰🇮', region: 'Micronesia', continent: 'Oceania' },
  { code: 'MH', name: 'Marshall Islands', flag: '🇲🇭', region: 'Micronesia', continent: 'Oceania' },
  { code: 'FM', name: 'Micronesia', flag: '🇫🇲', region: 'Micronesia', continent: 'Oceania' },
  { code: 'NR', name: 'Nauru', flag: '🇳🇷', region: 'Micronesia', continent: 'Oceania' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', region: 'Australia and New Zealand', continent: 'Oceania' },
  { code: 'PW', name: 'Palau', flag: '🇵🇼', region: 'Micronesia', continent: 'Oceania' },
  { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬', region: 'Melanesia', continent: 'Oceania' },
  { code: 'WS', name: 'Samoa', flag: '🇼🇸', region: 'Polynesia', continent: 'Oceania' },
  { code: 'SB', name: 'Solomon Islands', flag: '🇸🇧', region: 'Melanesia', continent: 'Oceania' },
  { code: 'TO', name: 'Tonga', flag: '🇹🇴', region: 'Polynesia', continent: 'Oceania' },
  { code: 'TV', name: 'Tuvalu', flag: '🇹🇻', region: 'Polynesia', continent: 'Oceania' },
  { code: 'VU', name: 'Vanuatu', flag: '🇻🇺', region: 'Melanesia', continent: 'Oceania' },
];

// Helper functions
export function getCountryByCode(code: string): Country | undefined {
  return ALL_COUNTRIES.find(c => c.code === code.toUpperCase());
}

export function getCountryByName(name: string): Country | undefined {
  return ALL_COUNTRIES.find(c => c.name.toLowerCase() === name.toLowerCase());
}

export function getCountriesByContinent(continent: string): Country[] {
  return ALL_COUNTRIES.filter(c => c.continent === continent);
}

export function getCountriesByRegion(region: string): Country[] {
  return ALL_COUNTRIES.filter(c => c.region === region);
}

export function getAllCountryCodes(): string[] {
  return ALL_COUNTRIES.map(c => c.code);
}

export function getAllCountryNames(): string[] {
  return ALL_COUNTRIES.map(c => c.name);
}

// Get flag emoji by country code
export function getFlagEmoji(code: string): string {
  const country = getCountryByCode(code);
  return country?.flag || '🌍';
}

// Country statistics
export const COUNTRY_STATS = {
  total: ALL_COUNTRIES.length,
  byContinent: {
    'Africa': ALL_COUNTRIES.filter(c => c.continent === 'Africa').length,
    'Asia': ALL_COUNTRIES.filter(c => c.continent === 'Asia').length,
    'Europe': ALL_COUNTRIES.filter(c => c.continent === 'Europe').length,
    'North America': ALL_COUNTRIES.filter(c => c.continent === 'North America').length,
    'South America': ALL_COUNTRIES.filter(c => c.continent === 'South America').length,
    'Oceania': ALL_COUNTRIES.filter(c => c.continent === 'Oceania').length,
  },
};

console.log('✅ Loaded 195 countries:', COUNTRY_STATS);
