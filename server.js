const express = require("express");
const fetch = require("node-fetch"); // v2
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.type("text/plain").send("OK - readability-service");
});
app.post("/extract", async (req, res) => {
  try {
    const url = (req.body && req.body.url) || "";
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: "Missing or invalid 'url'" });
    }

    const resp = await fetch(url, { redirect: "follow" });
    const ctype = resp.headers.get("content-type") || "";
    if (!resp.ok || !ctype.includes("text/html")) {
      return res.status(422).json({ error: "Non-HTML or bad status", status: resp.status, contentType: ctype });
    }

    const html = await resp.text();
    const finalUrl = resp.url || url;

    const dom = new JSDOM(html, { url: finalUrl });
    const doc = dom.window.document;

    let canonical_url = finalUrl;
    const linkCanon = doc.querySelector("link[rel='canonical']");
    if (linkCanon && linkCanon.getAttribute("href")) {
      try {
        canonical_url = new URL(linkCanon.getAttribute("href"), finalUrl).toString();
      } catch (_) {}
    }
    const domain = (() => { try { return new URL(canonical_url).hostname; } catch { return ""; } })();

    const meta = (sel) => doc.querySelector(sel)?.getAttribute("content") || "";
    const title = (doc.querySelector("title")?.textContent || "").trim() || meta("meta[property='og:title']") || "";
    const byline = meta("meta[name='author']") || meta("meta[property='article:author']") || "";
    const published_at = meta("meta[property='article:published_time']") || meta("meta[name='date']") || "";

    const reader = new Readability(doc);
    const article = reader.parse();
    const content_text = (article?.textContent || "").trim();
    const content_length = content_text.length;
    const is_paywalled = content_length < 800;

    res.json({
      canonical_url,
      domain,
      source: domain,
      title: title || article?.title || "",
      byline,
      published_at,
      content_length,
      content_text,
      is_paywalled
    });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Readability service on " + PORT));

