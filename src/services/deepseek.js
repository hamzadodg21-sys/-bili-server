// deepseek.js - الوسيط الوحيد يلي بيكلم DeepSeek API فعلياً
// المفتاح الحقيقي (DEEPSEEK_API_KEY) موجود بس هون، ما بيوصل لتطبيق العميل أبداً.

const axios = require("axios");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// سقف حماية: يمنع رد واحد طويل جداً يكلف فلوس زيادة. عدّلها لو بدك ردود أطول.
const MAX_TOKENS = 500;

async function askDeepSeek(question) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY غير موجود بملف .env");
  }

  const response = await axios.post(
    DEEPSEEK_URL,
    {
      model: "deepseek-chat",
      messages: [{ role: "user", content: question }],
      max_tokens: MAX_TOKENS,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  const data = response.data;
  const answer = data.choices?.[0]?.message?.content ?? "";
  const tokensUsed = data.usage?.total_tokens ?? 0;

  return { answer, tokensUsed };
}

module.exports = { askDeepSeek };
