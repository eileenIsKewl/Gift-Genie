import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

// Serve the built frontend (npm run build outputs to dist/)
app.use(express.static("dist"));

// Initialize an OpenAI client for your provider using env vars
const openai = new OpenAI({
  apiKey: process.env.AI_KEY,
  baseURL: process.env.AI_URL,
});

// System prompt, used fresh for every request
const SYSTEM_PROMPT = `You are the Gift Genie.

You generate gift ideas that feel thoughtful, specific, and genuinely useful.
Your output must be in structured Markdown.
Do not write introductions or conclusions.
Start directly with the gift suggestions.

Each gift must:
- Have a clear heading
- Include a short explanation of why it works

If the user mentions a location, situation, or constraint,
adapt the gift ideas and add another short section
under each gift that guides the user to get the gift in that
constrained context.

When you reference a store or product you found via search, cite it as a
real clickable Markdown link, e.g. [Store Name](https://example.com) —
never use bracket/citation markers like 【1†L2-L3】.

After the gift ideas, include a section titled "Questions for you"
with clarifying questions that would help improve the recommendations.
Only ask about details the user hasn't already given you.`;

// Challenge: See challenge.md for instructions
app.post("/api/gift", async (req, res) => {
  // Extract userPrompt from req.body
  const { userPrompt } = req.body

  // Start a fresh conversation for every request — otherwise every
  // submission (from anyone) would keep piling onto one shared history
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  // Set up SSE so the client gets tokens as they arrive
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let giftSuggestions = "";

  try {
    // Use the Responses API so the model can search the web when it needs
    // current info (browser_search is Groq's equivalent of web_search)
    const stream = await openai.responses.create({
      model: process.env.AI_MODEL,
      input: messages,
      tools: [{ type: "browser_search" }],
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) {
        giftSuggestions += event.delta;
        res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
      }
    }

    console.log(giftSuggestions)

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error(e)
    if (!res.headersSent) {
      res.status(500).json({ message: `It's not you, it's us.
      Something went wrong on the server` })
    } else {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`);
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
