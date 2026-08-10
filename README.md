# Discord P2P

> Clone open-source do Discord otimizado para redes P2P (Radmin VPN, Tailscale, ZeroTier, LAN). Voz full-duplex com detecção de voz, chat de texto persistente, compartilhamento de tela com preview ao vivo, e tudo funciona sem infraestrutura externa — 100% P2P direto entre amigos. Windows e Linux.

## 🏗️ Arquitetura

```
Qualquer rede compartilhada (Radmin VPN, Tailscale, ZeroTier, ou LAN)
├── Base Server (IP do host nessa rede)  ← Node.js + SQLite + WebSocket Signaling
│   ├── REST API (porta 3001) — usuários, canais, mensagens, uploads
│   └── WebSocket Gateway (porta 3002) — sinalização WebRTC, presença, streaming
└── Peers (demais clientes nessa rede)
    └── WebRTC P2P mesh — áudio/vídeo/tela direto entre peers (não passa pelo servidor)
```

**Servidor = sinalizador apenas.** Áudio, vídeo e tela viajam P2P direto entre peers com latência mínima. Acesso controlado por senha de servidor + JWT (não por IP), então qualquer combinação de Windows/Linux e qualquer VPN/LAN funciona desde que todos alcancem o IP do host.

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

**Amigos não precisam editar nenhum arquivo.** Na primeira vez que o cliente abre, ele
pede o IP do host numa telinha e salva isso localmente (sem precisar de `.env`, sem
rebuild). Pra trocar o servidor depois, tem um link "Trocar servidor" na tela de
login.

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

### Client (`packages/client/.env`) — opcional
O cliente pergunta o IP do servidor na primeira tela e salva localmente
(`localStorage`), então isso normalmente não é necessário. Só use `.env` se
quiser pular a telinha de configuração (ex: build fixo pra sua própria máquina host):
```env
VITE_API_URL=http://<ip-do-host>:3001   # IP do host na rede compartilhada
VITE_WS_URL=ws://<ip-do-host>:3002
```

## 🎬 Usando Compartilhamento de Tela

1. **Entrar num canal de voz** — clique numa sala de voz na sidebar (auto-conecta)
2. **Abrir o picker de tela** — clique no botão de monitor (🖥️) na barra de chamada
3. **Escolher o que compartilhar**:
   - **Telas**: monitores inteiros (útil para apresentações)
   - **Janelas**: app específico (navegador, IDE, etc.)
4. **Preview ao vivo**: seus amigos veem a tela/janela em tile pequeno
5. **Modo Foco**: clique no tile de quem está compartilhando para preencher a tela com fit 100% (não corta, redimensiona pra caber inteiro)
6. **Parar**: clique no botão de monitor novamente ou no X do modo foco

> **Nota**: quando você foca em sua própria tela, o áudio fica mudo (evita feedback bizarro de capturar sua própria tela sendo reproduzida). Seus amigos continuam ouvindo o áudio normalmente.

## 🎙️ Usando Voz

- **Mutar/desmutar**: botão de microfone (🎤) na barra de chamada ou na sidebar
- **Indicador de voz**: quando você fala, o tile fica com outline verde e o avatar na sidebar fica com ring verde
- **Múltiplas pessoas**: grid automático se adapta (1 pessoa = tela inteira, 2 = lado-a-lado, 3-4 = 2x2, etc.)
- **Sair**: clique no X vermelho (☎️) na barra de chamada

## 💬 Usando Chat

- **Digitar**: selecione um canal de texto e digite
- **Upload**: arraste imagens/vídeos pra dentro do chat (máx 20MB)
- **Editar/deletar**: hover em cima de mensagem pra ver opções
- **Histórico**: reabre um canal e o histórico já está lá (sincronizado com SQLite)

## 🔍 Troubleshooting

**"Não ouço nada"**
- Microfone está muteado? Clique no botão de mute pra desmutar
- Fone/alto-falante conectado? Selecione na ⚙️ (áudio settings na sidebar)
- Amigo está deafinado? Ele ouve, mas não consegue falar

**"Meu amigo não me ouve"**
- Seu microfone está muteado? (desmutar)
- Seu microfone está capturando som? (teste em outro app, tipo Discord real)
- Você está realmente na call? (tira print pra conferir)
- Reinicia a conexão: sai do canal de voz e entra de novo

**"A tela dele está travada / congelada"**
- WebRTC precisa de conexão direta — se você está em VPN, confirma que o VPN tá conectado dos dois lados
- Tira um print da tela dele pra confirmar que tá compartilhando e não só parado
- Reinicia: ele para de compartilhar e compartilha de novo

**"Como mudo só o áudio de quem está compartilhando?"**
- Não tem controle individual de volume por peer ainda (roadmap)
- Workaround: ajusta o volume geral do SO pra esse app

## 🏗️ Arquitetura Detalhada

### Backend (Node.js + SQLite)

**REST API** (porta 3001):
- `POST /auth/register` — criar usuário com nome + cor avatar
- `POST /auth/login` — retorna JWT + user info
- `GET /guilds` — listar servidores
- `POST /guilds` — criar novo servidor
- `POST /guilds/:id/join` — entrar num servidor
- `POST /guilds/:id/channels` — criar canal
- `GET /channels/:id/messages` — histórico de mensagens
- `POST /channels/:id/messages` — enviar mensagem
- `POST /channels/:id/upload` — upload de anexo (imagem/vídeo)
- `PUT /messages/:id` — editar mensagem
- `DELETE /messages/:id` — deletar mensagem

**WebSocket Gateway** (porta 3002, conecta via `/gateway`):
- Sinalização de WebRTC (SDP offer/answer, ICE candidates)
- Broadcast de eventos (mensagens, presença, voice state changes)
- Heartbeat pra manter conexão viva (30s)

### Frontend (React + Vite + Electron)

**Stores (Zustand)**:
- `authStore` — usuário logado, JWT, login/logout
- `guildStore` — servidores, canais, mensagens, members, voice states
- `voiceStore` — estado de chamada (conectado?, quem está lá?, streams)

**Services**:
- `gateway.ts` — WebSocket client com handlers de opcodes
- `webrtc.ts` — WebRTC peer management, áudio, tela, voz detection
- `api.ts` — Axios wrapper pra REST
- `audio.ts` — Audio input/output device enumeration
- `screenshare.ts` — Electron IPC pra captura de tela

**Componentes**:
- `VoiceChannel.tsx` — grid de participantes + foco mode pra tela
- `ScreenShareView.tsx` — renderiza stream de tela/janela
- `ScreenSourcePicker.tsx` — modal de escolha (telas/janelas)
- `MessageList.tsx` → `MessageItem.tsx` — chat com drag-drop uploads
- `ChannelSidebar.tsx` — lista de canais + barra flutuante de call
- `MemberList.tsx` — lista de participantes (Online/Offline)

### Electron

**Main Process** (`electron/main.ts`):
- Cria janela principal (BrowserWindow)
- IPC handlers: `get-screen-sources`, `select-screen-source` (pra picker de tela)
- UDP broadcast listener (auto-discover servers na rede)
- Autoplay policy (sem user gesture required pra áudio)

**Preload** (`electron/preload.ts`):
- Expõe `window.electronAPI` (seguro: não expõe `require` direto)
- APIs: `getScreenSources()`, `selectScreenSource(id)`, `getDiscoveredServers()`

## 🔒 Segurança

- Acesso controlado por senha de servidor (registro) + JWT (tudo mais) — não por faixa de IP, então funciona igual em qualquer VPN ou LAN
- P2P direto entre peers na rede compartilhada; TURN relay embutido no servidor só entra como fallback quando dois peers não têm rota direta entre si (veja seção Networking)
- Senhas com bcryptjs (salt rounds: 10)
- JWT com expiração de 7 dias
- ⚠️ O TURN relay usa a dependência `node-turn` (sem manutenção há anos, com CVEs DoS conhecidos em dependências de log/config que não são exercitadas pelo nosso uso) — aceitável para um servidor privado atrás de senha, mas não exponha esse servidor à internet pública sem rever isso

## 🎤 Features

| Feature | Status | Descrição |
|---------|--------|-----------|
| 💬 Chat de texto | ✅ | Histórico persistido em SQLite, upload de imagens/vídeos |
| 🎙️ Voz P2P | ✅ | WebRTC full-duplex, mesh automático entre peers |
| 🎬 Compartilhamento de tela | ✅ | Monitor inteiro ou janela específica, modo foco com fit 100% |
| 🎵 Detecção de voz (VAD) | ✅ | Outlining verde em tiles quando detecta voz |
| 👥 Canais de voz | ✅ | Múltiplos canais, lista ao vivo de quem está aonde |
| 🏛️ Guilds (servidores) | ✅ | Múltiplos servidores, categorias de canais |
| 📍 Presença em tempo real | ✅ | Online/Offline, indicador ao vivo em tiles |
| 🔐 Cargos e permissões | ✅ | Admin/moderador/membro com controles sobre canais |
| 🚀 Auto-descoberta (UDP broadcast) | ✅ | Modo Electron: lista servidores na rede automaticamente |
| 🔊 Supressão de ruído (RNNoise) | 🔜 | Próxima prioridade |
| 📞 Push-to-Talk | 🔜 | Tecla PTT para ativar/desativar microfone |
| 📹 Câmera/Vídeo | ❌ | Foco em compartilhamento de tela, não em webcam |

## 📡 Protocolo WebSocket

Conexão mantida em `/gateway` após `IDENTIFY` com JWT.

### Client → Server

| Opcode | Evento | Payload |
|--------|--------|---------|
| 0 | IDENTIFY | `{token: string}` |
| 1 | HEARTBEAT | `{}` |
| 2 | JOIN_VOICE | `{channelId: string}` |
| 3 | LEAVE_VOICE | `{}` |
| 4 | VOICE_SIGNAL | `{targetUserId, type: 'offer'\|'answer'\|'candidate', data}` — sinalização WebRTC |
| 5 | UPDATE_PRESENCE | `{status: 'online'\|'offline'}` |
| 6 | START_STREAM | `{}` — iniciar compartilhamento de tela |
| 7 | STOP_STREAM | `{}` — parar compartilhamento |

Além do gateway, `GET /rtc-config` (REST, autenticado) devolve as credenciais do TURN relay embutido do servidor.

### Server → Client

| Opcode | Evento | Payload |
|--------|--------|---------|
| 10 | HELLO | `{heartbeatInterval: number}` |
| 11 | READY | `{user, guilds[], voiceStates[], channels[]}` — sincronização inicial |
| 13 | MESSAGE_CREATE | `{message: {id, content, author, timestamp, attachments[]}}` |
| 14 | VOICE_STATE_UPDATE | `{voiceState: {userId, channelId, guildId, muted, streaming}}` |
| 15 | VOICE_PEER_SIGNAL | `{fromUserId, type, data}` — sinalização WebRTC relayada |
| 16 | PRESENCE_UPDATE | `{userId, status: 'online'\|'offline'}` |
| 18 | HEARTBEAT_ACK | `{}` |
| 19 | VOICE_JOINED | `{peers: [{userId, username, avatarColor}]}` — quem já estava no canal |
| 20 | VOICE_LEFT | `{userId}` — alguém saiu |
| 21 | MESSAGE_UPDATE | `{message}` — mensagem foi editada |
| 22 | MESSAGE_DELETE | `{messageId}` — mensagem foi deletada |
| 23 | GUILD_MEMBER_ADD | `{member: {userId, username, avatarColor}}` — novo member no servidor |
| 24 | CHANNEL_CREATE | `{channel: {id, name, type, categoryId}}` — novo canal |
| 99 | ERROR | `{code: number, message: string}` — erro genérico

## 🌐 Networking & Performance

**P2P direto por padrão** entre peers na mesma rede compartilhada (Radmin VPN, Tailscale, ZeroTier, ou LAN) — a mídia nunca passa pelo servidor nesse caso. Isso significa:
- ✅ **Latência ultra-baixa** (10-50ms típico em VPN, <5ms em LAN)
- ✅ **Privacidade**: nada passa por servidores externos, só sinalização pelo seu servidor
- ⚠️ **Requer rota direta**: dois peers em VPNs diferentes (ex: um no Tailscale, outro no Radmin) não têm caminho de rede um até o outro

**TURN relay embutido (fallback automático)**: o servidor roda um relay TURN/STUN próprio (porta `3478` UDP/TCP + faixa `49152-49172` pros dados relayados, ambas configuráveis via `.env`). Quando o WebRTC detecta que dois peers não conseguem se conectar direto (exatamente o caso de VPNs diferentes), ele automaticamente troca pra rotear a mídia através do seu host, sem precisar fazer nada manual. Se o host estiver atrás de firewall, libere essas portas (UDP e TCP) pra esse fallback funcionar - sem isso, esses dois peers específicos simplesmente não conseguem se ouvir/ver, mas o resto do app continua normal.

**Recomendações**:
- **LAN local** (mesma rede WiFi): melhor latência, sem VPN needed
- **Radmin VPN**: suportado, boa latência, configuração simples (mas assinatura paga)
- **Tailscale**: grátis, muito usado, funciona igual bem
- **ZeroTier**: grátis + open-source, mais complexo de setup inicial
- **Qualquer combinação**: Windows + Linux, VPN + LAN, tudo funciona junto — e se dois amigos estiverem em redes diferentes sem rota comum, o TURN relay do host cobre isso automaticamente (com uma perninha a mais de latência, já que a mídia passa pelo host em vez de ir direto)

**Limites testados**:
- 4+ pessoas em call simultânea: funciona smooth (audio + screen share)
- Chat com 1000+ mensagens no histórico: carrega em <1s
- Upload de imagem/vídeo até 20MB: completo em <10s (depende de bandwidth local)

## 🔧 Desenvolvimento

### Build production
```bash
# Cliente
cd packages/client
npm run build          # Vite → dist/
npm run build:electron # Electron → dist-electron/
npm run electron:build # Empacota pra .exe/.deb/.AppImage

# Servidor
cd packages/server
npm run build          # tsc → dist/
```

### Debug
- **Cliente**: abra DevTools (Ctrl+Shift+I no Electron)
- **Servidor**: logs em stdout; ou inspeciona `/data/discord-p2p.db` direto com SQLite tools
- **WebRTC**: vê `chrome://webrtc-internals` no Chromium/Electron pra stats de conexão

## 🤝 Contribuindo

Pull requests são bem-vindos! Antes de commitar, rode:
```bash
npm run build  # verifica type errors + build success
```

## 📄 Licença

MIT

