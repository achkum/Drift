// Official links for taking action on ads and recommendations, plus plain explanations of ad
// tricks. Server-safe. Links checked on 2026-10-18 (each resolves on the platform's own domain).
import type { AdTactic, Platform } from '@/lib/types';

export interface ActionLink {
  title: string;
  detail: string;
  href: string;
}

export interface PlatformActions {
  id: 'google' | 'youtube' | 'tiktok' | 'instagram';
  label: string;
  /** Data platforms this group applies to, to order groups by what the user imported. */
  platforms: Platform[];
  links: ActionLink[];
}

/** "Take action" on the ads screen: who can target you and with what. */
export const AD_ACTIONS: PlatformActions[] = [
  {
    id: 'google',
    label: 'Google and YouTube ads',
    platforms: ['youtube', 'google_search'],
    links: [
      { title: 'My Ad Center', detail: 'Turn off personalised ads or remove topics and brands Google uses for ads.', href: 'https://myadcenter.google.com/' },
      { title: 'How Google personalises ads', detail: 'Google’s help page for My Ad Center.', href: 'https://support.google.com/My-Ad-Center-Help/answer/12155656' },
    ],
  },
  {
    id: 'youtube',
    label: 'YouTube history',
    platforms: ['youtube'],
    links: [
      { title: 'YouTube watch and search history', detail: 'Delete or pause the history YouTube uses for ads and recommendations.', href: 'https://myactivity.google.com/product/youtube' },
      { title: 'Manage your recommendations', detail: 'YouTube help: Not interested, Don’t recommend channel, pause history.', href: 'https://support.google.com/youtube/answer/6342839' },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok ads',
    platforms: ['tiktok'],
    links: [
      { title: 'How your TikTok ads are personalised', detail: 'TikTok help: manage ad topics in Settings and privacy, Ads.', href: 'https://support.tiktok.com/en/account-and-privacy/personalized-ads-and-data/how-your-ads-are-personalized' },
      { title: 'Ads and your data', detail: 'TikTok Privacy Center: mute advertisers, clear ad activity.', href: 'https://www.tiktok.com/privacy/ads-and-your-data/en' },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram and Meta ads',
    platforms: ['instagram'],
    links: [
      { title: 'Ad preferences in Accounts Center', detail: 'See advertisers you’ve seen, hide them, and limit ad topics. Sign-in needed.', href: 'https://accountscenter.instagram.com/ad_preferences' },
    ],
  },
];

/** "Take action" on a topic page: each platform's official recommendation controls. */
export const RECOMMENDATION_ACTIONS: Partial<Record<Platform, ActionLink[]>> = {
  youtube: [
    { title: 'Manage your recommendations', detail: 'YouTube help: Not interested, Don’t recommend channel.', href: 'https://support.google.com/youtube/answer/6342839' },
    { title: 'View, delete or pause watch history', detail: 'YouTube help: start over with a clean history.', href: 'https://support.google.com/youtube/answer/95725' },
    { title: 'Your YouTube history', detail: 'Delete videos from your history in Google My Activity.', href: 'https://myactivity.google.com/product/youtube' },
  ],
  tiktok: [
    { title: 'How TikTok recommends videos', detail: 'TikTok: Not interested, keyword filters and refreshing your For You feed.', href: 'https://www.tiktok.com/safety/en/policies-and-engagement/recommendation-system' },
  ],
  instagram: [
    { title: 'How suggested posts are chosen', detail: 'Instagram help: why posts are suggested to you.', href: 'https://help.instagram.com/381638392275939' },
    { title: 'Undo or review Not interested', detail: 'Instagram help: your Not interested list.', href: 'https://help.instagram.com/iphone-app/1856051198102846' },
  ],
};

const TACTIC_EXPLAIN: Record<string, string> = {
  fake_urgency: 'Countdowns, “ends tonight” and “only 3 left” push you to buy before you think. The same offer is often back a week later.',
  fake_discount: 'A big crossed-out price makes an ordinary price look like a bargain. Often nothing ever sold at the higher price.',
  fear: 'The ad makes you worried about your health, safety, money or family, then sells the fix.',
  scam: 'Guaranteed returns, free prizes or a famous name that isn’t really involved. Don’t click, pay or give details.',
  before_after: 'Before-and-after photos are easy to stage or edit and rarely show typical results.',
  too_good: 'Promises that sound effortless or impossible, like big results in days. Real results take longer and cost more.',
};

export function tacticExplanation(t: AdTactic): string {
  return TACTIC_EXPLAIN[t.id] ?? 'A pressure technique that tries to get you to act before you think it through.';
}

/** GDPR Article 17 erasure request. The user copies and sends it themselves. */
export function erasureRequest(company: string, today = new Date()): string {
  const name = company.trim() || '[Company name]';
  const date = `${today.getDate()} ${today.toLocaleString('en-GB', { month: 'long' })} ${today.getFullYear()}`;
  return [
    `To: ${name}, Data Protection Officer`,
    `Date: ${date}`,
    'Subject: Request to erase my personal data (GDPR Article 17)',
    '',
    'Hello,',
    '',
    `I am writing to ask ${name} to erase all personal data you hold about me, under Article 17 of the General Data Protection Regulation (GDPR).`,
    '',
    'This includes any data you received from or shared with advertising platforms such as Google, YouTube, TikTok, Instagram or Facebook (Meta), including customer lists, audience lists, interest or behaviour profiles, and identifiers linked to me.',
    '',
    'I also object to the processing of my personal data for direct marketing under Article 21(2) GDPR. Please stop using my data to target ads at me.',
    '',
    'Please confirm within one month of receiving this request (Article 12(3) GDPR) that my data has been erased, and tell any third parties you shared it with (Article 19 GDPR).',
    '',
    'Details to help you find my data:',
    'Full name: [Your name]',
    'Email address: [The email you use with the platforms]',
    'Phone number (optional): [Your phone number]',
    '',
    'Please do not ask for more information than you need to identify me.',
    '',
    'Thank you,',
    '[Your name]',
  ].join('\n');
}
