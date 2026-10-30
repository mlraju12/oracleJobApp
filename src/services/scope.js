const US_STATE = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/i;
const US_CODE = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;
const US_COUNTRY = /\b(united states|u\.s\.a\.?|usa)\b/i;
const NON_US = /\b(india|united kingdom|england|scotland|wales|germany|deutschland|france|canada|australia|singapore|philippines|mexico|brazil|ireland|poland|romania|netherlands|spain|italy|japan|china|dubai|bangalore|bengaluru|hyderabad|pune|chennai|noida|kochi|mumbai|dublin|berlin|london|toronto)\b/i;

function locationBlob(opportunity) {
  return (opportunity.locations || [])
    .map((location) => [location.label, location.locality, location.region, location.country].filter(Boolean).join(' '))
    .join(' | ');
}

function hasUsSignal(text) {
  return US_COUNTRY.test(text) || US_STATE.test(text) || US_CODE.test(text);
}

function withinUsaScope(opportunity) {
  const places = locationBlob(opportunity);
  const restrictions = ((opportunity.geography && opportunity.geography.restrictions) || []).join(' ');
  const statedNonUs = NON_US.test(restrictions) && !hasUsSignal(restrictions);
  if (opportunity.workplace === 'remote') {
    if (opportunity.geography && opportunity.geography.status === 'stated' && statedNonUs) return false;
    return true;
  }
  if (hasUsSignal(places) || hasUsSignal(restrictions)) return true;
  if (NON_US.test(places) || statedNonUs) return false;
  return true;
}

module.exports = {
  withinUsaScope,
};
