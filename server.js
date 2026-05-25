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

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.get("/api/ping", (req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`🌍 API rodando na porta ${PORT}`));