// Demo content for the fictional agency «Пиксель и Код». Everything here is editable in the CRM;
// the seed only creates what is missing and never overwrites edits (see seed.ts).

export const AGENCY_NAME = "Пиксель и Код";

export const KNOWLEDGE_BASE = `# Агентство «Пиксель и Код»
Небольшое digital-агентство из Москвы. Работаем с малым и средним бизнесом по всей России, удалённо.

## Услуги и цены (ориентиры «от», точная стоимость — после брифа)
- Лендинг (одностраничный сайт): от 60 000 ₽, срок от 2 недель.
- Корпоративный сайт (до 10 страниц): от 180 000 ₽, срок от 5 недель.
- Интернет-магазин: от 350 000 ₽, срок от 2 месяцев.
- Telegram-бот (запись клиентов, приём заявок, каталог): от 50 000 ₽, срок от 2 недель.
- Таргетированная и контекстная реклама: настройка от 30 000 ₽, ведение от 25 000 ₽ в месяц. Рекламный бюджет клиент оплачивает отдельно.
- SMM (ведение соцсетей): от 45 000 ₽ в месяц за 12 постов и сторис.
- Дизайн: логотип от 25 000 ₽, фирменный стиль от 70 000 ₽.

## Как мы работаем
1. Бриф и созвон — бесплатно, 30 минут.
2. Коммерческое предложение и смета — готовит менеджер в течение 2 рабочих дней.
3. Договор и предоплата 50%.
4. Дизайн → разработка → тестирование → запуск.
5. Месяц бесплатной поддержки после запуска.

## Частые вопросы
- Работаете по договору? Да, с ИП, юрлицами и физлицами. Оплата по безналу.
- Можно посмотреть портфолио? Да, менеджер пришлёт кейсы по вашей нише.
- Делаете сайты на Тильде? Да, лендинги — на Тильде или на коде, на выбор клиента.
- Есть рассрочка? Оплата этапами: 50% предоплата, 50% после сдачи.
- Как быстро ответит менеджер? В рабочее время (пн–пт, 10:00–19:00 МСК) — в течение часа.

## Что мы НЕ делаем
- Не продвигаем казино, ставки, финансовые пирамиды и «серые» товары.
- Не разрабатываем мобильные приложения под iOS и Android.
- Не берём SEO-продвижение с гарантией позиций.
- Не гарантируем количество заявок и продаж.

## Тон общения
Вежливо, на «вы», коротко и по делу. Без канцелярита и давления.`;

/** Palette keys are rendered by the CRM (see the leads module tag palette). */
export const TAGS: Array<{ name: string; color: string }> = [
  { name: "Сайт", color: "blue" },
  { name: "Лендинг", color: "sky" },
  { name: "Telegram-бот", color: "teal" },
  { name: "Реклама", color: "orange" },
  { name: "SMM", color: "pink" },
  { name: "Дизайн", color: "violet" },
  { name: "Горячий", color: "red" },
  { name: "Тёплый", color: "amber" },
  { name: "Холодный", color: "slate" },
  { name: "Срочно", color: "red" },
  { name: "Большой бюджет", color: "green" },
  { name: "Демо", color: "slate" },
];

type DemoMessage = {
  minutesAfter: number;
  direction: "inbound" | "outbound" | "internal";
  author: "client" | "manager" | "ai" | "system";
  text: string;
  meta?: Record<string, string | number | boolean>;
};

export type DemoLead = {
  id: string;
  name: string;
  contact: string | null;
  contactType: "phone" | "telegram" | "email" | null;
  request: string;
  source: "bot" | "telegram_account" | "manual";
  aiMode: "autopilot" | "copilot" | "off";
  needsHuman?: boolean;
  handoffReason?: string;
  hoursAgo: number;
  tags: Array<{ name: string; origin: "manual" | "ai"; confidence?: number }>;
  qualification: {
    service: string;
    budget: string | null;
    urgency: "low" | "normal" | "high" | null;
    temperature: "hot" | "warm" | "cold";
    summary: string;
    confidence: number;
    hints: string[];
  };
  messages: DemoMessage[];
};

// Demo leads have no live Telegram chat (channelKey is null), so replies are disabled for them.
export const DEMO_LEADS: DemoLead[] = [
  {
    id: "demo_lead_yoga",
    name: "Анна Смирнова",
    contact: "+79161234567",
    contactType: "phone",
    request: "Нужен лендинг для студии йоги, хотим запустить рекламу к ноябрю. Бюджет около 80 тысяч.",
    source: "bot",
    aiMode: "autopilot",
    hoursAgo: 30,
    tags: [
      { name: "Лендинг", origin: "ai", confidence: 0.93 },
      { name: "Реклама", origin: "ai", confidence: 0.81 },
      { name: "Тёплый", origin: "ai", confidence: 0.78 },
      { name: "Демо", origin: "manual" },
    ],
    qualification: {
      service: "landing",
      budget: "около 80 тысяч",
      urgency: "normal",
      temperature: "warm",
      summary: "Лендинг для студии йоги и реклама к ноябрю, бюджет ~80 тыс.",
      confidence: 0.86,
      hints: [],
    },
    messages: [
      {
        minutesAfter: 0,
        direction: "inbound",
        author: "client",
        text: "Нужен лендинг для студии йоги, хотим запустить рекламу к ноябрю. Бюджет около 80 тысяч.",
      },
      {
        minutesAfter: 1,
        direction: "outbound",
        author: "ai",
        text: "Здравствуйте, Анна! Я AI-ассистент агентства «Пиксель и Код». Лендинг у нас стоит от 60 000 ₽ и делается от 2 недель, настройка рекламы — от 30 000 ₽. Точную смету подготовит менеджер после короткого брифа. Подскажите, у студии уже есть сайт или соцсети?",
        meta: { kind: "autopilot", model: "demo", confidence: 0.9 },
      },
      {
        minutesAfter: 7,
        direction: "inbound",
        author: "client",
        text: "Есть только инстаграм. Успеете до ноября?",
      },
    ],
  },
  {
    id: "demo_lead_stroydom",
    name: "Игорь Павлов (СтройДом)",
    contact: "@igor_stroydom",
    contactType: "telegram",
    request: "Нужен корпоративный сайт с каталогом техники. Пришлите договор и КП.",
    source: "bot",
    aiMode: "copilot",
    needsHuman: true,
    handoffReason: "trigger",
    hoursAgo: 5,
    tags: [
      { name: "Сайт", origin: "ai", confidence: 0.95 },
      { name: "Горячий", origin: "ai", confidence: 0.88 },
      { name: "Большой бюджет", origin: "manual" },
      { name: "Демо", origin: "manual" },
    ],
    qualification: {
      service: "website",
      budget: null,
      urgency: "high",
      temperature: "hot",
      summary: "Корпоративный сайт с каталогом техники, просит договор и КП.",
      confidence: 0.9,
      hints: ["Срочно"],
    },
    messages: [
      {
        minutesAfter: 0,
        direction: "inbound",
        author: "client",
        text: "Нужен корпоративный сайт с каталогом техники. Пришлите договор и КП.",
      },
      {
        minutesAfter: 0,
        direction: "outbound",
        author: "ai",
        text: "Передал ваш вопрос менеджеру — он ответит здесь же.",
        meta: { kind: "handoff_notice" },
      },
      {
        minutesAfter: 0,
        direction: "internal",
        author: "system",
        text: "AI передал диалог менеджеру: клиент просит договор и КП",
        meta: { kind: "handoff", reason: "trigger" },
      },
    ],
  },
  {
    id: "demo_lead_cafe",
    name: "Мария Орлова",
    contact: "@maria_coffee",
    contactType: "telegram",
    request: "Добрый день! Вы ведёте соцсети для кофеен?",
    source: "telegram_account",
    aiMode: "copilot",
    hoursAgo: 52,
    tags: [
      { name: "SMM", origin: "ai", confidence: 0.91 },
      { name: "Тёплый", origin: "ai", confidence: 0.74 },
      { name: "Демо", origin: "manual" },
    ],
    qualification: {
      service: "smm",
      budget: null,
      urgency: "low",
      temperature: "warm",
      summary: "Кофейня ищет ведение соцсетей.",
      confidence: 0.8,
      hints: ["Дизайн"],
    },
    messages: [
      {
        minutesAfter: 0,
        direction: "inbound",
        author: "client",
        text: "Добрый день! Вы ведёте соцсети для кофеен?",
      },
      {
        minutesAfter: 12,
        direction: "outbound",
        author: "manager",
        text: "Здравствуйте, Мария! Да, у нас есть кейсы с кофейнями. Пришлю примеры и расскажу про форматы.",
        meta: { via: "telegram_app" },
      },
    ],
  },
  {
    id: "demo_lead_barber",
    name: "Дмитрий Козлов",
    contact: "dmitry.kozlov@example.com",
    contactType: "email",
    request: "Позвонил по рекомендации. Нужен Telegram-бот для записи клиентов в барбершоп.",
    source: "manual",
    aiMode: "off",
    hoursAgo: 75,
    tags: [
      { name: "Telegram-бот", origin: "manual" },
      { name: "Срочно", origin: "manual" },
      { name: "Демо", origin: "manual" },
    ],
    qualification: {
      service: "telegram_bot",
      budget: null,
      urgency: "high",
      temperature: "hot",
      summary: "Бот для записи клиентов в барбершоп, пришёл по рекомендации.",
      confidence: 0.84,
      hints: [],
    },
    messages: [],
  },
  {
    id: "demo_lead_logo",
    name: "Олег",
    contact: "+79990001122",
    contactType: "phone",
    request: "Просто узнаю цены на логотип.",
    source: "bot",
    aiMode: "autopilot",
    hoursAgo: 100,
    tags: [
      { name: "Дизайн", origin: "ai", confidence: 0.89 },
      { name: "Холодный", origin: "ai", confidence: 0.72 },
      { name: "Демо", origin: "manual" },
    ],
    qualification: {
      service: "design",
      budget: null,
      urgency: "low",
      temperature: "cold",
      summary: "Интересуется ценой логотипа, без сроков и бюджета.",
      confidence: 0.77,
      hints: [],
    },
    messages: [
      {
        minutesAfter: 0,
        direction: "inbound",
        author: "client",
        text: "Просто узнаю цены на логотип.",
      },
      {
        minutesAfter: 1,
        direction: "outbound",
        author: "ai",
        text: "Здравствуйте, Олег! Я AI-ассистент агентства. Логотип у нас стоит от 25 000 ₽, фирменный стиль — от 70 000 ₽. Если расскажете о проекте, менеджер подготовит точное предложение.",
        meta: { kind: "autopilot", model: "demo", confidence: 0.88 },
      },
    ],
  },
];
