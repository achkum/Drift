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
| `src/app/`, `src/components/`, `src/lib/sample/` | Screens from the wireframe, styling, sample data | routes |

## Rules

- Do not change `src/lib/types.ts` or another module's public entry signatures. If a contract is wrong, note it in your final report.
- No network calls with user data. No analytics. No server routes that receive history.
- Tests: `*.test.ts` next to the code, run with `npm test` (vitest, node env).
- Checks before you finish: `npm run typecheck`, `npm run lint`, `npm test`.
- Plain CSS with the wireframe's tokens (`src/app/globals.css`). No CSS framework.
