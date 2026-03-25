import express from "express";
import cors from "cors";
import Replicate from "replicate";

const app = express();
app.use(cors());
app.use(express.json());

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

app.get("/", (req, res) => {
  res.json({ message: "Backend working 🚀" });
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

    const prediction = await replicate.predictions.create({
      model: "lightricks/ltx-video",
      input: {
        prompt,
        negative_prompt: "low quality, worst quality, deformed, distorted",
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
    res.status(500).json({
      error: error.message || "Failed to start generation"
    });
  }
});

app.get("/video-status/:id", async (req, res) => {
  try {
    const prediction = await replicate.predictions.get(req.params.id);

    let videoUrl = null;

    if (prediction.status === "succeeded" && prediction.output) {
      if (Array.isArray(prediction.output) && prediction.output.length > 0) {
        videoUrl = prediction.output[0];
      } else if (typeof prediction.output === "string") {
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
    res.status(500).json({
      error: error.message || "Failed to fetch video status"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});