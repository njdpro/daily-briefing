import fs from "fs";
import fetch from "node-fetch";
import { DateTime } from "luxon";

// ------------------------------
// STEP 1: Fetch real data
// ------------------------------

async function getWeather() {
  const res = await fetch(
    "https://api.weatherapi.com/v1/forecast.json?key=YOUR_WEATHER_API_KEY&q=Lawrence,KS&days=1"
  );
  const data = await res.json();
  const f = data.forecast.forecastday[0].day;
  return `High ${f.maxtemp_f}°F, low ${f.mintemp_f}°F, ${f.condition.text}`;
}

async function getSP500() {
  const res = await fetch(
    "https://api.marketstack.com/v1/eod/latest?access_key=YOUR_MARKETSTACK_KEY&symbols=^GSPC"
  );
  const data = await res.json();
  const change = data.data[0].change_percent;
  return `${change.toFixed(2)}%`;
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
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateText?key=" +
      process.env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: { text: prompt }
      })
    }
  );

  const data = await res.json();
  return data.candidates[0].output_text;
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

