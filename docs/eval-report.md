# Drift evaluation report

Generated 2026-10-19 by `npm run eval`. Seeds: 1, 2, 3, 4, 5. Personas: 7. Classifiers: keyword, oracle.
All numbers are on **simulated** histories with known ground truth (see `docs/EVALUATION.md`). Metrics are deterministic for a given seed list; only this date line changes between runs.
Origin metrics pool every event of every persona and seed. "oracle" = the same analysis given the true topic of every item, which isolates origin labelling and drift detection from topic errors.

## Headline (keyword classifier)

| Question | Drift | Best baseline | Baseline value |
| --- | --- | --- | --- |
| Chosen vs served, watch accuracy | 85.1% | Searches + subscribed channels | 80.7% |
| Chosen vs served, chosen-class F1 | 0.729 | Searches + subscribed channels | 0.528 |
| Chosen % (last 30 days), mean abs. error | 4.8 pts | Searches + subscribed channels | 9.3 pts |
| Drift onset found within ±1 month | 96% | Simple monthly counts | 76% |
| False drift alarms per no-drift run | 0.2 | Simple monthly counts | 0.5 |
| Headline names the scripted drift topic (drift runs) | 92% | – | – |
| Headline claims a drift that was not scripted (no-drift runs) | 100% | – | – |
| Topic accuracy, labelled titles | 65.4% | – | – |
| Topic macro-F1, labelled titles | 0.707 | – | – |
| Topic accuracy, simulated watches (with channel) | 92.3% | – | – |
| Drift onset hit rate with true topics (oracle) | 96% | – | – |

## Origin labelling (chosen vs served)

Origin labelling does not use topics, so these numbers are the same for every classifier. "Watch" metrics cover watch events without ads (the hard part); "all events" adds searches, likes and ads, which the export marks outright.

| Method | Watch accuracy | Chosen P | Chosen R | Chosen F1 | Served F1 | All-events 4-class acc. | 4-class macro-F1 | Chosen% MAE, 30 days (pts) | Chosen% MAE, all history (pts) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Drift** (keyword topics) | 85.1% | 68.0% | 78.4% | 0.729 | 0.898 | 87.4% | 0.925 | 4.8 | 5.6 |
| Baseline: Everything served | 74.6% | 0.0% | 0.0% | 0.000 | 0.854 | 70.1% | 0.702 | 30.7 | 30.9 |
| Baseline: Only searches are chosen | 74.6% | 0.0% | 0.0% | 0.000 | 0.854 | 78.4% | 0.823 | 22.1 | 22.3 |
| Baseline: Searches + subscribed channels | 80.7% | 70.0% | 42.4% | 0.528 | 0.879 | 83.7% | 0.890 | 9.3 | 9.8 |

Accuracy by true route (watches; share labelled on the correct side, chosen vs served):

| True route | True origin | Watches | Drift | Everything served | Only searches are chosen | Searches + subscribed channels |
| --- | --- | --- | --- | --- | --- | --- |
| autoplay | served | 63004 | 92.2% | 100.0% | 100.0% | 93.7% |
| home_feed | served | 12365 | 63.1% | 100.0% | 100.0% | 94.4% |
| return | chosen | 2956 | 61.0% | 0.0% | 0.0% | 0.0% |
| search_result | chosen | 13444 | 69.3% | 0.0% | 0.0% | 13.8% |
| subscription | chosen | 9274 | 97.2% | 0.0% | 0.0% | 97.2% |

Which analysis rule labelled each watch (rows = true route, share of that route’s watches). Errors are chosen routes landing in "feed", and served routes landing in any other column:

| True route | subscribed | after_search | came_back | feed |
| --- | --- | --- | --- | --- |
| autoplay | 6.3% | 1.5% | 0.0% | 92.2% |
| home_feed | 5.6% | 0.0% | 31.3% | 63.1% |
| return | 0.0% | 0.0% | 61.0% | 39.0% |
| search_result | 13.8% | 46.4% | 9.1% | 30.7% |
| subscription | 97.2% | 0.0% | 0.0% | 2.8% |

4-class confusion matrix, Drift, all events (rows = truth, columns = predicted):

| truth \ pred | chosen | engaged | served | pushed |
| --- | --- | --- | --- | --- |
| chosen | 30091 | 0 | 5534 | 0 |
| engaged | 0 | 2981 | 0 | 0 |
| served | 9474 | 0 | 65895 | 0 |
| pushed | 0 | 0 | 0 | 5134 |

## Per persona: keyword

Aggregated over 5 seeds. "Detected months" lists the target's rising turning point per seed with the delay in months. "Extra TPs" counts false alarms: turning points the script does not explain (any topic rising other than the target, any fall outside onset-1..onset+2; for no-drift personas every turning point). "Headline right": drift runs whose headline says the feed drifted toward the target; no-drift runs whose headline does not claim a drift. Counts baseline: largest month-over-month count increase (≥10 items and ≥1.5×), hits / unexplained flags.

| Persona | Events/run | Watch acc. | Chosen F1 | Chosen% 30d truth | Chosen% 30d Drift | Topic acc. (sim) | Script | Onset hits | Detected months | Extra TPs | Counts baseline hits / FAs | Attribution (truth → said) | Headline right | Headline (seed 1) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| football_to_politics | 4738 | 88.3% | 0.707 | 22.9 | 27.8 | 93.3% | politics ↑ from 2026-05 (served) | 5/5 | 2026-06 (+1), 2026-05 (0), 2026-05 (0), 2026-06 (+1), 2026-05 (0) | 1 | 5 / 0 | served → served 5 | 5/5 | "Your feed drifted toward politics and news" |
| runner_to_dieting | 3541 | 88.5% | 0.750 | 29.5 | 30.4 | 89.0% | dieting ↑ from 2026-05 (served) | 5/5 | 2026-05 (0), 2026-06 (+1), 2026-05 (0), 2026-05 (0), 2026-05 (0) | 1 | 5 / 0 | served → served 5 | 5/5 | "Your feed drifted toward dieting and weight loss" |
| gamer_stable | 5948 | 85.9% | 0.695 | 25.6 | 32.6 | 94.7% | no drift | – | – | 2 | – / 5 | – | 0/5 | "Your feed drifted toward gaming" |
| heavy_subscriber | 2854 | 82.5% | 0.773 | 37.0 | 42.6 | 90.8% | true_crime ↑ from 2026-07 (served) | 5/5 | 2026-07 (0), 2026-07 (0), 2026-07 (0), 2026-07 (0), 2026-08 (+1) | 3 | 0 / 5 | served → served 5 | 3/5 | "Your feed drifted away from tech" |
| heavy_searcher | 3840 | 75.8% | 0.745 | 64.6 | 56.6 | 92.9% | travel ↑ from 2026-06 (chosen) | 5/5 | 2026-06 (0), 2026-06 (0), 2026-06 (0), 2026-06 (0), 2026-06 (0) | 2 | 5 / 0 | chosen → chosen 4, served 1 | 5/5 | "Your feed drifted toward travel" |
| bilingual_swedish | 2752 | 86.9% | 0.686 | 22.2 | 27.6 | 90.9% | true_crime ↑ from 2026-05 (served) | 4/5 | 2026-07 (+2), 2026-05 (0), 2026-06 (+1), 2026-06 (+1), 2026-05 (0) | 1 | 4 / 0 | served → served 5 | 5/5 | "Your feed drifted toward true crime" |
| sparse_2month | 149 | 87.1% | 0.748 | 30.3 | 29.4 | 80.8% | no drift | – | – | 0 | – / 0 | – | 0/5 | "Your feed drifted toward comedy and entertainment" |

## Per persona: oracle

Aggregated over 5 seeds. "Detected months" lists the target's rising turning point per seed with the delay in months. "Extra TPs" counts false alarms: turning points the script does not explain (any topic rising other than the target, any fall outside onset-1..onset+2; for no-drift personas every turning point). "Headline right": drift runs whose headline says the feed drifted toward the target; no-drift runs whose headline does not claim a drift. Counts baseline: largest month-over-month count increase (≥10 items and ≥1.5×), hits / unexplained flags.

| Persona | Events/run | Watch acc. | Chosen F1 | Chosen% 30d truth | Chosen% 30d Drift | Topic acc. (sim) | Script | Onset hits | Detected months | Extra TPs | Counts baseline hits / FAs | Attribution (truth → said) | Headline right | Headline (seed 1) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| football_to_politics | 4738 | 88.3% | 0.707 | 22.9 | 27.8 | 100.0% | politics ↑ from 2026-05 (served) | 5/5 | 2026-06 (+1), 2026-05 (0), 2026-05 (0), 2026-06 (+1), 2026-06 (+1) | 2 | 4 / 1 | served → served 5 | 5/5 | "Your feed drifted toward politics and news" |
| runner_to_dieting | 3541 | 88.5% | 0.750 | 29.5 | 30.4 | 100.0% | dieting ↑ from 2026-05 (served) | 5/5 | 2026-05 (0), 2026-06 (+1), 2026-05 (0), 2026-05 (0), 2026-05 (0) | 1 | 4 / 0 | served → served 5 | 5/5 | "Your feed drifted toward dieting and weight loss" |
| gamer_stable | 5948 | 85.9% | 0.695 | 25.6 | 32.6 | 100.0% | no drift | – | – | 3 | – / 5 | – | 2/5 | "Your feed stayed steady" |
| heavy_subscriber | 2854 | 82.5% | 0.773 | 37.0 | 42.6 | 100.0% | true_crime ↑ from 2026-07 (served) | 5/5 | 2026-07 (0), 2026-07 (0), 2026-07 (0), 2026-07 (0), 2026-08 (+1) | 4 | 2 / 3 | served → served 5 | 5/5 | "Your feed drifted toward true crime" |
| heavy_searcher | 3840 | 75.8% | 0.745 | 64.6 | 56.6 | 100.0% | travel ↑ from 2026-06 (chosen) | 5/5 | 2026-06 (0), 2026-06 (0), 2026-06 (0), 2026-06 (0), 2026-06 (0) | 1 | 5 / 0 | chosen → chosen 3, served 2 | 5/5 | "Your feed drifted toward travel" |
| bilingual_swedish | 2752 | 86.9% | 0.686 | 22.2 | 27.6 | 100.0% | true_crime ↑ from 2026-05 (served) | 4/5 | 2026-07 (+2), 2026-05 (0), 2026-06 (+1), 2026-06 (+1), 2026-05 (0) | 1 | 4 / 0 | served → served 5 | 5/5 | "Your feed drifted toward true crime" |
| sparse_2month | 149 | 87.1% | 0.748 | 30.3 | 29.4 | 100.0% | no drift | – | – | 0 | – / 1 | – | 0/5 | "Your feed drifted away from animals and pets" |

## Turning points, seed 1 (keyword)

| Persona | Turning points (month topic direction) |
| --- | --- |
| football_to_politics | 2026-03 food down; 2026-05 comedy down; 2026-06 politics up; 2026-06 football down |
| runner_to_dieting | 2026-05 dieting up; 2026-05 fitness down; 2026-05 food down |
| gamer_stable | none |
| heavy_subscriber | 2026-07 true_crime up; 2026-07 tech down; 2026-09 science down |
| heavy_searcher | 2026-06 travel up; 2026-06 tech down; 2026-06 finance down |
| bilingual_swedish | 2026-04 football down; 2026-06 food down; 2026-06 music down; 2026-07 true_crime up; 2026-08 lifestyle down |
| sparse_2month | none |

## Topic classifier on labelled titles: keyword

260 hand-labelled titles (`src/lib/eval/labelled-titles.ts`). Accuracy 65.4%, macro-F1 0.707. Coverage (not 'other') 77.3%. English 66.7%, Swedish 63.3%. Easy 85.2%, hard 18.2%.

| Topic | Precision | Recall | F1 | Support |
| --- | --- | --- | --- | --- |
| animals | 100% | 40% | 0.57 | 10 |
| beauty | 100% | 60% | 0.75 | 10 |
| cars | 100% | 60% | 0.75 | 10 |
| comedy | 100% | 70% | 0.82 | 10 |
| dieting | 100% | 70% | 0.82 | 10 |
| education | 60% | 60% | 0.60 | 10 |
| family | 80% | 80% | 0.80 | 10 |
| film_tv | 82% | 90% | 0.86 | 10 |
| finance | 100% | 70% | 0.82 | 10 |
| fitness | 78% | 70% | 0.74 | 10 |
| food | 100% | 60% | 0.75 | 10 |
| football | 78% | 70% | 0.74 | 10 |
| gaming | 100% | 70% | 0.82 | 10 |
| health | 100% | 70% | 0.82 | 10 |
| kids | 100% | 90% | 0.95 | 10 |
| lifestyle | 44% | 70% | 0.54 | 10 |
| music | 86% | 60% | 0.71 | 10 |
| other | 10% | 60% | 0.17 | 10 |
| politics | 89% | 80% | 0.84 | 10 |
| relationships | 80% | 40% | 0.53 | 10 |
| religion | 83% | 50% | 0.63 | 10 |
| science | 67% | 60% | 0.63 | 10 |
| sports | 100% | 80% | 0.89 | 10 |
| tech | 50% | 50% | 0.50 | 10 |
| travel | 70% | 70% | 0.70 | 10 |
| true_crime | 83% | 50% | 0.63 | 10 |

Top confusions (truth → predicted):

| Truth | Predicted | Count |
| --- | --- | --- |
| science | other | 4 |
| dieting | other | 3 |
| fitness | other | 3 |
| football | other | 3 |
| health | other | 3 |
| lifestyle | other | 3 |
| music | other | 3 |
| relationships | other | 3 |
| religion | other | 3 |
| travel | other | 3 |
| animals | other | 2 |
| beauty | lifestyle | 2 |

## Simulated persona descriptions

- **football_to_politics** (2026-01, 10 months): Watches football and cooking; from May the feed starts autoplaying political clips and rage-bait commentary. Never searches for politics.
- **runner_to_dieting** (2026-02, 9 months): Searches for running and marathon training. From May, autoplay after running videos increasingly lands on calorie counting and fasting content.
- **gamer_stable** (2026-01, 10 months): Gaming, tech and comedy throughout. No scripted drift, but much more viewing in the summer holidays.
- **heavy_subscriber** (2026-01, 10 months): Opens the subscriptions feed for cooking, science and tech. From July the home feed starts slipping in true crime documentaries.
- **heavy_searcher** (2026-01, 10 months): Searches for nearly everything (tech, learning, money). From June starts planning a trip and searches for travel. A chosen drift, not a served one.
- **bilingual_swedish** (2026-02, 8 months): Mostly Swedish titles: music, food, comedy, lifestyle. From May autoplay pulls in Swedish true crime and gang-violence documentaries.
- **sparse_2month** (2026-08, 2 months): Light viewing over two months: music, food, animals. Too little history to judge drift.
