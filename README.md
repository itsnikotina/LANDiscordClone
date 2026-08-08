# Discord P2P

> Clone open-source do Discord otimizado para redes P2P. Voz full-duplex, chat persistente, compartilhamento de tela — tudo sem infraestrutura externa. Funciona sobre qualquer VPN (Radmin, Tailscale, ZeroTier) ou até uma rede local comum — o app não depende de nenhuma delas especificamente, só precisa que os clientes consigam alcançar o IP do servidor. Roda em Windows e Linux.

## 🏗️ Arquitetura

```
Qualquer rede compartilhada (Radmin VPN, Tailscale, ZeroTier, ou LAN)
├── Base Server (IP do host nessa rede)  ← Node.js + SQLite + WebSocket Signaling
│   ├── REST API (porta 3001)
│   └── WebSocket Gateway (porta 3002)
└── Peers (demais IPs dessa mesma rede)
    └── WebRTC P2P mesh (voz/vídeo/tela direto entre peers)
```

**Voz e vídeo nunca passam pelo servidor** — apenas sinalização SDP/ICE. Latência mínima. O acesso é controlado por senha de servidor + JWT, não por qual VPN você usa — então qualquer combinação de Windows/Linux e Radmin/Tailscale/ZeroTier/LAN funciona, desde que todo mundo consiga alcançar o IP do host.

## 🚀 Início Rápido

### Pré-requisitos
- Node.js 20+
- npm 9+
- Alguma rede compartilhada com os amigos (Radmin VPN, Tailscale, ZeroTier, ou a mesma LAN)

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar o servidor
```bash
cd packages/server
cp .env.example .env
# Edite .env: defina SERVER_PASSWORD
```

### 3. Iniciar servidor (na máquina host)
```bash
npm run dev:server
```

### 4. Iniciar cliente (em cada máquina)
```bash
npm run dev:client
```

Ou iniciar tudo junto:
```bash
npm run dev
```

**Windows:** use `server.bat` / `client.bat`.
**Linux/Mac:** use `./server.sh` / `./client.sh` (rode `chmod +x server.sh client.sh` uma vez antes).

## 📁 Estrutura

```
discord-p2p/
├── packages/
│   ├── server/          # Node.js + TypeScript backend
│   │   └── src/
│   │       ├── index.ts          # Entry point
│   │       ├── config.ts         # Configuração
│   │       ├── database/         # SQLite schema + helpers
│   │       ├── auth/             # JWT + rotas de auth
│   │       ├── gateway/          # WebSocket gateway + signaling
│   │       ├── api/              # REST API (guilds, channels, messages)
│   │       └── middleware/       # Auth middleware
│   └── client/          # Electron + React frontend
│       ├── electron/             # Main process + preload
│       └── src/
│           ├── services/         # WebRTC, Gateway WS, API, Audio
│           ├── store/            # Zustand state stores
│           ├── components/       # UI components (Discord dark theme)
│           ├── pages/            # Login, Guild, Voice pages
│           └── styles/           # CSS design system
└── package.json         # Monorepo root
```

## ⚙️ Variáveis de Ambiente

### Server (`packages/server/.env`)
```env
PORT=3001
WS_PORT=3002
JWT_SECRET=<segredo-jwt-forte>
SERVER_PASSWORD=<senha-do-servidor>   # Todos os amigos precisam desta senha para entrar
DB_PATH=./data/discord-p2p.db
UPLOADS_DIR=./uploads
```

### Client (`packages/client/.env`)
```env
VITE_API_URL=http://<ip-do-host>:3001   # IP do host na rede compartilhada (Radmin/Tailscale/ZeroTier/LAN)
VITE_WS_URL=ws://<ip-do-host>:3002
```

## 🔒 Segurança

- Acesso controlado por senha de servidor (registro) + JWT (tudo mais) — não por faixa de IP, então funciona igual em qualquer VPN ou LAN
- Sem STUN/TURN externos — 100% direto entre peers na rede compartilhada
- Senhas com bcryptjs (salt rounds: 10)
- JWT com expiração de 7 dias

## 🎤 Features

| Feature | Status |
|---------|--------|
| Chat de texto com histórico | ✅ |
| Canais de voz P2P | ✅ |
| Compartilhamento de tela | ✅ |
| Detecção de voz (VAD) | ✅ |
| Indicador visual de quem fala | ✅ |
| Cargos e permissões | ✅ |
| Múltiplos servidores/guilds | ✅ |
| Presença em tempo real | ✅ |
| Push-to-Talk | 🔜 |
| Supressão de ruído (RNNoise) | 🔜 |

## 📡 Protocolo WebSocket

| Opcode | Direção | Evento |
|--------|---------|--------|
| 0 | C→S | IDENTIFY (auth) |
| 1 | C→S | HEARTBEAT |
| 2 | C→S | JOIN_VOICE |
| 3 | C→S | LEAVE_VOICE |
| 4 | C→S | VOICE_SIGNAL (relay SDP/ICE) |
| 5 | C→S | UPDATE_PRESENCE |
| 10 | S→C | HELLO (heartbeat interval) |
| 11 | S→C | READY (user + guilds) |
| 14 | S→C | VOICE_STATE_UPDATE |
| 15 | S→C | VOICE_PEER_SIGNAL (relay) |
| 19 | S→C | VOICE_JOINED (peers list) |
| 20 | S→C | VOICE_LEFT |
| 21 | S→C | MESSAGE_UPDATE |
| 22 | S→C | MESSAGE_DELETE |

## 🤝 Contribuindo

Pull requests são bem-vindos!

## 📄 Licença

MIT
