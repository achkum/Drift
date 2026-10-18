// Route rules from the wireframe: which screens hide the tab bar, which tab is active.

export type TabId = 'home' | 'timeline' | 'household' | 'settings';

export const TABS: { id: TabId; href: string; label: string }[] = [
  { id: 'home', href: '/home', label: 'Home' },
  { id: 'timeline', href: '/timeline', label: 'Timeline' },
  { id: 'household', href: '/household', label: 'Household' },
  { id: 'settings', href: '/settings', label: 'Settings' },
];

function under(path: string, base: string) {
  return path === base || path.startsWith(`${base}/`);
}

/** Full-screen routes have no tab bar (sign-in, onboarding, connect, invite, teen, alert, ask). */
export function isFullScreen(path: string): boolean {
  return (
    path === '/' ||
    under(path, '/onboarding') ||
    under(path, '/connect') ||
    under(path, '/invite') ||
    under(path, '/teen') ||
    under(path, '/alert') ||
    under(path, '/ask')
  );
}

export function activeTab(path: string): TabId | null {
  if (under(path, '/home') || under(path, '/chosen') || under(path, '/platforms')) return 'home';
  if (under(path, '/timeline') || under(path, '/topic')) return 'timeline';
  if (under(path, '/household') || under(path, '/sharing')) return 'household';
  if (under(path, '/settings')) return 'settings';
  return null;
}

// In-app navigation depth, so Back can use history when the user came from inside the app
// and fall back to the logical parent when the page was opened directly.
let depth = 0;
export function noteNavigation() { depth += 1; }
export function canGoBack() { return depth > 1; }
