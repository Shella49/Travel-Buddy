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

      this.log("info", "Kiwi MCP: сессия без явного ID, продолжаем без sessionId");
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
    dateTo?: string,
  ): Promise<KiwiFlightResult[]> {
    this.log("tool_call", `Вызов search-flight: ${from} → ${to}, дата: ${dateFrom}`);
    const args = {
      flyFrom: from,
      flyTo: to,
      departureDate: dateFrom,
      ...(dateTo && dateTo !== dateFrom ? { returnDate: dateTo } : {}),
      passengers: { adults: 1, children: 0, infants: 0 },
      curr: "EUR",
      locale: "ru",
      sort: "price",
    };
    this.log("tool_args", "Аргументы запроса", args);

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
      this.log("tool_response", "Ответ от Kiwi MCP получен", { status: response.status, preview: text.slice(0, 300) });

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

      return this.parseFlightResults(data);
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
            const flights = parsed?.data?.flights ?? parsed?.itineraries ?? parsed?.flights ?? [parsed];
            for (const f of Array.isArray(flights) ? flights : []) {
              results.push({
                route: `${f.cityFrom ?? f.from ?? "?"} → ${f.cityTo ?? f.to ?? "?"}`,
                date: f.local_departure ?? f.departure ?? f.date ?? "?",
                airline: f.airlines?.[0] ?? f.airline ?? "?",
                price: f.price ? `${f.price} ${f.currency ?? "EUR"}` : "Уточните на сайте",
                link: f.deep_link ?? f.link,
                raw: f,
              });
            }
          } catch {
            results.push({
              route: "Результат",
              date: "?",
              airline: "?",
              price: text.substring(0, 200),
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

export class TrivagoMcpClient {
  private baseUrl = "https://mcp.trivago.com/mcp";
  private logs: McpLogEntry[] = [];

  getLogs(): McpLogEntry[] {
    return [...this.logs];
  }

  private log(type: McpLogType, content: string, data?: object | null) {
    const entry = makeLog(type, "Trivago", content, data);
    this.logs.push(entry);
    logger.info({ mcpLog: entry }, "Trivago MCP");
  }

  async searchHotels(cityEn: string, checkIn: string, checkOut: string): Promise<TrivagoHotelResult[]> {
    this.logs = [];
    this.log("connect", `Подключение к Trivago MCP: ${this.baseUrl}`);

    // Step 1: search suggestions
    this.log("tool_call", `trivago-search-suggestions: запрос "${cityEn}"`);
    this.log("tool_args", "Аргументы запроса", { query: cityEn });

    let locationId: string | null = null;
    let ns: string | null = null;

    try {
      const sugResp = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "trivago-search-suggestions", arguments: { query: cityEn } },
          id: 1,
        }),
      });

      const sugText = await sugResp.text();
      this.log("tool_response", "Ответ trivago-search-suggestions получен", { status: sugResp.status });

      let sugData: unknown;
      try {
        sugData = JSON.parse(sugText);
      } catch {
        const lines = sugText.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try { sugData = JSON.parse(line.replace("data:", "").trim()); break; } catch { /* continue */ }
        }
      }

      const sugResult = (sugData as Record<string, unknown>)?.result;
      const sugContent = (sugResult as Record<string, unknown>)?.content;
      const sugItems = Array.isArray(sugContent) ? sugContent : [];
      for (const item of sugItems) {
        const text = (item as Record<string, unknown>)?.text;
        if (typeof text === "string") {
          try {
            const parsed = JSON.parse(text);
            const sug = parsed?.suggestions?.[0] ?? parsed?.[0] ?? parsed;
            if (sug?.id) { locationId = String(sug.id); ns = String(sug.ns ?? sug.namespace ?? ""); break; }
          } catch { /* continue */ }
        }
      }

      if (!locationId) {
        this.log("error", "Не удалось получить location ID от Trivago");
        return [];
      }

      this.log("info", `Получен location ID: ${locationId}, ns: ${ns}`);
    } catch (err) {
      this.log("error", `Ошибка trivago-search-suggestions: ${String(err)}`);
      return [];
    }

    // Step 2: accommodation search
    this.log("tool_call", `trivago-accommodation-search: id=${locationId}, ns=${ns}`);
    const accomArgs = {
      id: locationId,
      ns,
      check_in: checkIn,
      check_out: checkOut,
      adults: 2,
      limit: 5,
    };
    this.log("tool_args", "Аргументы запроса", accomArgs);

    try {
      const accomResp = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "trivago-accommodation-search", arguments: accomArgs },
          id: 2,
        }),
      });

      const accomText = await accomResp.text();
      this.log("tool_response", "Ответ trivago-accommodation-search получен", { status: accomResp.status });

      let accomData: unknown;
      try {
        accomData = JSON.parse(accomText);
      } catch {
        const lines = accomText.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try { accomData = JSON.parse(line.replace("data:", "").trim()); break; } catch { /* continue */ }
        }
      }

      return this.parseHotelResults(accomData);
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
        const text = (item as Record<string, unknown>)?.text;
        if (typeof text === "string") {
          try {
            const parsed = JSON.parse(text);
            const hotels = parsed?.accommodations ?? parsed?.hotels ?? parsed?.results ?? [parsed];
            for (const h of Array.isArray(hotels) ? hotels : []) {
              results.push({
                name: h.name ?? h.hotel_name ?? "Отель",
                rating: h.rating ? String(h.rating) : undefined,
                price: h.price ? `${h.price} ${h.currency ?? "EUR"}` : undefined,
                address: h.address ?? h.location,
                link: h.url ?? h.deep_link ?? h.link,
              });
            }
          } catch {
            results.push({ name: "Результат", price: text.substring(0, 200) });
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}

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
      this.log("tool_response", "Ответ Foursquare MCP получен", { status: resp.status });

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        const lines = text.split("\n").filter((l) => l.startsWith("data:"));
        for (const line of lines) {
          try { data = JSON.parse(line.replace("data:", "").trim()); break; } catch { /* continue */ }
        }
      }

      return this.parsePlaceResults(data);
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
            const places = parsed?.results ?? parsed?.places ?? parsed?.venues ?? [parsed];
            for (const p of Array.isArray(places) ? places : []) {
              results.push({
                name: p.name ?? "Место",
                description: p.categories?.[0]?.name ?? p.description,
                address: p.location?.formatted_address ?? p.location?.address ?? p.address,
                rating: p.rating ? String(p.rating) : undefined,
              });
            }
          } catch {
            results.push({ name: "Результат", description: text.substring(0, 200) });
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}
