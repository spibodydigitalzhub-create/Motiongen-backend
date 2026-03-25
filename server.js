import express from "express";
import cors from "cors";
import Replicate from "replicate";

const app = express();

app.use(cors());
app.use(express.json());

/**
 * 🔐 Validate token on startup
 */
if (!process.env.REPLICATE_API_TOKEN) {
  console.error("❌ REPLICATE_API_TOKEN is missing!");
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

/**
 * ✅ Health check
 */
app.get("/", (req, res) => {
  res.json({
    message: "Backend working 🚀",
    hasToken: !!process.env.REPLICATE_API_TOKEN
  });
});

/**
 * 🔍 Debug route (very important for you)
 */
app.get("/debug-token", (req, res) => {
  res.json({
    hasToken: !!process.env.REPLICATE_API_TOKEN,
    tokenPrefix: process.env.REPLICATE_API_TOKEN
      ? process.env.REPLICATE_API_TOKEN.slice(0, 3)
      : null
  });
});

/**
 * 🎬 Convert duration to frames
 */
function durationToFrames(durationText = "5 seconds") {
  if (durationText.startsWith("3")) return 73;
  if (durationText.startsWith("8")) return 193;
  return 121;
}

/**
 * 🚀 Generate video
 */
app.post("/generate-video", async (req, res) => {
  try {
    const { prompt, duration = "5 seconds" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const prediction = await replicate.predictions.create({
      model: "lightricks/ltx-video",
      input: {
        prompt,
        negative_prompt: "low quality, worst quality",
        aspect_ratio: "16:9",
        length: durationToFrames(duration)
      }
    });

    res.json({
      success: true,
      replicate_id: prediction.id,
      status: prediction.status || "starting"
    });

  } catch (error) {
    console.error("❌ Generate error:", error.message);

    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 📊 Check video status
 */
app.get("/video-status/:id", async (req, res) => {
  try {
    const prediction = await replicate.predictions.get(req.params.id);

    let videoUrl = null;

    if (prediction.status === "succeeded" && prediction.output) {
      if (Array.isArray(prediction.output)) {
        videoUrl = prediction.output[0];
      } else {
        videoUrl = prediction.output;
      }
    }

    res.json({
      success: true,
      status: prediction.status,
      video_url: videoUrl,
      error: prediction.error || null
    });

  } catch (error) {
    console.error("❌ Status error:", error.message);

    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * 🚀 Start server
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
