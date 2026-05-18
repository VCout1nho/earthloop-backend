# 🌍 EarthLoop — Backend API

API REST do projeto EarthLoop, construída com Node.js e Express. Responsável por autenticação de usuários, abertura de tickets de suporte, insights de IA e busca de pontos de reciclagem no mapa.

---

## 🚀 Tecnologias

| Tecnologia | Uso |
|---|---|
| Node.js + Express | Servidor e rotas HTTP |
| MongoDB + Mongoose | Banco de dados |
| bcrypt | Hash de senhas |
| JSON Web Token (JWT) | Autenticação stateless |
| OpenAI API | Geração de insights com IA |
| Resend | Envio de emails transacionais |
| Axios | Requisições HTTP externas |
| Overpass API | Busca de locais no mapa (OpenStreetMap) |

---

## 📁 Estrutura

```
earthloop-backend/
├── models/
│   ├── User.js         # Schema do usuário
│   └── Ticket.js       # Schema de tickets de suporte
├── utils/
│   └── sendEmail.js    # Utilitário de email
├── server.js           # Ponto de entrada da API
├── .env                # Variáveis de ambiente (não versionar)
└── package.json
```

---

## ⚙️ Configuração

### 1. Instale as dependências

```bash
npm install
```

### 2. Crie o arquivo `.env` na raiz do projeto

```env
MONGO_URI=mongodb+srv://<usuario>:<senha>@cluster.mongodb.net/earthloop
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
EMAIL_USER=seu@email.com
JWT_SECRET=seu_segredo_super_seguro
PORT=5000
```

> ⚠️ Nunca suba o `.env` para o repositório. Ele já está no `.gitignore`.

### 3. Inicie o servidor

```bash
# Desenvolvimento
node server.js

# Com hot-reload (recomendado)
npx nodemon server.js
```

O servidor estará disponível em `http://localhost:5000`.

---

## 📡 Rotas da API

### 🔐 Autenticação

#### `POST /api/register`
Cadastra um novo usuário.

**Body:**
```json
{
  "nome": "João Silva",
  "email": "joao@exemplo.com",
  "senha": "minhasenha123"
}
```

**Respostas:**
| Status | Descrição |
|---|---|
| `201` | Usuário criado com sucesso |
| `400` | Email já cadastrado |
| `500` | Erro no servidor |

---

#### `POST /api/login`
Autentica um usuário e retorna um token JWT.

**Body:**
```json
{
  "email": "joao@exemplo.com",
  "senha": "minhasenha123"
}
```

**Resposta de sucesso:**
```json
{
  "message": "Login realizado com sucesso!",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "...",
    "email": "joao@exemplo.com",
    "tipo": "user"
  }
}
```

| Status | Descrição |
|---|---|
| `200` | Login realizado, token retornado |
| `400` | Usuário não encontrado ou senha inválida |
| `500` | Erro no servidor |

---

### 📊 Dashboard

#### `GET /api/dashboard`
Retorna dados estáticos de crescimento de usuários e estatísticas gerais.

**Resposta:**
```json
{
  "usuarios": [
    { "name": "Jan", "usuarios": 400 },
    ...
  ],
  "stats": {
    "totalUsers": 1200,
    "growth": 23,
    "active": 890
  }
}
```

---

### 🤖 IA

#### `GET /api/ai-insights`
Gera uma análise de crescimento usando a OpenAI (GPT-4.1-mini). Em caso de falha, retorna um fallback automático.

**Resposta:**
```json
{
  "insight": "Crescimento consistente após fevereiro..."
}
```

---

### 📩 Suporte

#### `POST /api/contato`
Cria um ticket de suporte no banco e envia emails de confirmação ao cliente e à equipe.

**Body:**
```json
{
  "nome": "Maria",
  "email": "maria@exemplo.com",
  "assunto": "Dúvida sobre reciclagem",
  "mensagem": "Como funciona o ponto de coleta?"
}
```

| Status | Descrição |
|---|---|
| `200` | Ticket criado e emails enviados |
| `500` | Erro ao processar contato |

---

### 🗺️ Mapa

#### `GET /api/places?data=<query>`
Proxy para a [Overpass API](https://overpass-api.de), usada para buscar pontos de reciclagem via OpenStreetMap.

**Exemplo de query:**
```
GET /api/places?data=[out:json];node[amenity=recycling](around:5000,-19.73,-43.98);out;
```

| Status | Descrição |
|---|---|
| `200` | Dados retornados do Overpass |
| `500` | Erro ao buscar locais |

---

## 🧪 Testes

Os testes unitários cobrem todas as rotas com mocks completos das dependências externas.

```bash
# Instale as dependências de teste
npm install --save-dev jest supertest

# Rode os testes
npm test

# Com relatório de cobertura
npx jest --coverage
```

---

## 🚢 Deploy

O backend está configurado para deploy no **Render**. As variáveis de ambiente devem ser cadastradas no painel do Render em *Environment → Environment Variables*.

A variável `MONGO_URI` deve apontar para um cluster no **MongoDB Atlas**.

---


