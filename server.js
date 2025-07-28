import express from "express";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || "SECRET_KEY_123";

// ✅ Suppression sécurisée
const safeDelete = (file) => {
  if (fs.existsSync(file)) fs.unlinkSync(file);
};

// ✅ Fallback vers yt-dlp si ytdl échoue
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

// ✅ Middleware sécurité : clé API
app.use((req, res, next) => {
  const key = req.query.key;
  if (!key || key !== API_KEY) return res.status(401).json({ error: "🔒 Clé API invalide" });
  next();
});

// ✅ Page test
app.get("/", (req, res) => {
  res.send("🚀 API YouTube Downloader (Pré-téléchargement + yt-dlp + nocache) prête !");
});

// Main index 


// ✅ Route VIDÉO
app.get("/video", async (req, res) => {
  const url = req.query.url;
  const noCache = req.query.nocache === "true";
  if (!url || !ytdl.validateURL(url)) return res.status(400).send("❌ URL invalide !");

  const tempFile = path.resolve(`video_${Date.now()}.mp4`);
  console.log("🎬 Vidéo demandée :", url, "| nocache:", noCache);

  req.on("aborted", () => {
    console.warn("⚠️ Téléchargement annulé par le client !");
    safeDelete(tempFile);
  });

  try {
    if (noCache) {
      // ✅ Streaming direct (sans fichier temporaire)
      res.header("Content-Disposition", 'attachment; filename="video.mp4"');
      return ytdl(url, { quality: "18" }).pipe(res);
    }

    // ✅ Mode pré-téléchargement
    const ws = fs.createWriteStream(tempFile);
    ytdl(url, { quality: "18" })
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

// ✅ Route AUDIO MP3
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
    if (noCache) {
      // ✅ Streaming direct sans cache
      res.header("Content-Disposition", 'attachment; filename="audio.mp3"');
      const stream = ytdl(url, { filter: "audioonly", quality: "highestaudio" });
      return ffmpeg(stream).setFfmpegPath(ffmpegPath).audioBitrate(128).format("mp3").pipe(res);
    }

    // ✅ Pré-téléchargement avec conversion FFmpeg
    const audioStream = ytdl(url, { filter: "audioonly", quality: "highestaudio" });
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

app.listen(PORT, () => console.log(`✅ Serveur API prêt sur http://localhost:${PORT}`));
