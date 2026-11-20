import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { AppShell } from '@/components/AppShell';
import { ServiceWorker } from '@/components/ServiceWorker';
import { WebAnalytics } from '@/components/WebAnalytics';
import { BOOT_SCRIPT } from '@/lib/ui/boot';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Drift', template: '%s · Drift' },
  description: 'See how your feeds drift: what platforms serve you versus what you choose. Everything runs on your device.',
  applicationName: 'Drift',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Drift', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#111312' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <ServiceWorker />
        <WebAnalytics />
      </body>
    </html>
  );
}
