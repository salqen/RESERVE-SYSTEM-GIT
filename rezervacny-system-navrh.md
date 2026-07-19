# Systémové riešenie rezervačného systému (ubytovanie + služby)

Návrh pre prevádzku kombinujúcu ubytovanie a služby, napojenú na vlastný ERP systém, vlastný service manager a zákaznícky web.

---

## 1. Doménová logika – dva rôzne "druhy" rezervácií

- **Ubytovanie**: kalendár na noci, check-in/check-out, obsadenosť izby/apartmánu, minimálna dĺžka pobytu, sezónne ceny.
- **Služby**: kalendár na časové sloty, viazané na zdroj (personál, miestnosť, zariadenie), dĺžka trvania, buffer časy (upratovanie, príprava), kapacita zdroja.
- **Kombinácie/balíčky**: izba + služba (napr. wellness pobyt) – treba vyriešiť, či je to jedna rezervácia s viacerými položkami, alebo prepojené samostatné rezervácie s jedným účtom.

Toto rozdvojenie dostupnosti (availability) je jadro problému – potrebné sú dva rôzne "availability engine", ale jednotné rozhranie, cez ktoré web aj ostatné systémy pýtajú voľné termíny.

## 2. Dátový model – kľúčové entity

- Prevádzka / lokalita
- Ubytovacia jednotka (izba, typ izby, cenová kategória)
- Služba (typ, trvanie, cena, potrebný zdroj)
- Zdroj (personál, miestnosť, zariadenie) – s vlastným kalendárom dostupnosti
- Zákazník (a otázka, kde je "master" dát)
- Rezervácia (hlavička + položky: izba, služby, extra)
- Cenník / cenové pravidlá (sezóna, zľavy, balíčky, storno podmienky)
- Platba / depozit / faktúra (alebo referencia na ERP doklad)

## 3. Integrácie

### a) ERP systém
- Kto je "master data" pre zákazníka – ERP alebo rezervačný systém? Treba jasne určiť zdroj pravdy a smer synchronizácie.
- Fakturácia – rezervácia vytvára podklad, ERP generuje daňový doklad. Real-time (API call) vs. dávkové (nočný export)?
- Platby a storná – ako sa vracajú stavy platieb späť do rezervačného systému.
- Prípadne sklad/spotrebný materiál, ak služby čerpajú zásoby (napr. kozmetika pri procedúrach).

### b) Service manager
- Zdroj pravdy pre zmeny personálu, dovolenky, PN – musí hlásiť zmeny dostupnosti v reálnom čase (alebo s nízkou latenciou).
- Priradenie konkrétneho zamestnanca k rezervácii – deje sa v rezervačnom systéme, alebo si to "vyžiada" service manager?
- Riešenie konfliktov – čo sa stane s existujúcimi rezerváciami pri chorobe zamestnanca (automatický presun, notifikácia, čakacia listina).

### c) Zákaznícky web
- Real-time dopyt na dostupnosť (API/GraphQL), aby web nezobrazoval neaktuálne termíny.
- Booking flow s bezpečným zamykaním termínu počas platby (aby dvaja zákazníci nezarezervovali to isté).
- Napojenie na platobnú bránu, potvrdzovacie e-maily/SMS, zákaznícky účet a história.

## 4. Technické výzvy naprieč celým systémom

- **Race conditions / double booking** – locking mechanizmus (optimistic locking alebo dočasná rezervácia so zámkom na X minút počas platby).
- **Konzistencia medzi systémami** – čo ak ERP alebo service manager nie je dostupný počas vytvárania rezervácie? (front-run rezervácia + asynchrónna synchronizácia cez frontu správ, retry, saga pattern).
- **Idempotencia** – aby opakovaný request nevytvoril duplicitnú rezerváciu.
- **Autentifikácia/autorizácia** medzi systémami – API kľúče/OAuth2, kto smie čo meniť.
- **Audit log** – história zmien rezervácie (kto, kedy, prečo) – dôležité pri reklamáciách.
- **GDPR a platobné údaje** – najmä ak web priamo spracúva platby (PCI DSS scope).
- **Škálovanie na sezónne špičky.**

## 5. Procesné/UX otázky

- Storno podmienky a politika depozitov (rôzne pre izby vs. služby?)
- Skupinové rezervácie a čakacie listiny
- Notifikácie a pripomienky (email/SMS)
- Zmena rezervácie zákazníkom cez web – miera samoobsluhy

---

# Voľba technológií

## Backend (jadro rezervačnej logiky, API)

**Odporúčanie: TypeScript (Node.js) alebo Go**

- **TypeScript/Node.js** – rýchly vývoj, zdieľanie typov s webom (React/Next.js). NestJS pre modulárnu štruktúru (ubytovanie, služby, integrácie). Nevýhoda: jednovláknový event loop nie je ideálny pre výpočtovo náročné operácie, pre I/O-bound rezervačnú logiku ale väčšinou stačí.
- **Go** – vhodné pri vysokej záťaži, goroutines ideálne na paralelné volania ERP + service manager + platobná brána naraz. Lepší výkon a nižšia latencia, jednoduchší deployment (jeden binárny súbor). Pomalší vývoj, menej knižníc na rýchle prototypovanie.

**Alternatíva:** Kotlin (Spring Boot) – pre enterprise zázemie, komplexné doménové modely, napojenie na ERP typu SAP a pod.

Pre kritické sekcie (zámok termínu počas platby) – Go alebo Node.js s Redis distribuovaným lockom (Redlock).

## Frontend (zákaznícky web)

**Next.js (React) + TypeScript** – štandard pre tento typ webu. SSR/ISR pre SEO, rýchle renderovanie kalendárov dostupnosti, podpora real-time aktualizácií (websockets/SSE).

Alternatíva: SvelteKit – menší bundle, rýchlejší, pre menší tím.

## Real-time vrstva

- WebSockets alebo Server-Sent Events v tom istom Node/Go backende
- Message queue medzi rezervačným systémom, ERP a service managerom: **Kafka** (väčší objem, replay eventov) alebo **RabbitMQ/NATS** (jednoduchšia prevádzka)

## Databáza

- **PostgreSQL** – silné transakčné záruky (ACID), exclusion constraints (zabránenie prekrývajúcim sa rezerváciám priamo v DB), JSONB pre flexibilné polia
- **Redis** – cache dostupnosti a distribuované zámky

## Infraštruktúra / integrácie

Jazyk na integračnú vrstvu (adaptéry na ERP a service manager) rovnaký ako backend (TS alebo Go), aby sa neudržiavali dva stacky. Pri starších protokoloch (SOAP a pod.) môže byť výhodnejší tenký adaptér v inom jazyku podľa dostupných knižníc.

## Konkrétne odporúčanie pre daný prípad

- **Backend:** TypeScript + NestJS
- **Kritické locking/availability endpointy:** Node backend s PostgreSQL exclusion constraints + Redis, prípadne samostatná mikroslužba v Go pri výkonnostných problémoch
- **Frontend:** Next.js + TypeScript
- **DB:** PostgreSQL
- **Messaging:** NATS alebo RabbitMQ (Kafka len pri veľkom objeme eventov)

---

# Go vs. TypeScript/Node.js – porovnanie

## Výkon a konkurencia

**Go**
- Kompilovaný jazyk, natívny strojový kód – rýchlejší ako interpretovaný/JIT-ovaný JS
- Goroutines – tisíce ľahkých vlákien naraz, skutočný paralelizmus na viacerých CPU jadrách
- Ideálne pre súbežné volania viacerých externých systémov naraz

**TypeScript/Node.js**
- Interpretovaný beh cez V8, jednovláknový event loop
- Async/await dobre zvláda I/O-bound súbežnosť, výpočtovo náročné operácie ale blokujú proces
- Pre CRUD + API volania stačí; pri vyššej záťaži treba horizontálne škálovanie

**Záver:** hlavná záťaž rezervačného systému je I/O, takže Node.js zaostáva menej než by sa čakalo. Pri veľmi vysokej konkurencii má Go jasnú výhodu.

## Typový systém

**Go** – statické, striktné, minimalistické generiky, explicitný error handling (`if err != nil`), predvídateľný ale rozvláčnejší kód.

**TypeScript** – statické nad JS, flexibilnejšie (dá sa obísť cez `any`), bohatší typový systém (union types, generiky, mapped types), disciplína tímu rozhoduje o reálnej typovej bezpečnosti.

## Rýchlosť vývoja

**Go** – viac boilerplate (error handling), menší ale kvalitný ekosystém, rýchla kompilácia.

**TypeScript/Node.js** – obrovský ekosystém (npm), rýchlejšie prototypovanie, viac frameworkov (NestJS, Express, Fastify), zdieľanie kódu/typov s frontendom.

## Chybovosť a údržba

**Go** – explicitné error handling znižuje tiché pády, jednoduchší jazyk = menej spôsobov ako niečo pokaziť, statický binárny súbor uľahčuje deployment.

**TypeScript/Node.js** – runtime chyby možné aj napriek typom, dependency hell pri veľkom počte npm balíčkov, vyspelý ale poskladateľný ekosystém pre observability.

## Konkurenčný prístup k dátam (double-booking)

**Go** – goroutines + kanály dávajú čistý model na riadenie prístupu k zdieľaným zdrojom.

**TypeScript/Node.js** – jednovláknovosť pomáha v rámci jedného procesu, pri viacerých inštanciách treba locking cez Redis/DB rovnako ako v Go.

V praxi sa double-booking rieši rovnako dobre v oboch jazykoch, keďže skutočná ochrana beží v databáze (PostgreSQL exclusion constraints) alebo Redis locku.

## Tím a hiring

**Go** – menší, ale skúsenejší trh vývojárov, jednoduchosť jazyka skracuje onboarding.

**TypeScript** – oveľa väčší trh vývojárov, prirodzený prechod pre frontend tímy pracujúce v React/Next.js.

## Zhrnutie

| Kritérium | Go | TypeScript/Node.js |
|---|---|---|
| Výkon pri vysokej záťaži | Vyšší | Nižší (ale dostatočný pre I/O-bound) |
| Rýchlosť vývoja | Pomalšia | Rýchlejšia |
| Typová prísnosť | Vysoká, striktná | Vysoká, ale obíditeľná |
| Ekosystém knižníc | Menší, kvalitnejší | Obrovský |
| Deployment | Jednoduchý (1 binárka) | Zložitejší (runtime + závislosti) |
| Zdieľanie kódu s frontendom | Nie | Áno (ak frontend je tiež TS) |
| Onboarding tímu | Rýchly (jednoduchý jazyk) | Rýchly (populárny jazyk) |
| Vhodnosť na I/O integrácie (ERP, service manager) | Veľmi dobrá | Veľmi dobrá |

**Praktické odporúčanie:** pre rezervačný systém s tromi integráciami a menším/stredným tímom je TypeScript/Node.js pragmatickejšia voľba kvôli rýchlosti vývoja a zdieľaniu kódu s webom. Go sa oplatí nasadiť selektívne – ako samostatnú mikroslužbu pre availability engine (kontrola a lockovanie termínov), kde ide reálne o výkon a konkurenciu pri špičkovej záťaži.
