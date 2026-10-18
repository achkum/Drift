// Topic taxonomy with English + Swedish keyword lists for the v1 keyword classifier.
import type { TopicDef } from '@/lib/types';

export const OTHER = 'other';
export const UNKNOWN = 'unknown';

/**
 * Keyword lists are comma separated. Matching is whole-word on lowercase text with
 * diacritics stripped (so "träning" also matches "traning"). Multi-word phrases match
 * consecutive words. A trailing `*` matches word prefixes (Swedish compounds:
 * "fotboll*" matches "fotbollsmatch").
 * Weights: strong = 2, normal = 1, weak = 0.5. An item needs a score of 1 to get a topic.
 */
export interface TopicKeywords extends TopicDef {
  strong: string;
  normal: string;
  weak?: string;
}

export const TOPIC_KEYWORDS: TopicKeywords[] = [
  {
    id: 'politics', label: 'Politics and news', sensitive: true,
    strong: 'politics, political, politik*, election*, val 2026, valet, riksdag*, parliament, senate, congress, ' +
      'president*, prime minister, statsminister*, democrat*, republican*, trump, biden, kamala, harris, putin, zelensky, ' +
      'socialdemokrat*, moderaterna, sverigedemokrat*, vansterpartiet, centerpartiet, liberalerna, kristdemokrat*, miljopartiet, ' +
      'kristersson, magdalena andersson, akesson, labour party, tories, conservatives, brexit, nato, geopolitic*, ' +
      'immigration, migration*, invandring*, asylum, ukraine, ukraina, israel, gaza, palestin*, hamas, white house, ' +
      'fox news, cnn, msnbc, svt nyheter, aftonbladet, expressen, dagens nyheter, sky news, bbc news, ' +
      'campaign rally, impeach*, partiledardebatt, regeringen, government, minister, ministern, opposition*',
    normal: 'news, nyheter, nyhet*, breaking, debate, debatt*, policy, vote, voting, rosta, rostar, rostning, left wing, right wing, ' +
      'liberal, woke, protest*, demonstration*, war, kriget, krig, sanctions, tariff*, tull*, border, borders, ' +
      'reform, law, lagen, lagforslag, budget, tax, taxes, skatt*, crisis, kris, mayor, kommun, kommunen, kommunal, eu, european union, ' +
      'rapport, aktuellt, agenda, diplomacy, refugee*, flykting*, military, militar*, army, terror*, election, poll, polls, opinionsmatning*, ' +
      'press conference, presskonferens, journalism, journalist*',
    weak: 'world, varlden, report, update, today, idag, explained, interview, intervju, analysis, commentary',
  },
  {
    id: 'football', label: 'Football', sensitive: false,
    strong: 'football, soccer, fotboll*, premier league, champions league, europa league, la liga, laliga, serie a, ' +
      'bundesliga, ligue 1, allsvenskan, superettan, damallsvenskan, world cup, vm i fotboll, euro 2024, euro 2028, fifa, uefa, ' +
      'arsenal, chelsea, liverpool, man utd, manchester united, manchester city, man city, tottenham, spurs, newcastle, ' +
      'real madrid, barcelona, barca, bayern, psg, juventus, inter milan, ac milan, napoli, dortmund, ajax, ' +
      'aik, djurgarden, hammarby, malmo ff, ifk goteborg, hacken, elfsborg, messi, ronaldo, mbappe, haaland, ' +
      'salah, kane, bellingham, saka, gyokeres, zlatan, ibrahimovic, kulusevski, offside, penalty kick, var check, ' +
      'transfer news, transfer window, ballon d or, goalkeeper, malvakt*, ultras',
    normal: 'goal, goals, mal, highlights, hojdpunkter, striker, midfielder, defender, derby, matchday, ' +
      'isak, manager, tranare, kickoff, avspark, assist*, hat trick, hattrick, clean sheet, pundit*, fpl, fantasy football',
    weak: 'match, matchen, vs, league, cup, season, sasong*',
  },
  {
    id: 'sports', label: 'Other sports', sensitive: false,
    strong: 'nba, nfl, nhl, mlb, ufc, mma, boxing, boxning, tennis, golf, formula 1, formel 1, f1, motogp, nascar, ' +
      'ishockey, hockey, shl, hockeyallsvenskan, handboll*, innebandy, bandy, basket, basketball, baseball, cricket, ' +
      'rugby, cycling, tour de france, cykellopp, skidskytte, biathlon, langdskid*, vasaloppet, alpine skiing, ' +
      'athletics, friidrott*, olympic*, olympiska, os i, wimbledon, super bowl, stanley cup, grand slam, ' +
      'wrestling, wwe, darts, snooker, esports, swimming, simning, volleyboll, volleyball, padel, ' +
      'lebron, mahomes, verstappen, hamilton, djokovic, alcaraz, mondo duplantis, duplantis',
    normal: 'sports, sport, sporten, idrott*, playoffs, slutspel*, championship, mastare, tournament, turnering*, ' +
      'race, racing, lopp, fight, knockout, medal, medalj*, coach, athlete, atlet*',
    weak: 'game, games, team, laget, season, score',
  },
  {
    id: 'fitness', label: 'Fitness and training', sensitive: false,
    strong: 'workout, workouts, fitness, gym, gymmet, gympass, styrketraning*, strength training, bodybuilding, ' +
      'powerlifting, crossfit, hiit, calisthenics, deadlift*, marklyft, bench press, bankpress, squat*, knaboj, ' +
      'pull ups, push ups, armhavning*, running, lopning*, lopa, jogging, marathon, maraton*, half marathon, halvmaraton, ' +
      'ultramarathon, 5k, 10k, couch to 5k, intervaller, intervalltraning, triathlon, ironman, yoga, pilates, ' +
      'mobility, stretching, personal trainer, hypertrophy, muscle, muscles, muskler, muskel*, abs, core workout, ' +
      'cardio, kondition*, zone 2, vo2 max, garmin, strava, parkrun, trail running, traillopning',
    normal: 'training, traning*, trana, exercise, exercises, ovning*, gains, reps, sets, split, routine, ' +
      'run, runner, runners, lopare, lopar*, pace, shoes, steps, endurance, uthallighet, sprint*',
    weak: 'body, kropp*, strong, stark, sweat',
  },
  {
    id: 'dieting', label: 'Dieting and weight loss', sensitive: true,
    strong: 'weight loss, lose weight, losing weight, viktnedgang*, ganga ner, banta, bantning*, diet, diets, diet*, ' +
      'calorie deficit, kaloriunderskott, calories, kalorier, keto, ketogenic, lchf, intermittent fasting, ' +
      'periodisk fasta, 16 8, ozempic, wegovy, semaglutide, mounjaro, fat loss, fettforbranning, ' +
      'body fat, burn fat, what i eat in a day, wieiad, macros, makros, deff*, low carb, lag kolhydrat*, ' +
      'weigh in, bmi, belly fat, magfett',
    normal: 'skinny, slim, smal, protein, proteinrik*, fasta, cutting, meal prep, low calorie, sugar free, sockerfri*, detox, ' +
      'appetite, aptit, hunger, scale, vagen, kilos, kilo, kg, pounds, lbs',
    weak: 'healthy, nyttig*, lean',
  },
  {
    id: 'food', label: 'Cooking and food', sensitive: false,
    strong: 'recipe, recipes, recept*, cooking, matlagning*, laga mat, baking, bakning, baka, kock*, ' +
      'kitchen, kok, dinner, middag*, lunch, breakfast, frukost, pasta, pizza, lasagne, lasagna, tacos, ' +
      'sourdough, surdeg*, bread, brod, cake, tarta, kaka, kakor, cookies, bulle, bullar, kanelbull*, dessert*, ' +
      'gordon ramsay, jamie oliver, mukbang, food review, street food, restaurant*, restaurang*, burger*, ' +
      'sushi, ramen, curry recipe, bbq, grilling, grilla, air fryer, airfryer, smorgas*, soppa, soup, stew, gryta, ' +
      'vegan recipe, vegetarisk*, foodie, tasting, provsmak*, fika, kottbullar, pannkak*',
    normal: 'food, chef, mat, maten, meal, maltid*, eat, eating, ata, cook, lagar, delicious, gott, snack*, ' +
      'sauce, chicken, kyckling, beef, notkott, salmon, lax, rice, ris, potatis, cheese, ost',
    weak: 'taste, tasty, easy, enkel, quick, snabb*',
  },
  {
    id: 'gaming', label: 'Gaming', sensitive: false,
    strong: 'gaming, gamer, gameplay, lets play, let s play, playthrough, speedrun*, walkthrough, minecraft, fortnite, ' +
      'roblox, gta, gta 6, call of duty, cod, warzone, valorant, league of legends, cs2, counter strike, ' +
      'dota, overwatch, apex legends, pubg, elden ring, zelda, mario, pokemon, nintendo, playstation, ps5, xbox, ' +
      'steam deck, twitch, streamer, fifa 25, ea fc, fc 25, fc 26, the sims, sims 4, skyrim, cyberpunk, ' +
      'baldur s gate, genshin, hearthstone, world of warcraft, wow classic, esport*, rpg, mmo, fps, battle royale, ' +
      'datorspel*, tv spel*, spela spel, gamla spel, indie game, video game, video games, boss fight, ' +
      'pewdiepie, markiplier, mrbeast gaming, dream smp',
    normal: 'game, games, spel, spelet, level, levels, nivå, console, konsol*, controller, mods, mod, lol, ' +
      'patch, update, ranked, loot, quest, multiplayer, co op, coop, raid, build',
    weak: 'play, playing, spelar, win, wins',
  },
  {
    id: 'music', label: 'Music', sensitive: false,
    strong: 'music video, official music video, official video, official audio, lyric video, lyrics, songtext, ' +
      'music, musik*, song, songs, lat, latar, album, remix, acoustic, akustisk, concert, ' +
      'konsert*, live performance, turne, festival, melodifestivalen, eurovision, spotify, playlist, ' +
      'spellista, guitar, gitarr*, piano, drums, trummor, bass, singer, sangare, sangerska, rapper, rap, hip hop, ' +
      'hiphop, pop, rock, metal, jazz, edm, techno, house music, kpop, k pop, bts, taylor swift, beyonce, drake, ' +
      'the weeknd, billie eilish, ed sheeran, avicii, abba, zara larsson, tove lo, veronica maggio, hakan hellstrom, ' +
      'vevo, karaoke, choir, orchestra, orkester, beats, producer, mixtape, dj set',
    normal: 'single, cover, tour, beat, sing, singing, sjunga, sjunger, band, artist, artists, artist*, chorus, refrang, melody, melodi, ' +
      'vocal*, sang, unplugged, instrumental, soundtrack, ost',
    weak: 'feat, ft, prod, audio, remastered',
  },
  {
    id: 'tech', label: 'Tech', sensitive: false,
    strong: 'iphone, ipad, macbook, apple, android, samsung, galaxy s24, galaxy s25, pixel, google pixel, ' +
      'smartphone, smartphones, laptop, laptops, pc build, gaming pc, gpu, cpu, nvidia, amd, intel, rtx, ' +
      'unboxing, tech review, tech news, gadget*, ai, artificial intelligence, chatgpt, openai, claude, gemini, ' +
      'machine learning, programming, programmering, coding, kodning, python, javascript, typescript, reactjs, ' +
      'linux, windows 11, macos, ios, software, mjukvara, hardware, hardvara, startup, silicon valley, ' +
      'elon musk, tesla, spacex, mkbhd, linus tech tips, verge, cybersecurity, hacker, hacking, ' +
      'smart home, smarta hem, headphones, horlurar, airpods, vr headset, vision pro, quest 3, 3d printing, ' +
      'developer, utvecklare, web development, robot, robotics, robotar, teknik*, tekniknyheter',
    normal: 'tech, technology, app, apps, review, recension*, setup, specs, battery, batteri*, camera, kamera, ' +
      'screen, skarm, update, chip, computer, dator*, internet, wifi, code, kod, data',
    weak: 'new, vs, best, test, testar',
  },
  {
    id: 'science', label: 'Science', sensitive: false,
    strong: 'science, vetenskap*, physics, fysik*, chemistry, kemi, biology, biologi, astronomy, astronomi, ' +
      'space, rymden, nasa, esa, black hole, black holes, svart hal, svarta hal, universe, universum, planet*, galaxy, galax*, ' +
      'quantum, kvant*, evolution, dinosaur*, fossil*, climate change, klimatforandring*, klimat*, ' +
      'experiment*, research, forskning*, forskare, scientist*, neuroscience, genetics, genetik, dna, ' +
      'mathematics, matematik, math, veritasium, kurzgesagt, vsauce, smarter every day, mark rober, ' +
      'telescope, teleskop, james webb, moon landing, manlandning*, volcano*, vulkan*, earthquake*, jordbav*',
    normal: 'theory, teori*, discovery, upptackt*, atom*, energy, energi, nature, natur*, ocean*, hav, ' +
      'mars, species, arter, brain, hjarnan, forklarat',
    weak: 'facts, fakta, how, why, varfor, explained',
  },
  {
    id: 'finance', label: 'Money, investing and crypto', sensitive: false,
    strong: 'investing, investera*, investment*, stocks, aktier, aktie*, stock market, borsen, bors*, ' +
      'crypto, krypto*, bitcoin, btc, ethereum, eth, dogecoin, solana, nft, blockchain, trading, trader, daytrading, ' +
      'forex, etf, index fund, indexfond*, fonder, fond*, dividend*, utdelning*, passive income, passiv inkomst, ' +
      'personal finance, privatekonomi*, ekonomi*, budgeting, savings, sparande, spara pengar, isk, avanza, nordnet, ' +
      'warren buffett, real estate, fastighet*, bostadsmarknad*, mortgage, bolan*, interest rate*, ranta, rantan, ' +
      'riksbanken, federal reserve, inflation, recession, lagkonjunktur, millionaire, miljonar*, side hustle, ' +
      'make money, tjana pengar, financial freedom, fire movement, money, pengar',
    normal: 'finance, finans*, rich, rik, fed, economy, market, marknad*, bank, banken, salary, lon, income, inkomst*, debt, skuld*, ' +
      'loan, lan, price, pris, priser, priset, cost, kostnad*, wealth, business, foretag*, entrepreneur, entreprenor*',
    weak: 'buy, kopa, sell, salja, cheap, billig*',
  },
  {
    id: 'beauty', label: 'Beauty and fashion', sensitive: false,
    strong: 'makeup, make up, smink*, skincare, hudvard*, beauty, skonhet*, grwm, get ready with me, ' +
      'lipstick, lappstift, mascara, foundation, concealer, eyeliner, contour, nails, naglar, manicure, ' +
      'hairstyle, hairstyles, frisyr*, haircut, harklippning, hair care, harvard, hair tutorial, ' +
      'fashion, outfit*, ootd, haul, try on haul, styling, stylist, wardrobe, garderob*, sephora, ' +
      'h&m, shein, gucci, prada, chanel, louis vuitton, dior, sneakers, sneaker*, streetwear, ' +
      'perfume, parfym*, fragrance, serum, retinol, spf, solskydd*, glow up',
    normal: 'mode, looks, style, stil, clothes, klader, dress, klanning*, shoes, skor, jacket, jacka, jeans, ' +
      'trend, trends, trendig*, aesthetic, skin, hud, hair, beauty tips',
    weak: 'look, pretty, snygg*, cute',
  },
  {
    id: 'travel', label: 'Travel', sensitive: false,
    strong: 'travel, travelling, traveling, resa, resor, resmal, vacation, semester*, holiday, holidays, ' +
      'trip, road trip, roadtrip, backpacking, backpacker, interrail, travel vlog, resevlogg, flight, flights, ' +
      'flyg, flygresa, airport, flygplats*, hotel, hotell*, hostel, airbnb, resort, cruise, kryssning*, ' +
      'things to do in, visiting, sightseeing, tourist*, turist*, passport, abroad, utomlands, ' +
      'thailand, japan, tokyo, bali, paris, rome, rom, london, new york, barcelona travel, greece, grekland, ' +
      'italy, italien, spain, spanien, mallorca, kanarieoarna, iceland, island, norway, norge, lapland, lappland',
    normal: 'city guide, guide, beach, strand*, mountains, fjall*, hike, hiking, vandring*, ' +
      'explore, utforska*, country, land, culture, kultur*, budget travel',
    weak: 'day, dag, visit, besok*',
  },
  {
    id: 'comedy', label: 'Comedy and entertainment', sensitive: false,
    strong: 'comedy, komedi*, funny, rolig*, roligt, stand up, standup, stand up comedy, sketch, sketches, ' +
      'prank, pranks, skamt, meme, memes, try not to laugh, fails, fail compilation, roast, parody, parodi*, ' +
      'snl, saturday night live, jimmy fallon, jimmy kimmel, late show, colbert, john oliver, last week tonight, ' +
      'impractical jokers, mrbeast, challenge, utmaning*, reaction, reacts, reagerar, react, podcast*, podd*, ' +
      'celebrity, kandis*, kandisar, gossip, skvaller, influencer*, youtuber*',
    normal: 'lol, lmao, hilarious, joke, jokes, skamt, laugh, skratt*, drama, entertainment, underhallning, show, ' +
      'talk show, pratshow, interview, compilation, sammanstallning*',
    weak: 'crazy, galen, galet, insane, wild',
  },
  {
    id: 'film_tv', label: 'Film and TV', sensitive: false,
    strong: 'movie, movies, film, filmer, filmen, trailer, teaser, official trailer, netflix, hbo, hbo max, disney plus, ' +
      'disney+, prime video, viaplay, svt play, tv4 play, series, serie, serien, tv series, tv show, season 2, ' +
      'sasong 2, sitcom, marvel, mcu, dc, star wars, harry potter, lord of the rings, ' +
      'game of thrones, house of the dragon, stranger things, the office, breaking bad, oscars, oscar, ' +
      'guldbagge*, box office, movie review, filmrecension*, behind the scenes, cinema, biograf*, ' +
      'actor, skadespelare, actress, director, regissor, anime, manga, pixar, dreamworks, horror movie, skrackfilm',
    normal: 'episode, avsnitt, bio, scene, scen, cast, ending, explained, plot, spoiler*, character, karaktar*, sequel, ' +
      'documentary, dokumentar*, drama series, kdrama, k drama',
    weak: 'watch, review, recap, friends',
  },
  {
    id: 'education', label: 'Learning and education', sensitive: false,
    strong: 'tutorial, tutorials, lecture, forelasning*, course, kurs, kurser, lesson, lektion*, how to learn, ' +
      'study with me, study tips, studieteknik, exam, tenta*, exam prep, hogskoleprovet, university, universitet*, ' +
      'college, gymnasiet, school, skola, skolan, homework, laxor, ted talk, tedx, khan academy, crash course, ' +
      'history, historia, historien, ww2, world war, andra varldskriget, ancient rome, vikings, vikingar*, ' +
      'language learning, learn english, learn swedish, lara sig, sprak, grammar, grammatik, philosophy, ' +
      'filosofi*, psychology, psykologi*, economics, documentary, dokumentar*, explainer, explained in',
    normal: 'learn, learning, lara, lar dig, teach, teacher, larare, student*, education, utbildning*, guide, ' +
      'beginner, beginners, nyborjare, tips, knowledge, kunskap*, facts, fakta',
    weak: 'how to, why, explained',
  },
  {
    id: 'cars', label: 'Cars and vehicles', sensitive: false,
    strong: 'car, cars, bil, bilar, bilen, bilarna, car review, test drive, provkorning*, supercar*, sportscar, ' +
      'porsche, ferrari, lamborghini, bmw, audi, mercedes, volvo, saab, volkswagen, vw golf, toyota, honda, ' +
      'tesla model, model y, model 3, electric car, elbil*, ev review, top gear, the grand tour, carwow, ' +
      'drift, drifting, motor, engine swap, horsepower, hastkrafter, turbo, v8, v12, motorcycle, motorcykel*, ' +
      'motorbike, harley, epa traktor, a traktor, mopeds, moped, raggare, car meet, bilträff, biltraff*, ' +
      'dashcam, car crash, bilolycka, tuning, tuned, burnout, nurburgring, drag race',
    normal: 'drive, driving, kora, korning, garage, verkstad, mechanic, mekaniker, wheels, dack, tyres, tires, ' +
      'exhaust, avgas*, speed, km h, mph, 0 100, 0 60',
    weak: 'fast, snabb, ride, fart',
  },
  {
    id: 'family', label: 'Parenting and family', sensitive: false,
    strong: 'parenting, foraldraskap, parent, parents, foralder, foraldrar, mom, mum, mamma, mammaliv, dad, pappa, ' +
      'baby, babies, bebis*, newborn, nyfodd*, toddler, smabarn*, pregnancy, pregnant, gravid*, graviditet*, ' +
      'birth, forlossning*, breastfeeding, amning, family vlog, familjevlogg, familj*, family, mom life, ' +
      'gender reveal, birth vlog, motherhood, fatherhood, foraldraledig*, preschool, forskola*, daycare, ' +
      'sleep training, potty training, kids activities',
    normal: 'kids, children, barn, barnen, son, daughter, dotter, siblings, syskon, household, hushall, ' +
      'home routine, morning routine',
    weak: 'home, hemma, routine, rutin*',
  },
  {
    id: 'health', label: 'Health and wellbeing', sensitive: true,
    strong: 'health, halsa, halsan, mental health, psykisk ohalsa, psykisk halsa, anxiety, angest, depression, ' +
      'adhd, autism, autistic, ocd, ptsd, bipolar, therapy, therapist, terapi*, psykolog*, burnout, utbrandhet, ' +
      'doctor, lakare, doktor*, nurse, sjukskoterska, hospital, sjukhus*, symptoms, symptom, disease, sjukdom*, ' +
      'cancer, diabetes, covid, corona, vaccine, vaccin*, medication, medicin*, sleep, somn, insomnia, ' +
      'migraine, migran, gut health, tarmhalsa, hormones, hormoner, menopause, klimakteriet, pcos, endometrios, ' +
      'chronic pain, kronisk smarta, meditation, mindfulness, self care, egenvard, wellness, wellbeing, ' +
      'supplements, kosttillskott, vitamins, vitaminer, dermatologist, physiotherapy, fysioterapi*',
    normal: 'healthy, frisk, pain, smarta, sick, sjuk, illness, treatment, behandling*, mental, stress, ' +
      'wellness tips, healing, recovery, aterhamtning, breathe, andning',
    weak: 'body, tired, trott',
  },
  {
    id: 'religion', label: 'Religion and faith', sensitive: true,
    strong: 'religion, religios*, gud, jesus, christ, kristus, christian, christianity, kristen, kristendom*, ' +
      'church, kyrka*, kyrkan, bible, bibeln, bibel*, gospel, evangelium, sermon, predikan, pastor, priest, prast*, ' +
      'prayer, prayers, be till gud, worship, lovsang, islam, muslim*, quran, koranen, koran*, allah, mosque, ' +
      'moske*, ramadan, eid, imam, hadith, judaism, jewish, torah, rabbi, synagogue, synagoga, hindu*, buddhism, ' +
      'buddhist*, buddha, spirituality, andlighet, spiritual, atheism, ateism, atheist, apologetics, faith, ' +
      'scripture, salvation, fralsning, heaven, himlen, helvetet, prophet, profet*, catholic, katolsk*, ' +
      'orthodox, ortodox*, pope, pope francis, pastor*',
    normal: 'god, tro, bon, hell, blessed, blessing, valsignelse, holy, helig*, divine, saint, helgon, miracle, mirakel, soul, sjal',
    weak: 'pray, believe',
  },
  {
    id: 'relationships', label: 'Dating, sex and relationships', sensitive: true,
    strong: 'dating, dejting*, dejt, date night, relationship*, relation*, boyfriend, girlfriend, pojkvan*, flickvan*, ' +
      'husband, wife, fru, marriage, aktenskap*, wedding, brollop*, divorce, skilsmassa, breakup, ' +
      'break up, gjort slut, red flags, red flag, toxic relationship, situationship, tinder, hinge, bumble, ' +
      'love life, karleksliv, sex, sexual, sexuell*, sexlife, sexliv, lgbt, lgbtq, gay, lesbian, lesbisk, bisexual, ' +
      'bisexuell, queer, trans, transgender, pride, coming out, attachment style, anknytning*, cheating, otrohet, ' +
      'otrogen, love languages, crush, first date, forsta dejten, single life, singelliv, celibacy, intimacy, intimitet',
    normal: 'ex, partner, love, karlek*, couple, romance, romantik*, romantic, romantisk*, heartbreak, jealous, svartsjuk*, ' +
      'flirt*, flort*, proposal, frieri, engaged, forlovad*',
    weak: 'par, men, women, kvinnor',
  },
  {
    id: 'true_crime', label: 'True crime', sensitive: false,
    strong: 'true crime, murder, mord, mordet, murderer, morder*, serial killer, seriemordare, homicide, ' +
      'cold case, unsolved, olost, olosta, missing person, forsvunnen, forsvann, kidnapping, kidnappning, ' +
      'crime, brott, brottet, brottslig*, criminal, kriminell*, gangster*, gangkriminalitet, skjutning*, shooting, ' +
      'police, polis, polisen, detective, investigation, utredning*, forensic*, rattegang*, ' +
      'domstol*, verdict, sentenced, domd, prison, fangelse*, jail, fbi, interrogation, forhor, ' +
      'cult, sekt*, scam, bedrageri*, heist, robbery, ranet, case file, morbid, crime junkie, ' +
      'dateline, forensic files, svenska brott, brottsplats*',
    normal: 'trial, court, cases, suspect, misstankt*, victim, evidence, bevis, killer, killed, dodad, died, death, dod, ' +
      'mystery, mysterium, mysteriet, disappearance, forsvinnande*, case',
    weak: 'story, historien, dark, dom, offer',
  },
  {
    id: 'lifestyle', label: 'ASMR and lifestyle', sensitive: false,
    strong: 'asmr, mukbang asmr, tingles, whisper*, viskning*, day in my life, a day in the life, en dag i mitt liv, ' +
      'vlog, vlogg*, morning routine, morgonrutin*, night routine, kvallsrutin*, that girl, aesthetic vlog, ' +
      'cleaning, stada*, stadning*, cleaning motivation, organizing, organisera*, declutter*, minimalism*, ' +
      'interior design, inredning*, home decor, room makeover, room tour, house tour, apartment tour, ' +
      'lagenhetstur, diy, gor det sjalv, renovering*, renovation, plants, vaxter, gardening, tradgard*, ' +
      'satisfying, oddly satisfying, relaxing, avslappnande, cozy, mysig*, slow living, cottagecore, ' +
      'productivity, produktivitet, self improvement, journaling, journal, unboxing haul, thrifting, loppis*',
    normal: 'life, liv, livet, routine, rutin*, home, hem, hemma, room, rum, apartment, lagenhet*, ' +
      'weekend, helg*, habits, vanor, motivation, relax, slappna av, calm, lugn*',
    weak: 'day, dag',
  },
  {
    id: 'kids', label: 'Kids content', sensitive: false,
    strong: 'nursery rhymes, nursery rhyme, barnvisor, barnsanger, cocomelon, peppa pig, greta gris, paw patrol, ' +
      'bluey, baby shark, pinkfong, blippi, ms rachel, babblarna, bolibompa, barnkanalen, sesame street, ' +
      'cartoon, cartoons, tecknat, tecknad*, kids songs, songs for kids, for kids, for barn, barnprogram*, ' +
      'toy review, toys, leksak*, lego, surprise eggs, kinder egg, unboxing toys, kids tv, kids show, ' +
      'disney junior, pj masks, frozen, elsa, spongebob, svampbob, pokemon cartoon, minecraft for kids, ' +
      'alfons aberg, pippi, bamse, astrid lindgren',
    normal: 'kid, kids, children, childrens, barn, abc, alphabet, alfabetet, colors for kids, learn colors, ' +
      'counting, rakna, animation, animated',
    weak: 'fun, kul, song',
  },
  {
    id: 'animals', label: 'Animals and pets', sensitive: false,
    strong: 'dog, dogs, hund, hundar, hunden, puppy, puppies, valp*, cat, cats, katt, katter, katten, kitten*, ' +
      'kattunge*, pet, pets, husdjur, horse, horses, hast, hastar, ridning, wildlife, vilda djur, animal, animals, ' +
      'djur, djuren, zoo, djurpark*, bird, birds, fagel, faglar, birdwatching, fagelskadning, shark, hajar, ' +
      'snake, orm, reptile*, aquarium, akvarium, dog training, hundtraning*, veterinar*, rescue dog, ' +
      'animal rescue, nature documentary, david attenborough, national geographic, nat geo',
    normal: 'cute animals, funny animals, funny cats, funny dogs, bear, wolf, varg, lion, lejon, ' +
      'elephant, elefant, monkey, apa, fish, fisk, fishing, fiske, hunting, jakt',
    weak: 'cute, gullig*, sot',
  },
];

/** Every topic, in display order, plus 'other' and 'unknown'. */
export const TOPIC_DEFS: TopicDef[] = [
  ...TOPIC_KEYWORDS.map(({ id, label, sensitive }) => ({ id, label, sensitive })),
  { id: OTHER, label: 'Other', sensitive: false },
  { id: UNKNOWN, label: 'Unknown', sensitive: false },
];

const BY_ID = new Map(TOPIC_DEFS.map((t) => [t.id, t]));

export function topicLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function topicSensitive(id: string): boolean {
  return BY_ID.get(id)?.sensitive ?? false;
}
