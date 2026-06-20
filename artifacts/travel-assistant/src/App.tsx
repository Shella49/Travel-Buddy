import React, { useState, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSendMessage, useGetChatHistory, useClearChatHistory, getGetChatHistoryQueryKey } from "@workspace/api-client-react";
import type { ChatMessage, McpLogEntry } from "@workspace/api-client-react/src/generated/api.schemas";
import { Send, Trash2, Plane, Sparkles, AlertCircle, Play, Plug, CheckCircle2, ChevronRight, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function ChatInterface() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<McpLogEntry[]>([]);
  
  const queryClient = useQueryClient();
  const { data: initialHistory, isLoading: isLoadingHistory } = useGetChatHistory({ sessionId });
  const sendMessage = useSendMessage();
  const clearHistory = useClearChatHistory();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialHistory) {
      setMessages(initialHistory);
      // Extract logs from history
      const allLogs = initialHistory.flatMap(m => m.mcpLogs || []);
      if (allLogs.length > 0) {
        setLogs(allLogs);
      }
    }
  }, [initialHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSend = () => {
    if (!input.trim() || sendMessage.isPending) return;
    
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    
    sendMessage.mutate({ data: { message: userMsg.content, sessionId } }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, data.message]);
        if (data.mcpLogs && data.mcpLogs.length > 0) {
          setLogs(prev => [...prev, ...data.mcpLogs]);
        }
      }
    });
  };

  const handleClear = () => {
    clearHistory.mutate({ params: { sessionId } }, {
      onSuccess: () => {
        setMessages([]);
        setLogs([]);
        queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey({ sessionId }) });
      }
    });
  };

  const suggestedPrompts = [
    "Найди билет из Berlin в Rome на следующую пятницу",
    "Найди недорогой отель в Prague на выходные",
    "Подбери поездку в Barcelona на 3 дня",
    "Что посмотреть в Vienna?"
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex-none h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm z-10 relative">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
            <Plane className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">✈️ Travel Assistant AI</h1>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleClear}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Очистить чат
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Chat */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border relative">
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {messages.length === 0 && !isLoadingHistory ? (
              <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-lg mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary to-accent/80 flex items-center justify-center mb-6 shadow-xl shadow-primary/20">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Куда отправимся?</h2>
                <p className="text-muted-foreground mb-8">Я ваш персональный ИИ-ассистент для путешествий. Помогу найти билеты, отели и спланировать идеальный маршрут.</p>
                
                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
                  {suggestedPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(prompt)}
                      className="text-left px-4 py-3 rounded-xl border border-border bg-card/30 hover:bg-card/80 hover:border-primary/50 transition-all text-sm group"
                    >
                      <span className="text-muted-foreground group-hover:text-foreground transition-colors">{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`flex-none w-8 h-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}>
                      {msg.role === "user" ? <span className="font-semibold text-xs">U</span> : <Plane className="w-4 h-4" />}
                    </div>
                    <div className={`px-4 py-3 rounded-2xl ${
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground rounded-tr-sm" 
                        : "bg-card border border-border text-card-foreground rounded-tl-sm shadow-sm"
                    }`}>
                      {msg.role === "user" ? (
                        <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            {sendMessage.isPending && (
              <div className="flex justify-start animate-in fade-in">
                <div className="flex gap-3 max-w-[80%]">
                  <div className="flex-none w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Plane className="w-4 h-4" />
                  </div>
                  <div className="px-4 py-4 rounded-2xl bg-card border border-border text-card-foreground rounded-tl-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce"></span>
                    <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                    <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0.4s" }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-background">
            <div className="max-w-4xl mx-auto relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-accent/30 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="relative flex items-center bg-card border border-border rounded-xl overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-primary/50"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Спросите о перелетах, отелях или местах..."
                  className="flex-1 bg-transparent border-none px-4 py-4 focus:outline-none text-sm placeholder:text-muted-foreground"
                  disabled={sendMessage.isPending}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sendMessage.isPending}
                  className="mr-2 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Panel: MCP Logs */}
        <div className="w-80 lg:w-96 flex-none bg-[#0a0f1c] flex flex-col border-l border-border hidden md:flex">
          <div className="flex-none p-4 border-b border-border/50 flex items-center justify-between bg-card/30">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TerminalSquare className="w-4 h-4" />
              MCP Activity
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Live</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 mcp-log-panel font-mono text-[11px] leading-relaxed space-y-3">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground/50 italic">
                Ожидание MCP вызовов...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-none">
                      {log.type === "connect" && <Plug className="w-3.5 h-3.5 text-green-500" />}
                      {log.type === "init" && <Play className="w-3.5 h-3.5 text-blue-500" />}
                      {log.type === "tool_call" && <ChevronRight className="w-3.5 h-3.5 text-purple-500" />}
                      {log.type === "tool_args" && <div className="w-3.5 h-3.5 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-500" /></div>}
                      {log.type === "tool_response" && <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />}
                      {log.type === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                      {log.type === "info" && <div className="w-3.5 h-3.5 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500" /></div>}
                    </div>
                    <div className="flex-1 min-w-0 break-words">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-muted-foreground/40">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-secondary text-secondary-foreground border border-border/50 uppercase tracking-wider">
                          {log.service}
                        </span>
                      </div>
                      <div className={`
                        ${log.type === "error" ? "text-red-400" : ""}
                        ${log.type === "tool_call" ? "text-purple-300 font-semibold" : ""}
                        ${log.type === "tool_response" ? "text-teal-400/80" : ""}
                        ${log.type === "tool_args" ? "text-gray-400" : ""}
                        ${(log.type === "connect" || log.type === "init" || log.type === "info") ? "text-blue-300/80" : ""}
                      `}>
                        {log.content}
                      </div>
                      {log.data && (
                        <pre className="mt-1.5 p-2 rounded bg-black/40 border border-white/5 text-muted-foreground overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatInterface} />
      <Route>
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
          404 Not Found
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") || ""}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
