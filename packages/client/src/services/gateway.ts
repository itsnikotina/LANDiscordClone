export enum GatewayOpcode {
  IDENTIFY = 0,
  HEARTBEAT = 1,
  JOIN_VOICE = 2,
  LEAVE_VOICE = 3,
  VOICE_SIGNAL = 4,
  UPDATE_PRESENCE = 5,
  START_STREAM = 6,
  STOP_STREAM = 7,
  HELLO = 10,
  READY = 11,
  GUILD_CREATE = 12,
  MESSAGE_CREATE = 13,
  VOICE_STATE_UPDATE = 14,
  VOICE_PEER_SIGNAL = 15,
  PRESENCE_UPDATE = 16,
  STREAM_START = 17,
  HEARTBEAT_ACK = 18,
  VOICE_JOINED = 19,
  VOICE_LEFT = 20,
  MESSAGE_UPDATE = 21,
  MESSAGE_DELETE = 22,
  GUILD_MEMBER_ADD = 23,
  CHANNEL_CREATE = 24,
  ERROR = 99
}

class GatewayService {
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private sessionId = '';
  private handlers = new Map<number, Array<(data: any) => void>>();
  private reconnectAttempts = 0;
  private currentUrl = '';
  private currentToken = '';

  private intentionalDisconnect = false;

  connect(wsUrl: string, token: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    this.intentionalDisconnect = false;
    this.currentUrl = wsUrl;
    this.currentToken = token;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this.cleanup();
      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error('Gateway WebSocket error:', err);
      // Let onclose handle reconnect
    };
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.cleanup();
    if (this.ws) {
      const socket = this.ws;
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.CONNECTING) {
        // Closing while CONNECTING logs a noisy browser warning (happens under StrictMode's double-effect) - wait for it to open first.
        socket.onopen = () => socket.close();
      } else {
        socket.close();
      }
      this.ws = null;
    }
  }

  send(opcode: number, data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: opcode, d: data }));
    }
  }

  on(opcode: number, handler: (data: any) => void): () => void {
    const existing = this.handlers.get(opcode) || [];
    this.handlers.set(opcode, [...existing, handler]);
    
    return () => this.off(opcode, handler);
  }

  off(opcode: number, handler: (data: any) => void): void {
    const current = this.handlers.get(opcode) || [];
    this.handlers.set(opcode, current.filter(h => h !== handler));
  }

  private handleMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw);
      const { op, d, s } = payload;
      
      if (s !== undefined) {
        this.seq = s;
      }

      if (op === GatewayOpcode.HELLO) {
        this.startHeartbeat(d.heartbeatInterval);
        this.send(GatewayOpcode.IDENTIFY, { token: this.currentToken });
      } else if (op === GatewayOpcode.READY) {
        this.sessionId = d.sessionId;
      }

      const h = this.handlers.get(op);
      if (h) {
        h.forEach(fn => fn(d));
      }
    } catch (e) {
      console.error('Failed to parse gateway message', e);
    }
  }

  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.send(GatewayOpcode.HEARTBEAT, this.seq);
    }, interval);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    console.log(`Reconnecting to gateway in ${delay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.currentUrl, this.currentToken);
    }, delay);
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export const gateway = new GatewayService();
