require("dotenv").config();

const nodemailer = require("nodemailer");
const Ticket = require("./models/Ticket");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const OpenAI = require("openai");
const bcrypt = require("bcrypt");
const User = require("./models/User");

const jwt = require("jsonwebtoken");
const axios = require("axios");
const app = express();
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  tls: {
    rejectUnauthorized: false
  },

  family: 4
});
app.use(cors());
app.use(express.json()); 

console.log("🚀 Iniciando EarthLoop API");


// 🔗 MongoDB Atlas (do Render)
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/earthloop";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas conectado com sucesso!"))
  .catch(err => {
    console.log("❌ Erro Mongo:", err.message);
    console.log("MONGO_URI configurado?", !!process.env.MONGO_URI);
  });

// 🤖 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 📊 DASHBOARD DATA
app.get("/api/dashboard", (req, res) => {
  res.json({
    usuarios: [
      { name: "Jan", usuarios: 400 },
      { name: "Fev", usuarios: 300 },
      { name: "Mar", usuarios: 500 },
      { name: "Abr", usuarios: 650 },
      { name: "Mai", usuarios: 800 },
    ],
    stats: {
      totalUsers: 1200,
      growth: 23,
      active: 890
    }
  });
});

// 🤖 IA INSIGHTS
app.get("/api/ai-insights", async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Você é um analista de dados profissional."
        },
        {
          role: "user",
          content: "Analise crescimento: Jan 400, Fev 300, Mar 500, Abr 650, Mai 800"
        }
      ]
    });

    res.json({
      insight: response.choices[0].message.content
    });

  } catch (err) {

    console.log("Erro IA:", err.message);

    // 🔥 FALLBACK INTELIGENTE
    res.json({
      insight: `
📊 Análise automática:

- Crescimento consistente após fevereiro
- Forte aceleração entre março e maio
- Tendência positiva de aquisição de usuários

💡 Recomendação:
Invista em retenção e marketing, pois o crescimento está em alta.
      `
    });
  }
});

app.post("/api/contato", async (req, res) => {
  const { nome, email, assunto, mensagem } = req.body;

  try {
    // 💾 Salva no banco
    const ticket = await Ticket.create({
      nome,
      email,
      assunto,
      mensagem
    });

    // 📧 Email pro cliente
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Recebemos sua mensagem - ${assunto}`,
      html: /* EMAIL BONITO AQUI */ 
        `<h2>Olá ${nome},</h2>
        <p>Obrigado por entrar em contato com a EarthLoop! Recebemos sua mensagem e nossa equipe irá respondê-lo o mais breve possível.</p>
        <p><b>Assunto:</b> ${assunto}</p>
      ` });

    // 📧 Email pra você (admin)
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `📩 Novo ticket - ${assunto}`,
      html: `
        <h2>Novo contato recebido</h2>
        <p><b>Nome:</b> ${nome}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Mensagem:</b><br/>${mensagem}</p>
      `
    });

    res.json({ message: "Ticket criado com sucesso!" });

  } catch (error) {
    console.log("Erro:", error.message);
    res.status(500).json({ error: "Erro ao processar contato" });
  }
});

app.post("/api/register", async (req, res) => {
  const { nome, email, senha } = req.body;

  try {
    // 🔍 verifica se já existe
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    // 🔐 criptografar senha
    const hashedPassword = await bcrypt.hash(senha, 10);

    // 💾 salvar no banco
    const user = await User.create({
      nome,
      email,
      senha: hashedPassword
    });

    res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email
      }
    });

  } catch (error) {
    console.log("Erro cadastro:", error.message);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "Usuário não encontrado" });
    }

    // 🔐 comparar senha
    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
      return res.status(400).json({ error: "Senha inválida" });
    }

    // 🎟️ gerar token
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        tipo: user.tipo
      },
      "SEGREDO_SUPER_SEGURO", // depois coloca no .env
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login realizado com sucesso!",
      token,
      user: {
        id: user._id,
        email: user.email,
        tipo: user.tipo
      }
    });

  } catch (error) {
    console.log("Erro login:", error.message);
    res.status(500).json({ error: "Erro no servidor" });
  }
});
app.get("/api/places", async (req, res) => {
  try {

    const query = req.query.data;

    const params = new URLSearchParams();
    params.append("data", query);

    const response = await axios.post(
      "https://overpass-api.de/api/interpreter",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "EarthLoop/1.0"
        }
      }
    );

    res.json(response.data);

  } catch (error) {

    console.log(
      "Erro Overpass:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Erro ao buscar locais"
    });
  }
});

// 🚀 START
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🌍 API rodando na porta ${PORT}`);
});