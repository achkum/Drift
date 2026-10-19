# Drift architecture

Drift shows people how their feeds drift: what platforms **serve** them versus what they **choose**.
Everything runs in the browser. No history ever leaves the device.

Design reference: `drift-prototype.html` (interactive wireframe). Product reference: the project proposal.

## Data flow

```
upload (.zip / .json / .html / .csv)
  └─ pipeline: unzip (fflate) → ExportFile[]
       └─ parsers: detect + parse → ParseResult (DriftEvent[], follows, interests, advertisers)
            └─ store (IndexedDB, deduped by event id)
                 └─ analysis.analyse(): classify topics → label origin → Insights
                      └─ store Insights → useDrift() → UI screens
```

## Modules and owners

| Folder | Owns | Public entry |
|---|---|---|
| `src/lib/types.ts` | Shared contracts. Orchestrator only. | all types |
| `src/lib/parsers/` | One parser per platform, export guides | `parseExport`, `exportGuides` |
| `src/lib/analysis/` | Topic taxonomy + classifier, origin labelling, drift metrics, Insights | `analyse`, `TOPICS`, `createKeywordClassifier` |
| `src/lib/pipeline/`, `src/lib/store/`, `src/lib/ask/` | Upload, unzip, IndexedDB, orchestration, `useDrift` hook, Ask Drift answers | `importFiles`, `useDrift`, `answerQuestion` |
| `src/lib/ml/` | Optional on-device topic model (multilingual-e5-small via transformers.js), keyword ensemble | `createMlClassifier` |
| `src/lib/enrich/` | Opt-in title lookup through YouTube/TikTok oEmbed (sends only video ids) | `lookupMissingTitles` |
| `src/lib/eval/`, `scripts/eval.ts` | Thesis evaluation: simulated personas with ground truth, metrics, baselines | `npm run eval` |
| `src/lib/settings.ts`, `src/lib/pipeline/extensions.ts` | Device settings and the optional steps they switch on | `getSettings`, `getClassifier`, `enrichEvents` |
| `src/app/api/google/`, `src/lib/server/google/`, `src/lib/connectors/google/` | Automatic Google sync via the Data Portability API: stateless OAuth broker (encrypted token in an httpOnly cookie), export jobs, optional streaming download proxy; client sync + auto-sync. See `docs/GOOGLE_SETUP.md` | `syncGoogle`, `useGoogleSync` |
| `src/app/`, `src/components/`, `src/lib/sample/` | Screens from the wireframe, styling, sample data, PWA (`public/sw.js`) | routes |

## Rules

- Do not change `src/lib/types.ts` or another module's public entry signatures. If a contract is wrong, note it in your final report.
- No network calls with user data, except opt-in features that say exactly what they send (title lookup sends video ids). No analytics. No server route stores history.
- Tests: `*.test.ts` next to the code, run with `npm test` (vitest, node env).
- Checks before you finish: `npm run typecheck`, `npm run lint`, `npm test`.
- Plain CSS with the wireframe's tokens (`src/app/globals.css`). No CSS framework.
