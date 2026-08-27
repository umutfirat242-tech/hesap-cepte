```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // =========================
      // JARVIS / AI
      // =========================
      if (url.pathname === "/api/ai" && request.method === "POST") {
        const body = await request.json();
        const message = String(body.message || "").trim();

        if (!message) {
          return json({ error: "Mesaj boş olamaz." }, corsHeaders, 400);
        }

        if (!env.OPENAI_API_KEY) {
          return json({
            error: "OPENAI_API_KEY Worker Secret olarak eklenmemiş."
          }, corsHeaders, 500);
        }

        const response = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: env.OPENAI_MODEL || "gpt-5-mini",
              instructions:
                "Sen Hesap Merkezi sitesinin JARVIS benzeri Türkçe yapay zeka asistanısın. Kısa, doğal ve yardımcı cevaplar ver. Kullanıcı hesaplama veya site araçlarından biriyle ilgili soru sorarsa mümkün olduğunca yardımcı ol.",
              input: message
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return json({
            error: "AI servisi hata verdi.",
            details: data
          }, corsHeaders, response.status);
        }

        const answer =
          data.output_text ||
          extractOpenAIText(data) ||
          "Yanıt alınamadı.";

        return json({
          success: true,
          answer
        }, corsHeaders);
      }

      // =========================
      // HABERLER
      // =========================
      if (url.pathname === "/api/news") {
        const rssUrl =
          "https://feeds.bbci.co.uk/turkce/rss.xml";

        const response = await fetch(rssUrl, {
          headers: {
            "User-Agent": "HesapMerkezi/1.0"
          }
        });

        if (!response.ok) {
          throw new Error("Haber RSS kaynağına ulaşılamadı.");
        }

        const xml = await response.text();
        const items = parseRSS(xml);

        return json({
          success: true,
          source: "BBC Türkçe",
          items
        }, corsHeaders);
      }

      // =========================
      // SPOR
      // =========================
      if (url.pathname === "/api/sports") {

        if (!env.SPORTS_API_KEY) {
          return json({
            error:
              "SPORTS_API_KEY Worker Secret olarak eklenmemiş."
          }, corsHeaders, 500);
        }

        const response = await fetch(
          "https://v3.football.api-sports.io/fixtures?live=all",
          {
            headers: {
              "x-apisports-key": env.SPORTS_API_KEY
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return json({
            error: "Spor API bağlantısı başarısız.",
            details: data
          }, corsHeaders, response.status);
        }

        const matches = (data.response || []).map(match => ({
          league: match.league?.name || "",
          country: match.league?.country || "",
          home: match.teams?.home?.name || "",
          away: match.teams?.away?.name || "",
          homeScore: match.goals?.home,
          awayScore: match.goals?.away,
          status: match.fixture?.status?.short || "",
          elapsed: match.fixture?.status?.elapsed || null
        }));

        return json({
          success: true,
          matches
        }, corsHeaders);
      }

      // =========================
      // HAVA DURUMU
      // Open-Meteo
      // =========================
      if (url.pathname === "/api/weather") {
        const city =
          url.searchParams.get("city")?.trim();

        if (!city) {
          return json({
            error: "Şehir belirtilmedi."
          }, corsHeaders, 400);
        }

        const geoResponse = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=tr&format=json`
        );

        const geo = await geoResponse.json();

        if (!geo.results?.length) {
          return json({
            error: "Şehir bulunamadı."
          }, corsHeaders, 404);
        }

        const place = geo.results[0];

        const weatherResponse = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
        );

        const weather = await weatherResponse.json();

        return json({
          success: true,
          city: place.name,
          country: place.country,
          latitude: place.latitude,
          longitude: place.longitude,
          current: weather.current
        }, corsHeaders);
      }

      // =========================
      // NAMAZ VAKİTLERİ
      // Aladhan API
      // =========================
      if (url.pathname === "/api/prayer") {
        const city =
          url.searchParams.get("city")?.trim() || "Istanbul";

        const country =
          url.searchParams.get("country")?.trim() || "Turkey";

        const date =
          url.searchParams.get("date")?.trim() || "";

        let apiUrl =
          `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=13`;

        if (date) {
          apiUrl += `&date=${encodeURIComponent(date)}`;
        }

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!response.ok || data.code !== 200) {
          return json({
            error: "Namaz vakitleri alınamadı.",
            details: data
          }, corsHeaders, 500);
        }

        return json({
          success: true,
          city,
          country,
          date: data.data.date,
          timings: data.data.timings
        }, corsHeaders);
      }

      // =========================
      // RESMİ TATİLLER
      // Nager.Date
      // =========================
      if (url.pathname === "/api/holidays") {
        const year =
          url.searchParams.get("year") ||
          new Date().getFullYear();

        const response = await fetch(
          `https://date.nager.at/api/v3/PublicHolidays/${year}/TR`
        );

        const data = await response.json();

        if (!response.ok) {
          return json({
            error: "Resmi tatil verisi alınamadı."
          }, corsHeaders, response.status);
        }

        const holidays = data.map(item => ({
          date: item.date,
          name: item.localName || item.name,
          global: item.global
        }));

        return json({
          success: true,
          year,
          holidays
        }, corsHeaders);
      }

      // =========================
      // QR
      // =========================
      if (url.pathname === "/api/qr") {
        const text =
          url.searchParams.get("text")?.trim();

        if (!text) {
          return json({
            error: "QR içeriği boş."
          }, corsHeaders, 400);
        }

        const qrUrl =
          `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;

        return json({
          success: true,
          qr: qrUrl
        }, corsHeaders);
      }

      // =========================
      // API DURUMU
      // =========================
      if (url.pathname === "/api/status") {
        return json({
          success: true,
          service: "Hesap Merkezi API",
          services: {
            ai: Boolean(env.OPENAI_API_KEY),
            sports: Boolean(env.SPORTS_API_KEY),
            weather: true,
            prayer: true,
            holidays: true,
            news: true,
            qr: true
          }
        }, corsHeaders);
      }

      return json({
        error: "API endpoint bulunamadı."
      }, corsHeaders, 404);

    } catch (error) {
      return json({
        error: "Sunucu hatası.",
        message: error.message
      }, corsHeaders, 500);
    }
  }
};


// =========================
// JSON RESPONSE
// =========================

function json(data, headers, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}


// =========================
// OPENAI TEXT ÇIKARICI
// =========================

function extractOpenAIText(data) {
  try {
    const outputs = data.output || [];

    let text = "";

    for (const item of outputs) {
      for (const content of item.content || []) {
        if (content.type === "output_text") {
          text += content.text || "";
        }
      }
    }

    return text.trim();
  } catch {
    return "";
  }
}


// =========================
// BASİT RSS PARSER
// =========================

function parseRSS(xml) {
  const items = [];

  const matches =
    xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const item of matches.slice(0, 15)) {

    const title =
      cleanXML(getTag(item, "title"));

    const link =
      cleanXML(getTag(item, "link"));

    const description =
      cleanXML(getTag(item, "description"));

    const pubDate =
      cleanXML(getTag(item, "pubDate"));

    if (title) {
      items.push({
        title,
        link,
        description,
        pubDate
      });
    }
  }

  return items;
}


function getTag(xml, tag) {
  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match = xml.match(regex);

  return match ? match[1] : "";
}


function cleanXML(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
```
