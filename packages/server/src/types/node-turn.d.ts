declare module 'node-turn' {
  interface TurnOptions {
    authMech?: 'none' | 'short-term' | 'long-term';
    credentials?: Record<string, string>;
    listeningPort?: number;
    listeningIps?: string[];
    relayIps?: string[];
    minPort?: number;
    maxPort?: number;
    debugLevel?: string;
    realm?: string;
  }

  class Turn {
    constructor(options?: TurnOptions);
    start(): void;
    stop(): void;
    addUser(username: string, password: string): void;
    removeUser(username: string): void;
  }

  export = Turn;
}
