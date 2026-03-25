import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// put your exact model version here
const LTX_VIDEO_VERSION =
  process.env.LTX_VIDEO_VERSION ||
  "PASTE_LTX_VIDEO_VERSION_HERE";

app.get("/", (req, res) => {
  res.json({
    message: "Backend working 🚀",
    hasToken: !!REPLICATE_API_TOKEN,
    hasVersion: LTX_VIDEO_VERSION !== "PASTE_LTX_VIDEO_VERSION_HERE"
  });
});

app.get("/debug-token", (req, res) => {
  res.json({
    hasToken: !!REPLICATE_API_TOKEN,
    tokenPrefix: REPLICATE_API_TOKEN ? REPLICATE_API_TOKEN.slice(0, 3) : null,
    hasVersion: LTX_VIDEO_VERSION !== "PASTE_LTX_VIDEO_VERSION_HERE"
  });
});

function durationToFrames(durationText = "5 seconds") {
  if (durationText.startsWith("3")) return 73;
  if (durationText.startsWith("8")) return 193;
  return 121;
}

app.post("/generate-video", async (req, res) => {
  try {
    const { prompt, duration = "5 seconds" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: "REPLICATE_API_TOKEN is missing on server" });
    }

    if (LTX_VIDEO_VERSION === "PASTE_LTX_VIDEO_VERSION_HERE") {
      return res.status(500).json({ error: "LTX video model version is missing" });
    }

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: LTX_VIDEO_VERSION,
        input: {
          prompt,
          negative_prompt: "low quality, worst quality",
          aspect_ratio: "16:9",
          length: durationToFrames(duration)
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Replicate create error:", data);
      return res.status(response.status).json({
        error: data.detail || data.title || data.error || "Backend request failed",
        raw: data
      });
    }

    res.json({
      success: true,
      replicate_id: data.id,
      status: data.status || "starting"
    });
  } catch (error) {
    console.error("Generate error:", error);
    res.status(500).json({
      error: error.message || "Failed to start generation"
    });
  }
});

app.get("/video-status/:id", async (req, res) => {
  try {
    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: "REPLICATE_API_TOKEN is missing on server" });
    }

    const response = await fetch(`https://api.replicate.com/v1/predictions/${req.params.id}`, {
      headers: {
        "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Replicate status error:", data);
      return res.status(response.status).json({
        error: data.detail || data.title || data.error || "Status check failed",
        raw: data
      });
    }

    let videoUrl = null;

    if ((data.status === "succeeded" || data.status === "successful") && data.output) {
      if (Array.isArray(data.output)) {
        videoUrl = data.output[0];
      } else {
        videoUrl = data.output;
      }
    }

    res.json({
      success: true,
      status: data.status,
      video_url: videoUrl,
      error: data.error || null
    });
  } catch (error) {
    console.error("Status error:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch video status"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
