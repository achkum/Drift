// Builds a synthetic Google Takeout zip (YouTube watch + search history, subscriptions)
// with a scripted drift: football fades, politics rises via served autoplay from July,
// running/cooking are searched for. For end-to-end testing; no real personal data.
// Usage: node scripts/make-sample-takeout.mjs [out.zip]
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'sample-takeout.zip';
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const CH = {
  football: [['Premier Goals', ['Top 10 goals of the week', 'Match highlights: derby day', 'Best saves this season', 'Transfer news roundup']]],
  politics: [['Daily News Now', ['Election debate highlights', 'Parliament votes on budget', 'Minister resigns after scandal', 'Prime minister speech analysis']],
             ['Hot Take Politics', ['Why the opposition is wrong about taxes', 'Government policy explained', 'Riksdagen debatt om migration', 'Valet 2026: vem vinner?']]],
  cooking: [['Home Kitchen', ['Easy pasta recipe in 15 minutes', 'How to bake sourdough bread', 'Weeknight dinner recipes', 'Kanelbullar recept']]],
  running: [['Run Club', ['Marathon training plan week 1', 'How to run faster 5k', 'Best running shoes 2026', 'Interval training for runners']]],
  gaming: [['Pixel Plays', ['Minecraft survival episode 12', 'Fortnite new season gameplay', 'Speedrun world record']]],
};
const subs = ['Home Kitchen', 'Run Club', 'Premier Goals'];

const watch = [], search = [];
const start = Date.UTC(2026, 0, 1), end = Date.UTC(2026, 9, 15);
for (let t = start; t < end; t += 86400000) {
  const m = new Date(t).getUTCMonth(); // 0..9
  const w = { football: Math.max(2, 10 - m), politics: m < 6 ? 1 : 2 + (m - 5) * 3, cooking: 4, running: 3, gaming: 2 };
  // 1-3 sessions a day. A session starts with a search or a subscription video, then autoplay/feed chains a few more.
  const sessions = 1 + Math.floor(rnd() * 3);
  for (let s = 0; s < sessions; s++) {
    let time = t + Math.floor(rnd() * 20 * 3600000);
    const len = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < len; i++) {
      let topic;
      if (i === 0) topic = rnd() < 0.5 ? pick(['running', 'cooking']) : pick(['football', 'cooking', 'running']);
      else {
        const total = Object.values(w).reduce((a, b) => a + b, 0);
        let r = rnd() * total; topic = 'gaming';
        for (const [k, v] of Object.entries(w)) { if ((r -= v) < 0) { topic = k; break; } }
      }
      const [chan, titles] = pick(CH[topic]);
      if (i === 0 && (topic === 'running' || topic === 'cooking') && rnd() < 0.6) {
        const q = topic === 'running' ? pick(['marathon training', 'running shoes', '5k pace']) : pick(['pasta recipe', 'sourdough', 'kanelbullar']);
        search.push({ header: 'YouTube', title: `Searched for ${q}`, titleUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, time: new Date(time - 60000).toISOString(), products: ['YouTube'], activityControls: ['YouTube search history'] });
      }
      const id = Math.floor(rnd() * 1e11).toString(36).padStart(11, 'x').slice(0, 11);
      watch.push({ header: 'YouTube', title: `Watched ${pick(titles)}`, titleUrl: `https://www.youtube.com/watch?v=${id}`, subtitles: [{ name: chan, url: `https://www.youtube.com/channel/UC${chan.replace(/\W/g, '')}` }], time: new Date(time).toISOString(), products: ['YouTube'], activityControls: ['YouTube watch history'] });
      if (rnd() < 0.03) watch.push({ header: 'YouTube', title: 'Watched Big Sale: 70% off today only', titleUrl: `https://www.youtube.com/watch?v=ad${id.slice(2)}`, time: new Date(time + 1000).toISOString(), products: ['YouTube'], details: [{ name: 'From Google Ads' }], activityControls: ['YouTube watch history'] });
      time += (3 + Math.floor(rnd() * 6)) * 60000; // next video 3-8 minutes later
    }
  }
}
watch.sort((a, b) => b.time.localeCompare(a.time));
search.sort((a, b) => b.time.localeCompare(a.time));
const csv = 'Channel Id,Channel Url,Channel Title\n' + subs.map((s) => `UC${s.replace(/\W/g, '')},http://www.youtube.com/channel/UC${s.replace(/\W/g, '')},${s}`).join('\n') + '\n';

const base = 'Takeout/YouTube and YouTube Music/';
writeFileSync(out, zipSync({
  [base + 'history/watch-history.json']: strToU8(JSON.stringify(watch, null, 1)),
  [base + 'history/search-history.json']: strToU8(JSON.stringify(search, null, 1)),
  [base + 'subscriptions/subscriptions.csv']: strToU8(csv),
  'Takeout/archive_browser.html': strToU8('<html></html>'),
}));
console.log(`wrote ${out}: ${watch.length} watches, ${search.length} searches`);
