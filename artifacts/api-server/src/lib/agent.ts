import OpenAI from "openai";
import { logger } from "./logger";
import {
  KiwiMcpClient,
  TrivagoMcpClient,
  FoursquareMcpClient,
  McpLogEntry,
  makeLog,
} from "./mcp";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CITY_TRANSLATIONS: Record<string, string> = {
  москва: "Moscow",
  питер: "Saint Petersburg",
  "санкт-петербург": "Saint Petersburg",
  петербург: "Saint Petersburg",
  лондон: "London",
  париж: "Paris",
  рим: "Rome",
  берлин: "Berlin",
  барселона: "Barcelona",
  мадрид: "Madrid",
  прага: "Prague",
  вена: "Vienna",
  варшава: "Warsaw",
  амстердам: "Amsterdam",
  брюссель: "Brussels",
  будапешт: "Budapest",
  бухарест: "Bucharest",
  стамбул: "Istanbul",
  дубай: "Dubai",
  токио: "Tokyo",
  пекин: "Beijing",
  бангкок: "Bangkok",
  сингапур: "Singapore",
  "нью-йорк": "New York",
  "лос-анджелес": "Los Angeles",
  майами: "Miami",
  чикаго: "Chicago",
  toronto: "Toronto",
  монреаль: "Montreal",
  сидней: "Sydney",
  мельбурн: "Melbourne",
  копенгаген: "Copenhagen",
  стокгольм: "Stockholm",
  хельсинки: "Helsinki",
  осло: "Oslo",
  лиссабон: "Lisbon",
  афины: "Athens",
  дублин: "Dublin",
  цюрих: "Zurich",
  женева: "Geneva",
  милан: "Milan",
  флоренция: "Florence",
  венеция: "Venice",
  неаполь: "Naples",
  краков: "Krakow",
  львов: "Lviv",
  киев: "Kyiv",
  минск: "Minsk",
  тбилиси: "Tbilisi",
  ереван: "Yerevan",
  баку: "Baku",
  ташкент: "Tashkent",
  алматы: "Almaty",
  астана: "Astana",
};

function translateCity(city: string): string {
  const lower = city.toLowerCase().trim();
  return CITY_TRANSLATIONS[lower] ?? city;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystemPrompt(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const todayDDMMYYYY = `${day}/${month}/${year}`;
  const todayYYYYMMDD = `${year}-${month}-${day}`;
  const weekdays = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const todayWeekday = weekdays[now.getDay()];
  // nearest Friday
  const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
  const nextFriday = new Date(now);
  nextFriday.setDate(now.getDate() + daysUntilFriday);
  const nfDay = String(nextFriday.getDate()).padStart(2, "0");
  const nfMonth = String(nextFriday.getMonth() + 1).padStart(2, "0");
  const nfYear = nextFriday.getFullYear();
  const nextFridayDDMMYYYY = `${nfDay}/${nfMonth}/${nfYear}`;
  const nextFridayYYYYMMDD = `${nfYear}-${nfMonth}-${nfDay}`;
  // next Saturday/Sunday
  const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
  const nextSat = new Date(now);
  nextSat.setDate(now.getDate() + daysUntilSat);
  const nsSatDay = String(nextSat.getDate()).padStart(2, "0");
  const nsSatMonth = String(nextSat.getMonth() + 1).padStart(2, "0");
  const nsSatYear = nextSat.getFullYear();
  const nextSun = new Date(nextSat);
  nextSun.setDate(nextSat.getDate() + 1);
  const nsSunDay = String(nextSun.getDate()).padStart(2, "0");
  const nsSunMonth = String(nextSun.getMonth() + 1).padStart(2, "0");
  const nsSunYear = nextSun.getFullYear();

  return `Ты — Travel Assistant AI, умный помощник для поиска авиабилетов, отелей и достопримечательностей.

ТЕКУЩАЯ ДАТА И ВРЕМЯ (используй ТОЛЬКО эти значения при вычислении дат):
- Сегодня: ${todayWeekday}, ${day}.${month}.${year}
- Сегодня в формате dd/mm/yyyy (для Kiwi): ${todayDDMMYYYY}
- Сегодня в формате YYYY-MM-DD (для отелей): ${todayYYYYMMDD}
- Ближайшая пятница: ${nextFridayDDMMYYYY} (для Kiwi) / ${nextFridayYYYYMMDD} (для отелей)
- Ближайшие выходные: суббота ${nsSatDay}.${nsSatMonth}.${nsSatYear}, воскресенье ${nsSunDay}.${nsSunMonth}.${nsSunYear}
- Год сейчас: ${year}. Никогда не используй прошлые годы (2023, 2024, 2025)!

ПРАВИЛО ДАТ: Все даты ОБЯЗАТЕЛЬНО должны быть в будущем (не ранее сегодня ${todayDDMMYYYY}). При поиске "на следующую пятницу" используй ${nextFridayDDMMYYYY}. При поиске "на выходные" — суббота ${nsSatDay}/${nsSatMonth}/${nsSatYear}.`;
}

const SYSTEM_PROMPT_STATIC = `

Ты умеешь:
1. Искать авиабилеты через Kiwi MCP (инструмент: search_flights)
2. Искать отели через Trivago MCP (инструмент: search_hotels)
3. Искать достопримечательности и интересные места через Foursquare MCP (инструмент: search_places)
4. Комплексно подбирать поездку (билет + отель) (инструмент: search_trip)

ВАЖНЫЕ ПРАВИЛА:
- Всегда отвечай на русском языке
- Для Trivago используй ТОЛЬКО английские названия городов (Прага → Prague, Вена → Vienna и т.д.)
- Для Kiwi используй IATA коды аэропортов или английские названия городов
- Форматируй результаты красиво с эмодзи и структурой
- Если пользователь спрашивает про поездку в целом — ищи и билеты, и отель
- КРИТИЧЕСКИ ВАЖНО: даты ВСЕГДА должны быть в будущем! Используй текущую дату, указанную выше.

Формат ответа для рейсов:
✈️ **Маршрут:** [from] → [to]
📅 **Дата:** [date]
🏢 **Авиакомпания:** [airline]
💰 **Цена:** [price]
🔗 **Ссылка:** [link или "уточните на сайте"]

Формат ответа для отелей:
🏨 **Отель:** [name]
⭐ **Рейтинг:** [rating]
💰 **Цена:** [price]
📍 **Адрес:** [address]
🔗 **Ссылка:** [link]

Формат ответа для достопримечательностей:
🗺️ **Название:** [name]
📝 **Описание:** [description]
📍 **Адрес:** [address]
⭐ **Рейтинг:** [rating]

Если результатов нет — честно сообщи об этом и предложи альтернативы.

Доступные инструменты:
- search_flights(from, to, date_from, date_to?) — поиск авиабилетов
- search_hotels(city_en, check_in, check_out) — поиск отелей (city_en — английское название!)
- search_places(query, near) — поиск мест/достопримечательностей
- search_trip(from, to, date_from, city_en, check_in, check_out) — комплексный поиск`;

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Search for flights using Kiwi MCP",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Departure city or IATA code (English)" },
          to: { type: "string", description: "Destination city or IATA code (English)" },
          date_from: { type: "string", description: "Departure date in dd/mm/yyyy format" },
          date_to: { type: "string", description: "Optional end date for flexible search in dd/mm/yyyy" },
        },
        required: ["from", "to", "date_from"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_hotels",
      description: "Search for hotels using Trivago MCP. IMPORTANT: city_en must be in English!",
      parameters: {
        type: "object",
        properties: {
          city_en: { type: "string", description: "City name in English (required by Trivago)" },
          check_in: { type: "string", description: "Check-in date in YYYY-MM-DD format" },
          check_out: { type: "string", description: "Check-out date in YYYY-MM-DD format" },
        },
        required: ["city_en", "check_in", "check_out"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Search for attractions and interesting places using Foursquare",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for (e.g. museum, restaurant, park)" },
          near: { type: "string", description: "City or location in English" },
        },
        required: ["query", "near"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_trip",
      description: "Search for both flights and hotels for a complete trip",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Departure city (English)" },
          to: { type: "string", description: "Destination city (English)" },
          date_from: { type: "string", description: "Departure date in dd/mm/yyyy" },
          city_en: { type: "string", description: "Destination city in English for hotel search" },
          check_in: { type: "string", description: "Hotel check-in date YYYY-MM-DD" },
          check_out: { type: "string", description: "Hotel check-out date YYYY-MM-DD" },
        },
        required: ["from", "to", "date_from", "city_en", "check_in", "check_out"],
      },
    },
  },
];

export interface AgentResult {
  content: string;
  mcpLogs: McpLogEntry[];
}

export async function runAgent(
  messages: AgentMessage[],
  foursquareApiKey: string,
): Promise<AgentResult> {
  const allLogs: McpLogEntry[] = [];

  const addLog = (entry: McpLogEntry) => allLogs.push(entry);

  addLog(makeLog("info", "System", "Запуск Travel Assistant AI агента"));

  const conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() + SYSTEM_PROMPT_STATIC },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let finalContent = "";

  // Agentic loop — max 5 iterations
  for (let i = 0; i < 5; i++) {
    addLog(makeLog("info", "System", `Запрос к OpenAI GPT (итерация ${i + 1})`));

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationMessages,
      tools,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    const msg = choice.message;
    conversationMessages.push(msg);

    if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
      finalContent = msg.content ?? "";
      addLog(makeLog("info", "System", "Агент завершил работу"));
      break;
    }

    // Process tool calls
    for (const tc of msg.tool_calls) {
      const fnName = tc.function.name;
      let args: Record<string, string>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      let toolResult = "";

      if (fnName === "search_flights") {
        const kiwi = new KiwiMcpClient();
        const initialized = await kiwi.initialize();

        if (initialized) {
          const flights = await kiwi.searchFlights(
            args.from,
            args.to,
            args.date_from,
            args.date_to,
          );
          kiwi.getLogs().forEach(addLog); // add all logs once after everything

          if (flights.length > 0) {
            toolResult = JSON.stringify(flights);
          } else {
            toolResult = JSON.stringify({ message: "Рейсы не найдены. Попробуйте другие даты или маршрут." });
          }
        } else {
          kiwi.getLogs().forEach(addLog);
          toolResult = JSON.stringify({ error: "Не удалось подключиться к Kiwi MCP" });
        }
      } else if (fnName === "search_hotels") {
        const cityEn = translateCity(args.city_en);
        const trivago = new TrivagoMcpClient();
        const hotels = await trivago.searchHotels(cityEn, args.check_in, args.check_out);
        trivago.getLogs().forEach(addLog);

        if (trivago.rawContent) {
          // Pass Trivago's formatted response directly — it contains GPT formatting instructions
          toolResult = trivago.rawContent;
        } else if (hotels.length > 0) {
          toolResult = JSON.stringify(hotels);
        } else {
          toolResult = JSON.stringify({ message: `Отели в ${cityEn} не найдены. Попробуйте другие даты.` });
        }
      } else if (fnName === "search_places") {
        const fsq = new FoursquareMcpClient(foursquareApiKey);
        const places = await fsq.searchPlaces(args.query, translateCity(args.near));
        fsq.getLogs().forEach(addLog);

        if (places.length > 0) {
          toolResult = JSON.stringify(places);
        } else {
          toolResult = JSON.stringify({ message: `Места по запросу "${args.query}" в ${args.near} не найдены.` });
        }
      } else if (fnName === "search_trip") {
        const cityEn = translateCity(args.city_en);
        addLog(makeLog("info", "System", `Комплексный поиск поездки в ${cityEn}`));

        // Search flights and hotels in parallel
        const kiwi = new KiwiMcpClient();
        const trivago = new TrivagoMcpClient();

        const [flightsInitOk, hotels] = await Promise.all([
          kiwi.initialize().then(async (ok) => {
            kiwi.getLogs().forEach(addLog);
            if (!ok) return [];
            const flights = await kiwi.searchFlights(args.from, args.to, args.date_from);
            kiwi.getLogs().slice(-10).forEach(addLog);
            return flights;
          }),
          trivago.searchHotels(cityEn, args.check_in, args.check_out).then((h) => {
            trivago.getLogs().forEach(addLog);
            return h;
          }),
        ]);

        toolResult = JSON.stringify({ flights: flightsInitOk, hotels });
      } else {
        toolResult = JSON.stringify({ error: "Неизвестный инструмент" });
        logger.warn({ fnName }, "Unknown tool called");
      }

      conversationMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  return { content: finalContent, mcpLogs: allLogs };
}
