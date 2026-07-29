import fs from "fs";
import fetch from "node-fetch";
import { DateTime } from "luxon";

// ------------------------------
// STEP 1: Fetch real data
// ------------------------------

async function getWeather() {
  const res = await fetch(
    "https://api.open-meteo.com/v1/forecast?latitude=38.9717&longitude=-95.2353&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America/Chicago"
  );

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


async function getSP500() {
  const res = await fetch(
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d"
  );

  const data = await res.json();

  const result = data.chart.result[0];
  const meta = result.meta;

  const previousClose = meta.chartPreviousClose;
  const currentPrice = result.indicators.quote[0].close[0];

  const percentChange = ((currentPrice - previousClose) / previousClose) * 100;

  return `${percentChange.toFixed(2)}%`;
}



async function getTodayInHistory() {
  const res = await fetch("https://history.muffinlabs.com/date");
  const data = await res.json();
  return data.data.Events.slice(0, 3).map(e => e.text);
}

// ------------------------------
// STEP 2: Build your daily prompt
// ------------------------------

function buildPrompt({ weather, sp500, history }) {
  const today = DateTime.now().toFormat("MMMM d, yyyy");

  return `
Act as a radio news writer creating a 10–15 minute morning briefing for the Davis family.
Tone: straight-forward, professional, calm, with very brief sardonic one-liners.

INTRO
Good morning, Davis family.
Today is ${today}.
Weather in Lawrence, KS: ${weather}.
S&P 500 change since previous open: ${sp500}.
Today in History: ${history.join(" ")}.

MAIN NEWS
International Conflicts (1–2 updates)
China (Top 2 stories)
United States (Top 2 stories)
American Real Estate (Top story)
Kansas City Chiefs (1 update)
Lawrence, KS (Local update)

SECONDARY SEGMENT
Dinner Recommendation (paleo-ish)
Movies & Cinema (news + recommendation)
Men’s Wellness (new research)

OUTRO
There are ${daysUntilChristmas()} days until Christmas.
I'll see you tomorrow.
`;
}

function daysUntilChristmas() {
  const now = DateTime.now();
  const christmas = DateTime.fromObject({ month: 12, day: 25, year: now.year });
  return Math.round(christmas.diff(now, "days").days);
}

// ------------------------------
// STEP 3: Call Google Gemini
// ------------------------------


async function getScriptFromGemini(prompt) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" +
      process.env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  const data = await res.json();

  // Handle valid response shapes
  if (data.candidates?.[0]?.content?.[0]?.parts?.[0]?.text) {
    return data.candidates[0].content[0].parts[0].text;
  }

  console.error("Gemini error:", JSON.stringify(data, null, 2));
  return "Gemini returned an error generating the script.";
}




// ------------------------------
// STEP 4: Convert script to MP3
// ------------------------------

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

// ------------------------------
// STEP 5: Save MP3 + Update RSS
// ------------------------------

function saveMP3(buffer) {
  const filename = `episode-${DateTime.now().toFormat("yyyy-MM-dd")}.mp3`;
  const path = `./${filename}`;
  fs.writeFileSync(path, buffer);
  return filename;
}

function updateRSS(filename) {
  const rssPath = "./rss.xml";
  let rss = fs.readFileSync(rssPath, "utf8");

  const url = `https://njdpro.github.io/davis-family-briefing/${filename}`;

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

// ------------------------------
// MAIN RUNNER
// ------------------------------

async function run() {
  const weather = await getWeather();
  const sp500 = await getSP500();
  const history = await getTodayInHistory();

  const prompt = buildPrompt({ weather, sp500, history });
  const script = await getScriptFromGemini(prompt);

  const mp3 = await textToSpeech(script);
  const filename = saveMP3(mp3);

  updateRSS(filename);
}

run();

