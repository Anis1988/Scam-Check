import { findPhoneNumbersInText, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { PhoneInfo, Signal } from '../src/lib/types';

/**
 * Phone lookup, free (Google's phone number rules, built in): country, type (mobile, landline, internet/VoIP,
 * toll-free, premium-rate), and area codes known for "one-ring" call-back scams.
 */

// Caribbean area codes that look like US numbers but are international (expensive to call back).
const ONE_RING: Record<string, string> = {
  '268': 'Antigua', '284': 'British Virgin Islands', '441': 'Bermuda', '473': 'Grenada', '649': 'Turks and Caicos', '664': 'Montserrat',
  '758': 'St Lucia', '767': 'Dominica', '784': 'St Vincent', '809': 'Dominican Republic', '829': 'Dominican Republic', '849': 'Dominican Republic',
  '868': 'Trinidad and Tobago', '869': 'St Kitts', '876': 'Jamaica', '232': 'Sierra Leone (+232)',
};
const TYPE: Record<string, string> = { MOBILE: 'mobile', FIXED_LINE: 'landline', FIXED_LINE_OR_MOBILE: 'mobile or landline', VOIP: 'internet (VoIP) number', TOLL_FREE: 'toll-free', PREMIUM_RATE: 'premium-rate (costly to call)', SHARED_COST: 'shared-cost', PERSONAL_NUMBER: 'personal number', PAGER: 'pager', UAN: 'company number', VOICEMAIL: 'voicemail' };

/** Phone numbers written in a text (plus the "from" number typed by the user). */
export function findPhones(text: string, extra: string[] = []): string[] {
  const found = findPhoneNumbersInText(text.slice(0, 20_000), 'US').map((m) => m.number.number);
  const typed = extra.map((x) => parsePhoneNumberFromString(x, 'US')?.number).filter((x): x is NonNullable<typeof x> => !!x);
  return [...new Set([...typed, ...found])].slice(0, 6);
}

export function checkPhones(numbers: string[]): { phones: PhoneInfo[]; signals: Signal[] } {
  const phones: PhoneInfo[] = [];
  const signals: Signal[] = [];
  for (const raw of numbers) {
    const p = parsePhoneNumberFromString(raw, 'US');
    if (!p) continue;
    const shown = p.formatInternational();
    const type = p.getType();
    const notes: string[] = [];
    let level: Signal['level'] = 'info';
    const add = (s: Omit<Signal, 'source'>) => {
      signals.push({ source: 'phone', ...s });
      notes.push(s.title);
      if (s.level === 'bad' || (s.level === 'warn' && level !== 'bad')) level = s.level;
    };
    const area = p.countryCallingCode === '1' ? p.nationalNumber.slice(0, 3) : '';
    if (!p.isValid()) add({ level: 'warn', weight: 8, title: `${shown} is not a real, working number format`, detail: 'Spoofed or made-up numbers are common in scams.' });
    if (ONE_RING[area]) add({ level: 'bad', weight: 20, title: `${shown} is in ${ONE_RING[area]}`, detail: 'It looks like a US number but calling back is an expensive international call ("one-ring" scam).' });
    else if (p.country && p.country !== 'US' && p.country !== 'CA') add({ level: 'warn', weight: 8, title: `${shown} is a foreign number (${p.country})`, detail: 'Check: would this company really contact you from abroad?' });
    if (type === 'PREMIUM_RATE') add({ level: 'bad', weight: 25, title: `${shown} is a premium-rate number`, detail: 'Calling it can cost a lot per minute.' });
    if (type === 'VOIP') add({ level: 'warn', weight: 6, title: `${shown} is an internet (VoIP) number`, detail: 'Anyone can get one in minutes, so it is often used by scammers.' });
    if (type === 'TOLL_FREE' && !notes.length) notes.push('Toll-free: check it matches the number on the company’s real website or your card');
    phones.push({ number: shown, level, note: notes.join(' · ') || [p.country, type ? TYPE[type] ?? type.toLowerCase() : ''].filter(Boolean).join(' · ') || 'Nothing known against it' });
  }
  return { phones, signals };
}
