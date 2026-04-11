export interface RequestRecord {
  id: string;
  timestamp: Date;
  model: string;
  provider: string | null;
  routed_model: string | null;
  raw_request: string;
  raw_response: string;
  messages_json: string | null;
  system_json: string | null;
  tools_json: string | null;
  max_tokens: number | null;
  temperature: number | null;
  thinking_json: string | null;
  response_content: string | null;
  stop_reason: string | null;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  client_ip: string | null;
  error: string | null;
}

export interface Statistics {
  total_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  model_breakdown: Record<string, number>;
  provider_breakdown: Record<string, number>;
  daily_requests: DailyStat[];
}

export interface DailyStat {
  date: string;
  requests: number;
  tokens: number;
}

export interface AnthropicRequest {
  model: string;
  messages: Message[];
  max_tokens: number;
  system?: string | SystemBlock[];
  tools?: Tool[];
  tool_choice?: any;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  thinking?: ThinkingConfig;
  stream?: boolean;
  metadata?: { user_id?: string };
}

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  source?: { type: string; media_type: string; data: string };
  tool_use_id?: string;
  name?: string;
  input?: any;
  content?: string | ContentBlock[];
  thinking?: string;
}

export interface SystemBlock {
  type: 'text' | 'text_prompt';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface Tool {
  name: string;
  description: string;
  input_schema: any;
}

export interface ThinkingConfig {
  type: string;
  budget_tokens: number;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export interface StreamEvent {
  type: string;
  index?: number;
  delta?: any;
  message?: {
    id: string;
    type: string;
    role: string;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };
  content_block?: ContentBlock;
  usage?: { input_tokens: number; output_tokens: number };
}
