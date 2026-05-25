const https = require("https");

const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || "https://earthloop-backend.onrender.com";

function ping() {
  https.get(`${BACKEND_URL}/api/ping`, (res) => {
    console.log(`🏓 Keep-alive ping: ${res.statusCode}`);
  }).on("error", (err) => {
    console.log("⚠️ Keep-alive erro:", err.message);
  });
}

// Ping a cada 14 minutos (Render dorme após 15 min sem requisição)
setInterval(ping, 14 * 60 * 1000);

console.log("✅ Keep-alive ativado — ping a cada 14 minutos");