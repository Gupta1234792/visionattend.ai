const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

const chatWithAssistant = async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: "prompt is required"
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({
        success: false,
        message: "Assistant is not configured. Add GROQ_API_KEY in backend env."
      });
    }

    const userName = req.user?.name || "Student";
    const userYear = req.user?.year || "N/A";
    const userDivision = req.user?.division || "N/A";

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are VisionAttend Buddy, a concise student assistant. Help with general academic questions, attendance workflow doubts, lecture schedule understanding, and polite guidance. Never reveal secrets, API keys, or internal security details."
          },
          {
            role: "system",
            content: `Student context: name=${userName}, year=${userYear}, division=${userDivision}`
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await response.json().catch(() => ({}));
    const answer = data?.choices?.[0]?.message?.content?.trim();

    if (!response.ok || !answer) {
      return res.status(502).json({
        success: false,
        message: data?.error?.message || "Assistant service unavailable"
      });
    }

    return res.json({
      success: true,
      reply: answer
    });
  } catch (error) {
    console.error("assistant chat error:", error);
    return res.status(500).json({
      success: false,
      message: "Assistant request failed"
    });
  }
};

module.exports = {
  chatWithAssistant
};

