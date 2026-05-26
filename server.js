require("dotenv").config();
require('./keep-alive');

const Ticket = require("./models/Ticket");
const Anuncio = require("./models/Anuncios");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const { Resend } = require("resend");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const resend = new Resend(process.env.RESEND_API_KEY);
const app = express();

app.use(cors());
app.use(express.json());

console.log("🚀 Iniciando EarthLoop API");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/earthloop";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas conectado com sucesso!"))
  .catch(err => {
    console.log("❌ Erro Mongo:", err.message);
    console.log("MONGO_URI configurado?", !!process.env.MONGO_URI);
  });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Middleware de autenticação ───────────────────────────────────────────────
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Token não fornecido" });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "SEGREDO_SUPER_SEGURO");
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

// ─── ESG (Google Custom Search) ───────────────────────────────────────────────
app.post("/api/esg", async (req, res) => {
  try {
    const marca = String(req.body?.marca || "").trim();
    if (!marca) return res.status(400).json({ error: "Campo 'marca' é obrigatório" });

    const apiKey = process.env.GOOGLE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    if (!apiKey || !cseId) {
      return res.status(500).json({
        error: "Variáveis GOOGLE_API_KEY e GOOGLE_CSE_ID não configuradas no servidor",
      });
    }

    const query = `${marca} ESG sustentabilidade impacto ambiental responsabilidade social relatório`;
    const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: {
        key: apiKey,
        cx: cseId,
        q: query,
        num: 5,
        lr: "lang_pt",
      },
      timeout: 10000,
    });

    const items = response.data?.items || [];
    const fontes = items.map((item) => ({
      titulo: item.title,
      descricao: item.snippet,
    }));

    if (fontes.length === 0) {
      return res.json({
        analysis: {
          name: marca,
          resumo: `Não encontrei fontes ESG públicas suficientes no momento para “${marca}”.`,
          why:
            "Nas buscas recentes (Google Custom Search) não apareceu material suficiente e confiável para sustentar uma análise ESG completa. Tente informar o nome oficial da empresa e, se possível, o país (ex.: 'Natura Brasil') ou termos como 'relatório ESG', 'sustentabilidade', 'carbono' ou 'escopo 3'.",
          recomendacoes: [
            "Tente a busca com o nome oficial e país (ex.: 'Natura Brasil')",
            "Verifique se existe relatório anual/ESG ou relatório de sustentabilidade no site oficial",
            "Procure por informações verificáveis sobre metas de carbono e iniciativas sociais/ambientais",
          ],
          sustainability: null,
          carbonEmission: "não encontrado nas fontes",
          popularity: null,
          socialResponsibility: null,
          environmentalResponsibility: null,
        },
      });
    }

    const fontesTexto = fontes
      .slice(0, 5)
      .map((f, idx) => `[${idx + 1}] ${f.titulo}\n${f.descricao || ""}`.trim())
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Você é um analista ESG. Você só pode usar as informações fornecidas nas FONTES. Não invente dados, não crie números nem alegações. Se não houver informação suficiente em FONTES, diga explicitamente que não foi encontrado.",
        },
        {
          role: "user",
          content: `Marca: ${marca}\n\nFONTES (títulos e trechos do Google Custom Search):\n${fontesTexto}\n\nTarefa:\n1) Escreva um RESUMO curto (1 parágrafo) do que as FONTES indicam sobre ESG.\n2) Escreva "POR QUE" com texto estruturado e em português, com estas seções: Ambiental, Social, Governança, Emissões de carbono. Em cada seção, use apenas o que estiver suportado pelas FONTES (se não houver, diga "não encontrado nas fontes").\n3) Escreva RECOMENDAÇÕES (3 itens) do que o usuário deve verificar ao avaliar a marca com base em ESG.\n4) Gere INDICADORES para UI (SE e SOMENTE SE houver suporte nas FONTES sobre metas/relatórios/ratings):\n- sustainability (0-100) ou null\n- environmentalResponsibility (0-100) ou null\n- socialResponsibility (0-100) ou null\n- popularity (0-100) ou null\n- carbonEmission (string curta: o que as FONTES dizem sobre metas/relatórios/indicadores; se não houver, 'não encontrado nas fontes')\n\nSaída: responda APENAS com JSON válido (sem texto extra) com as chaves:\n{\n  "name": string,\n  "resumo": string,\n  "why": string,\n  "recomendacoes": string[],\n  "sustainability": number|null,\n  "carbonEmission": string,\n  "popularity": number|null,\n  "socialResponsibility": number|null,\n  "environmentalResponsibility": number|null\n}`,
        },
      ],
    });

    const content = completion?.choices?.[0]?.message?.content || "{}";
    let analysis = null;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      analysis = {
        name: marca,
        resumo: `Consegui buscar fontes, mas houve um problema ao formatar o resumo estruturado.`,
        why:
          "Tente novamente em alguns instantes. Se o problema persistir, verifique se as variáveis GOOGLE_API_KEY/GOOGLE_CSE_ID e a credencial OPENAI_API_KEY estão corretas no Render.",
        recomendacoes: [
          "Repetir a busca em alguns instantes",
          "Checar variáveis de ambiente no Render",
          "Confirmar que a marca está com o nome oficial e termos ESG",
        ],
        sustainability: null,
        carbonEmission: "não encontrado nas fontes",
        popularity: null,
        socialResponsibility: null,
        environmentalResponsibility: null,
      };
    }

    return res.json({ analysis });
  } catch (error) {
    console.log("Erro ESG:", error.response?.data || error.message);
    return res.status(500).json({ error: "Erro ao consultar ESG na internet" });
  }
});

// ─── DASHBOARD (dados reais do banco) ────────────────────────────────────────
app.get("/api/dashboard", autenticar, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAnuncios = await Anuncio.countDocuments();
    const totalTickets = await Ticket.countDocuments();

    // Usuários por mês (últimos 6 meses)
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const agora = new Date();
    const usuariosPorMes = [];

    for (let i = 5; i >= 0; i--) {
      const inicio = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
      const count = await User.countDocuments({ createdAt: { $gte: inicio, $lt: fim } });
      usuariosPorMes.push({ name: meses[inicio.getMonth()], usuarios: count });
    }

    // Crescimento (comparar mês atual com anterior)
    const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const usersEsseMes = await User.countDocuments({ createdAt: { $gte: inicioMesAtual } });
    const usersMesAnterior = await User.countDocuments({ createdAt: { $gte: inicioMesAnterior, $lt: inicioMesAtual } });
    const growth = usersMesAnterior > 0 ? Math.round(((usersEsseMes - usersMesAnterior) / usersMesAnterior) * 100) : 0;

    res.json({
      usuarios: usuariosPorMes,
      stats: {
        totalUsers,
        totalAnuncios,
        totalTickets,
        growth,
        usersEsseMes,
      }
    });
  } catch (err) {
    console.log("Erro dashboard:", err.message);
    res.status(500).json({ error: "Erro ao buscar dados do dashboard" });
  }
});

// ─── IA INSIGHTS ─────────────────────────────────────────────────────────────
app.get("/api/ai-insights", async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Você é um analista de dados profissional." },
        { role: "user", content: "Analise crescimento: Jan 400, Fev 300, Mar 500, Abr 650, Mai 800" }
      ]
    });
    res.json({ insight: response.choices[0].message.content });
  } catch (err) {
    console.log("Erro IA:", err.message);
    res.json({
      insight: `📊 Análise automática:\n\n- Crescimento consistente após fevereiro\n- Forte aceleração entre março e maio\n- Tendência positiva de aquisição de usuários\n\n💡 Recomendação:\nInvista em retenção e marketing, pois o crescimento está em alta.`
    });
  }
});

// ─── CONTATO ─────────────────────────────────────────────────────────────────
app.post("/api/contato", async (req, res) => {
  const { nome, email, assunto, mensagem } = req.body;
  try {
    await Ticket.create({ nome, email, assunto, mensagem });
    await resend.emails.send({
      from: "onboarding@resend.dev", to: email,
      subject: `Recebemos sua mensagem - ${assunto}`,
      html: `<h2>Olá ${nome}</h2><p>Recebemos sua mensagem e responderemos em breve.</p><p><b>Assunto:</b> ${assunto}</p>`
    });
    await resend.emails.send({
      from: "onboarding@resend.dev", to: process.env.EMAIL_USER,
      subject: `📩 Novo ticket - ${assunto}`,
      html: `<h2>Novo contato recebido</h2><p><b>Nome:</b> ${nome}</p><p><b>Email:</b> ${email}</p><p><b>Mensagem:</b><br/>${mensagem}</p>`
    });
    res.json({ message: "Ticket criado com sucesso!" });
  } catch (error) {
    console.log("Erro:", error.message);
    res.status(500).json({ error: "Erro ao processar contato" });
  }
});

// ─── AUTENTICAÇÃO ─────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { nome, email, senha } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: "Email já cadastrado" });
    const hashedPassword = await bcrypt.hash(senha, 10);
    const user = await User.create({ nome, email, senha: hashedPassword });
    res.status(201).json({ message: "Usuário cadastrado com sucesso!", user: { id: user._id, nome: user.nome, email: user.email } });
  } catch (error) {
    console.log("Erro cadastro:", error.message);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Usuário não encontrado" });
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) return res.status(400).json({ error: "Senha inválida" });
    const token = jwt.sign(
      { id: user._id, email: user.email, tipo: user.tipo },
      process.env.JWT_SECRET || "SEGREDO_SUPER_SEGURO",
      { expiresIn: "7d" }
    );
    res.json({
      message: "Login realizado com sucesso!", token,
      user: { id: user._id, nome: user.nome, email: user.email, tipo: user.tipo }
    });
  } catch (error) {
    console.log("Erro login:", error.message);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// ─── PERFIL ───────────────────────────────────────────────────────────────────
app.get("/api/perfil", autenticar, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-senha");
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar perfil" });
  }
});

app.put("/api/perfil", autenticar, async (req, res) => {
  const { nome, email, senhaAtual, novaSenha } = req.body;
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    // Verifica email duplicado
    if (email && email !== user.email) {
      const emailExiste = await User.findOne({ email });
      if (emailExiste) return res.status(400).json({ error: "Email já está em uso" });
    }

    // Atualiza nome e email
    if (nome) user.nome = nome;
    if (email) user.email = email;

    // Atualiza senha se fornecida
    if (novaSenha) {
      if (!senhaAtual) return res.status(400).json({ error: "Informe a senha atual para alterá-la" });
      const senhaValida = await bcrypt.compare(senhaAtual, user.senha);
      if (!senhaValida) return res.status(400).json({ error: "Senha atual incorreta" });
      if (novaSenha.length < 6) return res.status(400).json({ error: "Nova senha deve ter pelo menos 6 caracteres" });
      user.senha = await bcrypt.hash(novaSenha, 10);
    }

    await user.save();

    // Retorna novo token com dados atualizados
    const token = jwt.sign(
      { id: user._id, email: user.email, tipo: user.tipo },
      process.env.JWT_SECRET || "SEGREDO_SUPER_SEGURO",
      { expiresIn: "7d" }
    );

    res.json({
      message: "Perfil atualizado com sucesso!",
      token,
      user: { id: user._id, nome: user.nome, email: user.email, tipo: user.tipo }
    });
  } catch (err) {
    console.log("Erro perfil:", err.message);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

// ─── MAPA ─────────────────────────────────────────────────────────────────────
app.get("/api/places", async (req, res) => {
  try {
    const query = req.query.data;
    const params = new URLSearchParams();
    params.append("data", query);
    const response = await axios.post("https://overpass-api.de/api/interpreter", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "EarthLoop/1.0" }
    });
    res.json(response.data);
  } catch (error) {
    console.log("Erro Overpass:", error.response?.data || error.message);
    res.status(500).json({ error: "Erro ao buscar locais" });
  }
});

// ─── ANÚNCIOS ─────────────────────────────────────────────────────────────────
app.get("/api/anuncios/todos", async (req, res) => {
  try {
    const anuncios = await Anuncio.find().sort({ createdAt: -1 });
    res.json(anuncios);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar anúncios" });
  }
});

app.get("/api/anuncios", autenticar, async (req, res) => {
  try {
    const anuncios = await Anuncio.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(anuncios);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar anúncios" });
  }
});

app.post("/api/anuncios", autenticar, async (req, res) => {
  try {
    const anuncio = await Anuncio.create({ ...req.body, userId: req.userId });
    res.status(201).json(anuncio);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar anúncio" });
  }
});

app.put("/api/anuncios/:id", autenticar, async (req, res) => {
  try {
    const anuncio = await Anuncio.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId }, req.body, { new: true }
    );
    if (!anuncio) return res.status(404).json({ error: "Anúncio não encontrado" });
    res.json(anuncio);
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar anúncio" });
  }
});

app.delete("/api/anuncios/:id", autenticar, async (req, res) => {
  try {
    const anuncio = await Anuncio.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!anuncio) return res.status(404).json({ error: "Anúncio não encontrado" });
    res.json({ message: "Anúncio removido com sucesso" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao remover anúncio" });
  }
});

app.get("/api/anuncios/publico/:id", async (req, res) => {
  try {
    const anuncio = await Anuncio.findById(req.params.id);
    if (!anuncio) return res.status(404).json({ error: "Anúncio não encontrado" });
    res.json(anuncio);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar anúncio" });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.get("/api/ping", (req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`🌍 API rodando na porta ${PORT}`));