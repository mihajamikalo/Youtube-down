import express from "express";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import HttpsProxyAgent from "https-proxy-agent";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "SECRET_KEY_123";

// ✅ Liste de proxys (séparés par virgule dans PROXY_LIST)
const proxyList = process.env.PROXY_LIST
  ? process.env.PROXY_LIST.split(",").map(p => p.trim())
  : [];

let proxyIndex = 0;

// ✅ Sélection d’un proxy avec rotation
function getNextProxy() {
  if (proxyList.length === 0) return null;
  const proxy = proxyList[proxyIndex];
  proxyIndex = (proxyIndex + 1) % proxyList.length;
  console.log(`🔄 Utilisation du proxy : ${proxy}`);
  return new HttpsProxyAgent(proxy);
}

// ✅ Suppression sécurisée
const safeDelete = (file) => {
  if (fs.existsSync(file)) fs.unlinkSync(file);
};

// ✅ Fallback yt-dlp
const fallbackYtDlp = (url, format, res) => {
  const tempFile = path.resolve(`yt_${Date.now()}.${format}`);
  console.log("⚠️ Utilisation fallback yt-dlp pour :", url);

  const yt = spawn("yt-dlp", [
    format === "mp3" ? "-x" : "-f",
    format === "mp3" ? "--audio-format" : "best",
    format === "mp3" ? "mp3" : "",
    "-o", tempFile,
    url
  ].filter(Boolean));

  yt.on("close", () => {
    res.sendFile(tempFile, (err) => {
      safeDelete(tempFile);
      if (err) console.error("❌ Erreur yt-dlp :", err);
      else console.log("✅ Fichier envoyé via yt-dlp et supprimé");
    });
  });
};

// ✅ Middleware clé API
app.use((req, res, next) => {
  const key = req.query.key;
  if (!key || key !== API_KEY) return res.status(401).json({ error: "🔒 Clé API invalide" });
  next();
});

// ✅ Page test
app.get("/", (req, res) => {
  res.send("🚀 API YouTube Downloader avec Rotation Proxy prête !");
});

// ✅ Fonction commune pour options ytdl
function ytdlOptions(extra = {}) {
  const agent = getNextProxy();
  return agent ? { requestOptions: { agent }, ...extra } : extra;
}

// ✅ Route VIDÉO
app.get("/video", async (req, res) => {
  const url = req.query.url;
  const noCache = req.query.nocache === "true";
  if (!url || !ytdl.validateURL(url)) return res.status(400).send("❌ URL invalide !");

  const tempFile = path.resolve(`video_${Date.now()}.mp4`);
  console.log("🎬 Vidéo demandée :", url, "| nocache:", noCache);

  req.on("aborted", () => {
    console.warn("⚠️ Téléchargement annulé !");
    safeDelete(tempFile);
  });

  try {
    const options = ytdlOptions({ quality: "18" });

    if (noCache) {
      res.header("Content-Disposition", 'attachment; filename="video.mp4"');
      return ytdl(url, options).pipe(res);
    }

    const ws = fs.createWriteStream(tempFile);
    ytdl(url, options)
      .pipe(ws)
      .on("finish", () => {
        res.sendFile(tempFile, (err) => {
          safeDelete(tempFile);
          if (err) console.error("❌ Erreur envoi vidéo :", err);
          else console.log("✅ Vidéo envoyée et supprimée :", tempFile);
        });
      })
      .on("error", () => fallbackYtDlp(url, "mp4", res));
  } catch (err) {
    console.error("⚠️ Erreur ytdl vidéo, fallback yt-dlp");
    fallbackYtDlp(url, "mp4", res);
  }
});

// ✅ Route AUDIO
app.get("/audio", (req, res) => {
  const url = req.query.url;
  const noCache = req.query.nocache === "true";
  if (!url || !ytdl.validateURL(url)) return res.status(400).send("❌ URL invalide !");

  const tempFile = path.resolve(`audio_${Date.now()}.mp3`);
  console.log("🎵 Audio demandé :", url, "| nocache:", noCache);

  req.on("aborted", () => {
    console.warn("⚠️ Téléchargement annulé !");
    safeDelete(tempFile);
  });

  try {
    const options = ytdlOptions({ filter: "audioonly", quality: "highestaudio" });

    if (noCache) {
      res.header("Content-Disposition", 'attachment; filename="audio.mp3"');
      const stream = ytdl(url, options);
      return ffmpeg(stream).setFfmpegPath(ffmpegPath).audioBitrate(128).format("mp3").pipe(res);
    }

    const audioStream = ytdl(url, options);
    ffmpeg(audioStream)
      .setFfmpegPath(ffmpegPath)
      .audioBitrate(128)
      .save(tempFile)
      .on("end", () => {
        res.sendFile(tempFile, (err) => {
          safeDelete(tempFile);
          if (err) console.error("❌ Erreur envoi audio :", err);
          else console.log("✅ Audio envoyé et supprimé :", tempFile);
        });
      })
      .on("error", () => fallbackYtDlp(url, "mp3", res));
  } catch (err) {
    console.error("⚠️ Erreur ytdl audio, fallback yt-dlp");
    fallbackYtDlp(url, "mp3", res);
  }
});

app.listen(PORT, () => console.log(`✅ Serveur API prêt avec rotation Proxy sur http://localhost:${PORT}`));
