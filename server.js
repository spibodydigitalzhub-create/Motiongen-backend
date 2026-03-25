import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend working 🚀" });
});

app.post("/generate-video", async (req, res) => {
  const { prompt, duration, type } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  res.json({
    success: true,
    status: "completed",
    prompt,
    duration: duration || "5 seconds",
    type: type || "text-to-video",
    video_url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
