# Plataforma ATER — Guia de Setup

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)

---

## 1. Banco de Dados (Supabase)

1. Crie um novo projeto no Supabase
2. Vá em **SQL Editor** e execute o arquivo:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. Vá em **Storage** → crie um bucket chamado `media` com acesso público

---

## 2. Variáveis de Ambiente

Copie `.env.local.example` para `.env.local`:

```bash
cp .env.local.example .env.local
```

Preencha com os valores do seu projeto Supabase (Settings → API):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## 3. Instalar e Rodar

```bash
npm install
npm run dev
```

Acesse: http://localhost:3000

---

## 4. Primeiro Acesso

1. Abra `/register`
2. Preencha seu nome, nome da organização, e-mail e senha
3. O sistema cria automaticamente um **Workspace** para você (via trigger no Supabase)
4. Você é direcionado ao Dashboard

---

## 5. Instalar como PWA (Mobile)

### Android (Chrome):
1. Abra o app no Chrome
2. Menu → "Adicionar à tela inicial"

### iOS (Safari):
1. Abra o app no Safari
2. Compartilhar → "Adicionar à Tela de Início"

---

## Estrutura do Projeto

```
app/
├── (auth)/login        → Tela de login
├── (auth)/register     → Cadastro + criação de workspace
├── (app)/dashboard     → Dashboard com stats
├── (app)/producers     → CRUD de produtores
├── (app)/visits        → Visitas de campo (offline-first)
└── (app)/forms         → Form builder dinâmico

lib/
├── supabase/           → Clientes Supabase (browser + server)
├── db/dexie.ts         → Schema IndexedDB local
└── sync/sync-engine.ts → Push offline → Supabase

stores/                 → Zustand (auth, sync, visit)
types/index.ts          → Tipos TypeScript globais
supabase/migrations/    → SQL do schema completo
```

---

## Fluxo Offline

1. Toda escrita vai ao **IndexedDB** (Dexie) + adiciona à `sync_queue`
2. Quando o dispositivo volta online → sync automático com Supabase
3. Indicador visual no topo: **Offline / Sincronizando / Sincronizado**

---

## Módulos Implementados (MVP)

- [x] Auth com multi-tenant (workspace por organização)
- [x] Produtores e Propriedades (CRUD + offline)
- [x] Visitas de Campo (GPS, registros agronômicos, fotos)
- [x] Form Builder dinâmico (7 tipos de campo)
- [x] Aplicação de formulários durante visita
- [x] Sync engine offline → Supabase
- [x] Dashboard com stats
- [x] PWA (instalável no celular)
- [x] RLS no Supabase (isolamento por workspace)

## Próximas Fases

- [ ] Geração de PDF do relatório de visita
- [ ] Recomendações técnicas com templates
- [ ] Gravação de áudio durante visita
- [ ] Mapa Leaflet com propriedades
- [ ] Exportação de dados (CSV)
