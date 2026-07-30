import fs from "fs";
import fetch from "node-fetch";
import { DateTime } from "luxon";

// ------------------------------------------------------------
// Simple RSS parsing (title + description)
// ------------------------------------------------------------

async function fetchRSS(url) {
  const res = await fetch(url);
  const xml = await res.text();

  const items = [];
  const rawItems = xml.split("<item>").slice(1); // skip header

  for (const raw of rawItems) {
    const item = raw.split("</item>")[0];

    const title = extractTag(item, "title");
    const description = extractTag(item, "description");

    if (title) {
      items.push({ title, description });
    }
  }

  return items;
}

function extractTag(xml, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;

  const start = xml.indexOf(open);
  const end = xml.indexOf(close);

  if (start === -1 || end === -1) return null;

  let content = xml.substring(start + open.length, end).trim();

  // Remove CDATA if present
  if (content.startsWith("<![CDATA[")) {
    content = content.replace("<![CDATA[", "").replace("]]>", "");
  }

  return content.trim();
}


async function getCategoryHeadlines() {
  const feeds = {
    global: {
      url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
      limit: 2
    },
    us: {
      url: "https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en",
      limit: 2
    },
    china: {
      url: "https://news.google.com/rss/search?q=China&hl=en-US&gl=US&ceid=US:en",
      limit: 2
    },
    kansas: {
      url: "https://news.google.com/rss/search?q=Kansas&hl=en-US&gl=US&ceid=US:en",
      limit: 1
    },
    chiefs: {
      url: "https://news.google.com/rss/search?q=Kansas+City+Chiefs&hl=en-US&gl=US&ceid=US:en",
      limit: 1
    },
    lawrence: {
      url: "https://news.google.com/rss/search?q=Lawrence+Kansas&hl=en-US&gl=US&ceid=US:en",
      limit: 1
    }
  };

  const result = {};

  for (const [key, cfg] of Object.entries(feeds)) {
    try {
      const items = await fetchRSS(cfg.url);
      result[key] = items.slice(0, cfg.limit);
    } catch (e) {
      console.error(`Failed to fetch RSS for ${key}:`, e);
      result[key] = [];
    }
  }

  return result;
}

// ------------------------------------------------------------
// Weather + History
// ------------------------------------------------------------

async function getWeather() {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=38.9717&longitude=-95.2353&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America/Chicago";

  const res = await fetch(url);
  const data = await res.json();

  const high = data.daily.temperature_2m_max[0];
  const low = data.daily.temperature_2m_min[0];
  const code = data.daily.weathercode[0];

  const conditions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail"
  };

  return `High ${high}°F, low ${low}°F, ${conditions[code] || "Unknown conditions"}`;
}

async function getTodayInHistory() {
  const res = await fetch("https://history.muffinlabs.com/date");
  const data = await res.json();
  return data.data.Events.slice(0, 3).map(e => e.text);
}

// ------------------------------------------------------------
// Prompt Builder (with real headlines)
// ------------------------------------------------------------

function daysUntilChristmas() {
  const now = DateTime.now();
  const christmas = DateTime.fromObject({
    month: 12,
    day: 25,
    year: now.year
  });
  return Math.round(christmas.diff(now, "days").days);
}

function formatHeadlinesSection(title, items) {
  if (!items || items.length === 0) return `${title}: No current headlines available.\n`;

  let out = `${title}:\n`;
  for (const item of items) {
    out += `- Headline: ${item.title}\n`;
    if (item.description) {
      out += `  Description: ${item.description}\n`;
    }
  }
  return out + "\n";
}

function buildPrompt({ weather, history, headlines }) {
  const today = DateTime.now().toFormat("MMMM d, yyyy");

  const historyText = history.join(" ");

  const globalSection = formatHeadlinesSection("Global News (emphasize conflicts and tensions)", headlines.global);
  const usSection = formatHeadlinesSection("United States News (include political, economic, and social tensions)", headlines.us);
  const chinaSection = formatHeadlinesSection("China News (focus on geopolitical conflicts, economic competition, and regional tensions)", headlines.china);
  const kansasSection = formatHeadlinesSection("Kansas News (state-level politics, economy, and notable events)", headlines.kansas);
  const chiefsSection = formatHeadlinesSection("Kansas City Chiefs News (team updates, games, injuries, contracts)", headlines.chiefs);
  const lawrenceSection = formatHeadlinesSection("Lawrence, KS News (local government, community events, schools, crime)", headlines.lawrence);

  return `
You are a radio news writer creating a 10–15 minute morning briefing for the Davis family.
Tone: straight-forward, professional, calm, with very brief sardonic one-liners.
Each story should consist of:
1) The headline (read clearly)
2) A concise summarization of key details
For international and national stories (Global, US, China), emphasize global conflicts, geopolitical tensions, and power struggles.

INTRO
Write a short intro that:
- Greets the Davis family
- States the date: ${today}
- States the weather in Lawrence, KS: ${weather}
- Mentions "Today in History" using: ${historyText}

MAIN NEWS
Use the following real headlines and descriptions. For each category:
- Read each headline
- Then summarize key details in 2–4 sentences
- For Global, US, and China, emphasize conflicts, tensions, and stakes
- Keep the tone professional, with occasional dry, sardonic asides

${globalSection}
${usSection}
${chinaSection}
${kansasSection}
${chiefsSection}
${lawrenceSection}

SECONDARY SEGMENT
After the news, add:
- A paleo-ish dinner recommendation for tonight
- A brief movies & cinema segment (news + one recommendation)
- A short men's wellness segment (recent research or practical advice)

OUTRO
End with:
- "There are ${daysUntilChristmas()} days until Christmas."
- A short, warm sign-off like "I'll see you tomorrow."
`;
}

// ------------------------------------------------------------
// Cohere Script Generator
// ------------------------------------------------------------

async function getScriptFromCohere(prompt) {
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`
    },
    body: JSON.stringify({
      model: "command-r-plus-08-2024",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  console.log("COHERE RAW:", JSON.stringify(data, null, 2));

  const text = data?.message?.content?.[0]?.text;
  return text?.trim() || null;
}

// ------------------------------------------------------------
// Text-to-Speech
// ------------------------------------------------------------

async function textToSpeech(text) {
  const res = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize?key=" +
      process.env.GOOGLE_TTS_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "en-US", name: "en-US-Neural2-C" },
        audioConfig: { audioEncoding: "MP3" }
      })
    }
  );

  const data = await res.json();
  return Buffer.from(data.audioContent, "base64");
}

// ------------------------------------------------------------
// Save MP3 + Update RSS
// ------------------------------------------------------------

function saveMP3(buffer) {
  const filename = `episode-${DateTime.now().toFormat("yyyy-MM-dd")}.mp3`;
  fs.writeFileSync(`./${filename}`, buffer);
  return filename;
}

function updateRSS(filename) {
  const rssPath = "./rss.xml";
  let rss = fs.readFileSync(rssPath, "utf8");

  const url = `https://njdpro.github.io/daily-briefing/${filename}`;

  const item = `
  <item>
    <title>Davis Briefing — ${DateTime.now().toFormat("MMMM d, yyyy")}</title>
    <enclosure url="${url}" type="audio/mpeg" />
    <pubDate>${new Date().toUTCString()}</pubDate>
    <guid>${url}</guid>
  </item>
  `;

  rss = rss.replace("</channel>", `${item}\n</channel>`);
  fs.writeFileSync(rssPath, rss);
}

// ------------------------------------------------------------
// Main Runner
// ------------------------------------------------------------

async function run() {
  const weather = await getWeather();
  const history = await getTodayInHistory();
  const headlines = await getCategoryHeadlines();

  const prompt = buildPrompt({ weather, history, headlines });
  const script = await getScriptFromCohere(prompt);

  console.log("SCRIPT:", script);

  if (!script) {
    console.error("Cohere returned no script. Skipping episode.");
    return;
  }

  const mp3 = await textToSpeech(script);
  const filename = saveMP3(mp3);

  updateRSS(filename);
}

run();
