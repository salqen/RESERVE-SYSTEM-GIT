/**
 * Stav projektu tak, ako ho vidí správca v admine.
 *
 * Zdroj pravdy zostáva EDIT-LOG.md v repozitári; toto je jeho zhrnutie pre
 * ľudí, ktorí do repozitára nevidia. Pri väčšej zmene aktualizuj oboje.
 */

export type ItemStatus = 'done' | 'waiting' | 'todo';

export interface RoadmapItem {
  title: string;
  status: ItemStatus;
  /** Čo presne je hotové, alebo čo ešte treba spraviť. */
  detail: string;
  /** Ak čaká na niečo mimo kódu – napríklad na účet u poskytovateľa. */
  blockedBy?: string;
}

export interface RoadmapPhase {
  name: string;
  summary: string;
  items: RoadmapItem[];
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  done: 'Hotové',
  waiting: 'Čaká na konfiguráciu',
  todo: 'Zostáva',
};

export const ROADMAP: RoadmapPhase[] = [
  {
    name: 'Fáza 1 – Jadro',
    summary: 'Dátový model a ochrana proti dvojitej rezervácii.',
    items: [
      {
        title: 'Databázová schéma a availability engine',
        status: 'done',
        detail: 'Izby, služby, zdroje, rezervácie, cenník. Dvojitú rezerváciu blokuje priamo databáza (exclusion constraints), nie aplikačný kód – je jedno, koľko inštancií beží.',
      },
      {
        title: 'Dočasný zámok termínu',
        status: 'done',
        detail: 'Hold s obmedzenou platnosťou; po vypršaní sa termín automaticky uvoľní. Testované piatimi súbežnými rezerváciami toho istého termínu – prejde práve jedna.',
      },
    ],
  },
  {
    name: 'Fáza 2 – Rezervačný proces a administrácia',
    summary: 'Vytvorenie, zmena a storno rezervácie vrátane pravidiel.',
    items: [
      {
        title: 'Booking flow a storno politiky',
        status: 'done',
        detail: 'Hold → potvrdenie → storno s výpočtom vrátenej sumy podľa času do začiatku pobytu. Sezónne ceny a minimálna dĺžka pobytu.',
      },
      {
        title: 'Audit log',
        status: 'done',
        detail: 'Každá zmena rezervácie má záznam vrátane toho, kto ju vykonal. Vidno ho v detaile rezervácie.',
      },
    ],
  },
  {
    name: 'Fáza 3 – Integrácie',
    summary: 'Napojenie na ERP a na správu personálu.',
    items: [
      {
        title: 'Adaptér na keepi ERP',
        status: 'waiting',
        detail: 'Podklad faktúry pri potvrdení, storno a vrátenie pri zrušení. Pri výpadku ERP rezervácia prejde a synchronizuje sa neskôr.',
        blockedBy: 'Premenné KEEPI_API_URL, KEEPI_API_KEY a KEEPI_WEBHOOK_SECRET. Bez nich sa eventy hromadia v outboxe – nič sa nestráca.',
      },
      {
        title: 'Webhooky o dostupnosti personálu',
        status: 'waiting',
        detail: 'Príjem neprítomností zo service managera vrátane detekcie konfliktu s existujúcou rezerváciou.',
        blockedBy: 'Premenná SERVICE_MANAGER_WEBHOOK_SECRET.',
      },
    ],
  },
  {
    name: 'Fáza 4 – Zákaznícky web',
    summary: 'To, čo vidí a používa hosť.',
    items: [
      {
        title: 'Vyhľadanie termínu a rezervácia',
        status: 'done',
        detail: 'Voľné izby podľa termínu, sloty služieb, celý proces až po potvrdenie a samoobslužné storno.',
      },
      {
        title: 'Zákaznícky účet',
        status: 'done',
        detail: 'Registrácia, prihlásenie, prehľad vlastných rezervácií. Kto rezervoval bez účtu, uvidí staršie rezervácie hneď po registrácii na ten istý e-mail.',
      },
      {
        title: 'Potvrdzovacie e-maily',
        status: 'waiting',
        detail: 'E-mail po potvrdení aj po storne vrátane vyúčtovania. Odosielanie s opakovaním pri výpadku, poistka proti dvojitému odoslaniu.',
        blockedBy: 'Účet u Resend alebo Postmark a premenné EMAIL_API_KEY a EMAIL_FROM. Bez nich sa e-maily neodosielajú, systém funguje ďalej.',
      },
      {
        title: 'Platobná brána',
        status: 'todo',
        detail: 'Teraz je na mieste platby testovacie tlačidlo, ktoré rezerváciu potvrdí bez zaplatenia. Nahradiť skutočnou platbou.',
        blockedBy: 'Rozhodnutie o poskytovateľovi (Stripe, GoPay, Besteron) a založený účet.',
      },
    ],
  },
  {
    name: 'Administrácia',
    summary: 'Toto rozhranie.',
    items: [
      {
        title: 'Účty a prihlásenie',
        status: 'done',
        detail: 'Heslá cez scrypt, prihlásenie na obmedzený čas, obmedzenie počtu pokusov, roly owner a personál.',
      },
      {
        title: 'Kalendár, rezervácie, katalóg, používatelia',
        status: 'done',
        detail: 'Obsadenosť po dňoch, zoznam a detail rezervácií s ručným stornom, správa izieb, služieb, sezónnych cien a zdrojov.',
      },
    ],
  },
  {
    name: 'Fáza 5 – Prevádzka',
    summary: 'Veci, ktoré prídu na rad po spustení.',
    items: [
      {
        title: 'Pripomienky a čakacie listiny',
        status: 'todo',
        detail: 'Pripomienka pred príchodom, čakacia listina na obsadené termíny, skupinové rezervácie.',
      },
      {
        title: 'Monitoring a GDPR',
        status: 'todo',
        detail: 'Sledovanie chýb, retencia osobných údajov, záťažový test na sezónnu špičku.',
      },
    ],
  },
];
