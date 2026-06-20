import { logger } from "./logger";

export type McpLogType =
  | "connect"
  | "init"
  | "tool_call"
  | "tool_args"
  | "tool_response"
  | "error"
  | "info";

export interface McpLogEntry {
  timestamp: string;
  type: McpLogType;
  service: string;
  content: string;
  data?: object | null;
}

function now(): string {
  return new Date().toISOString();
}

export function makeLog(
  type: McpLogType,
  service: string,
  content: string,
  data?: object | null,
): McpLogEntry {
  return { timestamp: now(), type, service, content, data: data ?? null };
}

export interface KiwiFlightResult {
  route: string;
  date: string;
  airline: string;
  price: string;
  link?: string;
  raw?: unknown;
}

export interface TrivagoHotelResult {
  name: string;
  rating?: string;
  price?: string;
  address?: string;
  link?: string;
}

export interface FoursquarePlace {
  name: string;
  description?: string;
  address?: string;
  rating?: string;
}

// ─── Kiwi MCP Client ────────────────────────────────────────────────────────

export class KiwiMcpClient {
  private sessionId: string | null = null;
  private baseUrl = "https://mcp.kiwi.com";
  private logs: McpLogEntry[] = [];

  getLogs(): McpLogEntry[] {
    return [...this.logs];
  }

  private log(type: McpLogType, content: string, data?: object | null) {
    const entry = makeLog(type, "Kiwi", content, data);
    this.logs.push(entry);
    logger.info({ mcpLog: entry }, "Kiwi MCP");
  }

  async initialize(): Promise<boolean> {
    this.logs = [];
    this.log("connect", `Подключение к Kiwi MCP: ${this.baseUrl}`);
    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "travel-assistant", version: "1.0.0" },
          },
          id: 1,
        }),
      });

      const sessionHeader = response.headers.get("mcp-session-id");
      if (sessionHeader) {
        this.sessionId = sessionHeader;
        this.log("init", `Сессия Kiwi инициализирована. Session ID: ${this.sessionId}`);
        return true;
      }

      const text = await response.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data:"));
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line.replace("data:", "").trim());
          if (parsed?.result?.sessionId) {
            this.sessionId = parsed.result.sessionId;
            this.log("init", `Сессия Kiwi инициализирована. Session ID: ${this.sessionId}`);
            return true;
          }
        } catch {
          // continue
        }
      }

      this.log("init", "Kiwi MCP готов (без явного Session ID)");
      return true;
    } catch (err) {
      this.log("error", `Ошибка подключения к Kiwi: ${String(err)}`);
      return false;
    }
  }

  async searchFlights(
    from: string,
    to: string,
    dateFrom: string,
    returnDate?: string,
  ): Promise<KiwiFlightResult[]> {
    this.log("tool_call", `Вызов search-flight: ${from} → ${to}, дата: ${dateFrom}`);
    const args: Record<string, unknown> = {
      flyFrom: from,
      flyTo: to,
      departureDate: dateFrom,
      passengers: { adults: 1, children: 0, infants: 0 },
      curr: "EUR",
      locale: "ru",
      sort: "price",
    };
    if (returnDate && returnDate !== dateFrom) {
      args.returnDate = returnDate;
    }
    this.log("tool_args", "Аргументы запроса", args as object);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      if (this.sessionId) {
        headers["mcp-session-id"] = this.sessionId;
      }

      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "search-flight", arguments: args },
          id: 2,
        }),
      });

      const text = await response.text();
      const preview = text.slice(0, 400);

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        const lines = text.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try {
            data = JSON.parse(line.replace("data:", "").trim());
            break;
          } catch {
            // continue
          }
        }
      }

      const flights = this.parseFlightResults(data);
      this.log("tool_response", `Kiwi ответил: найдено ${flights.length} рейсов`, { status: response.status, preview });
      return flights;
    } catch (err) {
      this.log("error", `Ошибка поиска рейсов: ${String(err)}`);
      return [];
    }
  }

  private parseFlightResults(data: unknown): KiwiFlightResult[] {
    try {
      const result = (data as Record<string, unknown>)?.result;
      const content = (result as Record<string, unknown>)?.content;
      const items = Array.isArray(content) ? content : [];

      const results: KiwiFlightResult[] = [];
      for (const item of items) {
        const text = (item as Record<string, unknown>)?.text;
        if (typeof text === "string") {
          try {
            const parsed = JSON.parse(text);
            const flights = Array.isArray(parsed) ? parsed : [parsed];
            for (const f of flights) {
              if (!f || typeof f !== "object") continue;
              results.push({
                route: `${f.cityFrom ?? f.flyFrom ?? "?"} → ${f.cityTo ?? f.flyTo ?? "?"}`,
                date: f.departure?.local ?? f.departure?.utc ?? "?",
                airline: f.airlines?.[0] ?? f.airline ?? "?",
                price: f.price ? `${f.price} ${f.curr ?? "EUR"}` : "Уточните на сайте",
                link: f.deep_link ?? f.link ?? f.bookingLink,
                raw: f,
              });
            }
          } catch {
            results.push({
              route: "Результат",
              date: "?",
              airline: "?",
              price: text.slice(0, 200),
            });
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}

// ─── Trivago MCP Client ──────────────────────────────────────────────────────

export class TrivagoMcpClient {
  private baseUrl = "https://mcp.trivago.com/mcp";
  private sessionId: string | null = null;
  private logs: McpLogEntry[] = [];

  getLogs(): McpLogEntry[] {
    return [...this.logs];
  }

  private log(type: McpLogType, content: string, data?: object | null) {
    const entry = makeLog(type, "Trivago", content, data);
    this.logs.push(entry);
    logger.info({ mcpLog: entry }, "Trivago MCP");
  }

  private async initialize(): Promise<boolean> {
    this.log("connect", `Подключение к Trivago MCP: ${this.baseUrl}`);
    try {
      const resp = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "travel-assistant", version: "1.0.0" },
          },
          id: 1,
        }),
      });

      const sid = resp.headers.get("mcp-session-id");
      if (sid) {
        this.sessionId = sid;
        this.log("init", `Trivago сессия инициализирована. Session ID: ${sid}`);
        return true;
      }

      this.log("error", "Trivago: не получен mcp-session-id");
      return false;
    } catch (err) {
      this.log("error", `Ошибка подключения к Trivago: ${String(err)}`);
      return false;
    }
  }

  rawContent: string | null = null;

  async searchHotels(cityEn: string, checkIn: string, checkOut: string): Promise<TrivagoHotelResult[]> {
    this.logs = [];
    this.rawContent = null;

    const ok = await this.initialize();
    if (!ok) return [];

    // Ensure at least a 2-night stay (Trivago requires departure > arrival by ≥1 day; some queries end up same-day)
    let departure = checkOut;
    if (departure <= checkIn) {
      const d = new Date(checkIn);
      d.setDate(d.getDate() + 1);
      departure = d.toISOString().slice(0, 10);
    }

    this.log("tool_call", `trivago-accommodation-search: "${cityEn}", заезд ${checkIn} → выезд ${departure}`);
    const args = {
      query: cityEn,
      arrival: checkIn,
      departure,
      adults: 2,
    };
    this.log("tool_args", "Аргументы запроса", args);

    try {
      const resp = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "trivago-accommodation-search", arguments: args },
          id: 2,
        }),
      });

      const text = await resp.text();

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        const lines = text.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try { data = JSON.parse(line.replace("data:", "").trim()); break; } catch { /* continue */ }
        }
      }

      const hotels = this.parseHotelResults(data);
      this.log("tool_response", `Trivago ответил: найдено ${hotels.length} отелей`, { status: resp.status });
      return hotels;
    } catch (err) {
      this.log("error", `Ошибка trivago-accommodation-search: ${String(err)}`);
      return [];
    }
  }

  private parseHotelResults(data: unknown): TrivagoHotelResult[] {
    try {
      const result = (data as Record<string, unknown>)?.result;
      const content = (result as Record<string, unknown>)?.content;
      const items = Array.isArray(content) ? content : [];
      const results: TrivagoHotelResult[] = [];

      for (const item of items) {
        const rawText = (item as Record<string, unknown>)?.text;
        if (typeof rawText !== "string") continue;

        // Store raw content so agent can pass it directly to GPT
        this.rawContent = rawText;

        try {
          // Trivago wraps hotels in { "output": "[...JSON array...]", "system_message": "..." }
          const outer = JSON.parse(rawText);
          const outputStr = outer?.output ?? rawText;
          const hotels = typeof outputStr === "string"
            ? JSON.parse(outputStr)
            : (Array.isArray(outputStr) ? outputStr : []);

          for (const h of Array.isArray(hotels) ? hotels : []) {
            if (!h || typeof h !== "object") continue;
            results.push({
              name: h.accommodation_name ?? h.name ?? "Отель",
              rating: h.review_rating ?? h.hotel_rating != null ? `${h.review_rating ?? ""} (${h.hotel_rating ?? "?"}★)` : undefined,
              price: h.price_per_night ? `${h.price_per_night}/ночь (итого ${h.price_per_stay ?? "?"})` : undefined,
              address: h.country_city ?? h.address,
              link: h.accommodation_url ?? h.url,
            });
          }
        } catch {
          // If JSON parsing fails, surface the raw text
          results.push({ name: "Результат", price: rawText.slice(0, 400) });
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}

// ─── Foursquare MCP Client ───────────────────────────────────────────────────

export class FoursquareMcpClient {
  private baseUrl = "https://gateway.pipeworx.io/foursquare/mcp";
  private apiKey: string;
  private logs: McpLogEntry[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getLogs(): McpLogEntry[] {
    return [...this.logs];
  }

  private log(type: McpLogType, content: string, data?: object | null) {
    const entry = makeLog(type, "Foursquare", content, data);
    this.logs.push(entry);
    logger.info({ mcpLog: entry }, "Foursquare MCP");
  }

  async searchPlaces(query: string, near: string, limit = 5): Promise<FoursquarePlace[]> {
    this.logs = [];
    this.log("connect", `Подключение к Foursquare MCP: ${this.baseUrl}`);
    this.log("tool_call", `search_places: "${query}" near "${near}"`);
    const args = { query, near, limit, _apiKey: this.apiKey };
    this.log("tool_args", "Аргументы запроса", { query, near, limit });

    try {
      const resp = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "search_places", arguments: args },
          id: 1,
        }),
      });

      const text = await resp.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        const lines = text.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try { data = JSON.parse(line.replace("data:", "").trim()); break; } catch { /* continue */ }
        }
      }

      const places = this.parsePlaceResults(data);
      this.log("tool_response", `Foursquare ответил: найдено ${places.length} мест`, { status: resp.status });
      return places;
    } catch (err) {
      this.log("error", `Ошибка Foursquare: ${String(err)}`);
      return [];
    }
  }

  private parsePlaceResults(data: unknown): FoursquarePlace[] {
    try {
      const result = (data as Record<string, unknown>)?.result;
      const content = (result as Record<string, unknown>)?.content;
      const items = Array.isArray(content) ? content : [];
      const results: FoursquarePlace[] = [];
      for (const item of items) {
        const text = (item as Record<string, unknown>)?.text;
        if (typeof text === "string") {
          try {
            const parsed = JSON.parse(text);
            const places = parsed?.results ?? parsed?.places ?? parsed?.venues ?? (Array.isArray(parsed) ? parsed : [parsed]);
            for (const p of Array.isArray(places) ? places : []) {
              if (!p || typeof p !== "object") continue;
              results.push({
                name: p.name ?? "Место",
                description: p.categories?.[0]?.name ?? p.description,
                address: p.location?.formatted_address ?? p.location?.address ?? p.address,
                rating: p.rating ? String(p.rating) : undefined,
              });
            }
          } catch {
            results.push({ name: "Результат", description: text.slice(0, 200) });
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}
