import type { Signal } from '../../src/lib/types';

/**
 * Known scam patterns: free, instant. Each rule adds risk once per message.
 * Written for the scams that are common right now in the US (toll, package, utility shut-off, tech support,
 * gift cards, crypto, fake jobs), plus a few French words.
 */
interface Rule { re: RegExp; weight: number; title: string; detail: string }

const RULES: Rule[] = [
  { re: /\b(gift ?cards?|itunes card|google play (gift )?card|steam card|apple gift card|carte cadeau)\b/i, weight: 35, title: 'Asks for gift cards', detail: 'Real companies and government offices never ask to be paid with gift cards.' },
  { re: /\b(bitcoin|btc|usdt|tether|crypto(currency)?|bitcoin atm|crypto wallet)\b/i, weight: 28, title: 'Asks for cryptocurrency', detail: 'Payment in crypto can never be refunded: a favourite of scammers.' },
  { re: /\b(anydesk|teamviewer|ultraviewer|rustdesk|quick ?assist|remote (access|support) app|share your screen)\b/i, weight: 30, title: 'Wants control of your device', detail: 'Remote-access apps let a stranger see and use your computer or phone, including your bank.' },
  { re: /\b(wire transfer|western union|moneygram|zelle|cash ?app|venmo|paypal friends)\b.{0,80}\b(send|pay|transfer|payment)|\b(send|pay|transfer)\b.{0,80}\b(wire transfer|western union|moneygram|zelle|cash ?app|venmo)\b/i, weight: 20, title: 'Asks for a money transfer', detail: 'Zelle, Cash App, Venmo and wires are like cash: once sent, it is usually gone.' },
  { re: /\b(one[- ]time (pass)?code|verification code|security code|passcode|password|\bpin\b|social security number|\bssn\b|routing number|account number|card number|cvv|mot de passe|code de v[ée]rification)\b/i, weight: 18, title: 'Asks for a code, password or account number', detail: 'Never share codes, passwords or account numbers with someone who contacted you.' },
  { re: /\b(verify|confirm|update|validate|unlock|restore|reactivate) (your )?(account|identity|details|information|payment|billing|card|login)|v[ée]rifie[rz]? votre compte/i, weight: 15, title: '"Verify your account"', detail: 'A classic phishing line, meant to send you to a fake login page.' },
  { re: /\b(within \d+ (hours?|minutes?)|in \d+ (hours?|minutes?)|immediately|act now|urgent(ly)?|final (notice|warning|reminder)|last (chance|warning)|expires? (today|tonight|in \d+)|today only|right away|asap|imm[ée]diatement|dernier (avis|rappel))\b/i, weight: 12, title: 'Pressure to act fast', detail: 'Scammers rush you so you don’t stop to check.' },
  { re: /\b(arrest(ed)?|warrant|lawsuit|legal action|police|deport(ed|ation)?|jail|prosecut\w*|court (date|summons)|suspended|frozen|locked|terminated|blocked)\b/i, weight: 14, title: 'Threats (arrest, suspended account…)', detail: 'Frightening you is a way to make you act without thinking.' },
  { re: /\b(you('ve| have)? won|you are (a|the) winner|lottery|sweepstakes?|jackpot|claim your (prize|reward|gift)|congratulations[^.]{0,60}(won|selected|chosen)|vous avez gagn[ée])\b/i, weight: 22, title: 'Prize or lottery you didn’t enter', detail: 'You can’t win a contest you never entered, and real prizes never cost money to claim.' },
  { re: /\b(usps|ups|fedex|dhl|la poste|colis|package|parcel|shipment|delivery)\b.{0,120}\b(failed|unable|held|on hold|incomplete|update (your )?address|redeliver|re-?delivery|customs fee|fee|pay|frais)\b/i, weight: 18, title: 'Package delivery problem', detail: 'Fake "we couldn’t deliver your package" texts are one of the most common scams.' },
  { re: /\b(toll|e-?zpass|sunpass|fastrak|txtag|peach pass|ipass|toll ?road)\b.{0,120}\b(unpaid|balance|due|owe|fee|penalt|outstanding|late)/i, weight: 25, title: 'Unpaid toll message', detail: 'Unpaid-toll texts are a huge scam wave. Check only on your toll account’s real website.' },
  { re: /\b(duke energy|electric(ity)?|power company|utility|gas company|water (bill|company))\b.{0,140}\b(disconnect|shut ?off|cut off|terminat|past due)/i, weight: 20, title: 'Utility shut-off threat', detail: 'Utilities send written notices well in advance and never demand instant payment by phone, gift card or crypto.' },
  { re: /\b(virus|infected|hacked|compromised|malware|microsoft support|apple support|windows support|geek ?squad|norton|mcafee|best ?buy)\b.{0,140}\b(call|renew|subscription|charged|refund|invoice|order)\b/i, weight: 18, title: 'Tech support or fake subscription', detail: 'Fake "your subscription renewed" or "your computer is infected" messages want you to call them.' },
  { re: /\b(your (subscription|membership|order|account) (has been|was|will be) (renewed|charged|debited|billed)|auto[- ]?renew(al)?)\b/i, weight: 10, title: '"You were charged" surprise', detail: 'Made to scare you into calling to "cancel" — the number connects to the scammer.' },
  { re: /\b(irs|social security|\bssa\b|medicare|tax refund|stimulus|unclaimed (money|funds|property)|government grant)\b.{0,140}\b(suspend|owe|arrest|refund|claim|verify|grant|penalt)/i, weight: 20, title: 'Government agency claim', detail: 'The IRS, Social Security and Medicare contact you by mail first and never threaten arrest by text or phone.' },
  { re: /\b(guaranteed (returns?|profits?)|double your money|investment opportunity|risk[- ]free (investment|returns)|trading (signals|mentor|group))\b/i, weight: 25, title: 'Too-good-to-be-true investment', detail: 'Nobody can guarantee investment returns.' },
  { re: /\b(work from home|remote (job|position)|hiring|part[- ]time job|job offer)\b.{0,140}(\$\s?\d{2,}|per (day|hour|week)|telegram|whatsapp|no experience)/i, weight: 16, title: 'Job offer that seems too easy', detail: 'Fake jobs often move to Telegram/WhatsApp, pay too much, or ask you to buy equipment or move money.' },
  { re: /\b(refund|overpaid|overpayment|reimburse(ment)?)\b/i, weight: 8, title: 'Refund or overpayment', detail: 'Fake refunds and "we paid you too much" are used to make you send money back.' },
  { re: /\b(don'?t tell|do not (tell|share this with)|keep (this|it) (secret|confidential|between us))\b/i, weight: 15, title: 'Asks you to keep it secret', detail: 'Scammers isolate you so family or your bank can’t warn you.' },
  { re: /\b(click (the |this )?(link|here|below)|tap (the |this )?link|cliquez (ici|sur le lien))\b/i, weight: 6, title: 'Pushes you to click a link', detail: 'Go to the company’s website or app yourself instead.' },
  { re: /\b(hi|hello) (dear|my dear|beautiful|handsome)|\bwrong number\b|\bis this [A-Z][a-z]+\?/i, weight: 8, title: '"Wrong number" or overly friendly stranger', detail: 'A common start for romance and fake-investment scams.' },
];

/** The known-pattern signals found in a message. */
export function patternSignals(text: string): Signal[] {
  const t = text.slice(0, 20_000);
  return RULES.filter((r) => r.re.test(t)).map((r) => ({ source: 'pattern' as const, level: r.weight >= 15 ? 'bad' as const : 'warn' as const, title: r.title, detail: r.detail, weight: r.weight }));
}
