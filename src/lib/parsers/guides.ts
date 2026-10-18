// OWNER: parsers agent. Exact manual export steps per platform.
//
// Sources checked (October 2026):
//   Google Takeout:  https://support.google.com/accounts/answer/3024190
//                    https://takeout.google.com/
//   Google My Activity: https://support.google.com/accounts/answer/7028918
//   TikTok:          https://support.tiktok.com/en/account-and-privacy/personalized-ads-and-data/requesting-your-data
//                    https://www.tiktok.com/setting/download-your-data
//                    https://techcrunch.com/2025/01/17/tiktok-ban-how-to-download-your-videos-and-data
//   Instagram:       https://help.instagram.com/181231772500920
//                    https://accountscenter.instagram.com/info_and_permissions/dyi/
//                    https://project05.dona.tf.uni-bielefeld.de/instructions (research data-donation walkthrough)
// Menu labels change; the Instagram flow was renamed from "Download your information" to
// "Export your information" in 2025, so both labels are mentioned.
import type { ExportGuide } from '@/lib/types';

export const exportGuides: Record<ExportGuide['platform'], ExportGuide> = {
  youtube: {
    platform: 'youtube',
    title: 'Get your YouTube data',
    intro: 'Google prepares a Takeout archive of your YouTube history; it usually takes minutes to a few hours.',
    startUrl: 'https://takeout.google.com/',
    steps: [
      'On a computer, open **takeout.google.com** and sign in with the Google account you use on YouTube (on a phone, use the browser: the steps are the same).',
      'Under **Create a new export**, click **Deselect all**.',
      'Scroll down to **YouTube and YouTube Music** and tick its checkbox.',
      'Click **All YouTube data included**, then **Deselect all**, tick **history** and **subscriptions**, and click **OK**.',
      'Click **Multiple formats**, set **History** to **JSON**, and click **OK**.',
      'Scroll to the bottom and click **Next step**.',
      'Under **Destination**, choose **Send download link via email**. Under **Frequency**, choose **Export once**.',
      'Under **File type & size**, choose **.zip** and **2 GB**, then click **Create export**.',
      'When the email **Your Google data is ready to download** arrives, click **Download your files** and save the .zip.',
      'Upload that .zip to Drift (no need to unzip it).',
    ],
    waitTime: 'Usually minutes to a few hours; large accounts can take up to a few days.',
    uploadHint: 'The takeout-….zip file, or just watch-history.json, search-history.json and subscriptions.csv.',
    notes: [
      'Choose **JSON** for History. The default HTML also works, but dates and titles are less reliable.',
      'Takeout always exports your full history ("All time"); there is no date range to set.',
      'History only exists if **YouTube History** was turned on in your Google account (myactivity.google.com → **YouTube History**).',
      'Optional, Google Search: in step 3 also tick **My Activity**, click **All activity data included**, **Deselect all**, tick **Search**, and in **Multiple formats** set **My Activity** to **JSON**. Drift then also reads your Google searches.',
      'The download link expires after about 7 days. Takeout in another language works too (e.g. **YouTube och YouTube Music**).',
    ],
  },

  tiktok: {
    platform: 'tiktok',
    title: 'Get your TikTok data',
    intro: 'TikTok prepares your data file on request; it usually takes from a few hours to a few days.',
    startUrl: 'https://www.tiktok.com/setting/download-your-data',
    steps: [
      'Phone: open TikTok, tap **Profile** (bottom right), then the **☰** menu (top right).',
      'Tap **Settings and privacy** → **Account** → **Download your data**.',
      'Computer instead: on **tiktok.com**, click your profile picture → **Settings**, then **Download your data** under **Data** (or open the start link above).',
      'On the **Request data** tab, choose **All data** (a custom selection can leave out your watch history).',
      'Under **Select file format**, choose **JSON** (not TXT).',
      'Tap **Request data**. You may be asked to verify with a code sent to your phone or email.',
      'When TikTok notifies you that the file is ready, open **Download your data** again and switch to the **Download data** tab.',
      'Tap **Download** next to your file and save the .zip.',
      'Upload the .zip (or the user_data_tiktok.json inside it) to Drift.',
    ],
    waitTime: 'A few hours to 4 days.',
    uploadHint: 'The .zip file, or user_data_tiktok.json from inside it.',
    notes: [
      'Choose **JSON**. Drift can read a TXT export, but only watch history, searches, likes and follows.',
      'TikTok includes everything it still keeps; there is no date range to set. Older watch history may already have been deleted by TikTok.',
      'The file is only available for about 4 days after it is ready, so download it promptly.',
      'On Windows, if the .zip will not open, upload it to Drift directly: you do not need to unzip it.',
    ],
  },

  instagram: {
    platform: 'instagram',
    title: 'Get your Instagram data',
    intro: 'Instagram builds your export in Accounts Center; it usually takes from a few minutes to 48 hours.',
    startUrl: 'https://accountscenter.instagram.com/info_and_permissions/dyi/',
    steps: [
      'Phone: in the Instagram app, tap your **profile picture** (bottom right), then **☰** (top right) and **Accounts Center**.',
      'Computer instead: on **instagram.com**, click **More** (☰, bottom left) → **Settings** → **Accounts Center** (or open the start link above).',
      'Tap **Your information and permissions** → **Export your information** (older versions: **Download your information**).',
      'Tap **Create export**, select your **Instagram** account, then **Export to device**.',
      'Under **Customize information**, keep **Your Instagram activity**, **Ads information**, **Connections** and **Preferences** selected. You can deselect **Messages** and **Media** to make the file smaller.',
      'Set **Date range** to **All time**.',
      'Set **Format** to **JSON** (not HTML).',
      'Set **Media quality** to **Low**.',
      'Tap **Start export** and enter your password if asked.',
      'When Instagram notifies you (in the app and by email), return to **Export your information** and tap **Download** next to the export.',
      'Upload the .zip to Drift.',
    ],
    waitTime: 'Minutes to 48 hours.',
    uploadHint: 'The instagram-….zip file (or the unzipped folder).',
    notes: [
      'Format must be **JSON**. HTML exports cannot be read; request a new export if you got HTML.',
      'Choose **All time** for the date range, otherwise Drift only sees the last year or so.',
      'Viewed posts and videos are only kept for a limited period by Instagram, so older viewing will not appear.',
      'The download is available for about 4 days.',
    ],
  },
};
