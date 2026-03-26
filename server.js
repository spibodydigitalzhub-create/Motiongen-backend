import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(cors());
app.use(express.json());

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Current LTX video version you were using successfully for auth flow
const LTX_VIDEO_VERSION =
  "8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars");
}

if (!REPLICATE_API_TOKEN) {
  console.error("Missing REPLICATE_API_TOKEN");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend working 🚀",
    hasToken: !!REPLICATE_API_TOKEN,
    hasSupabase: !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY
  });
});

app.get("/debug-token", (req, res) => {
  res.json({
    hasToken: !!REPLICATE_API_TOKEN,
    tokenPrefix: REPLICATE_API_TOKEN ? REPLICATE_API_TOKEN.slice(0, 3) : null,
    hasSupabase: !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY
  });
});

function durationToFrames(durationText = "5 seconds") {
  if (durationText.startsWith("3")) return 73;
  if (durationText.startsWith("8")) return 193;
  return 121;
}

app.post("/buy-coins", async (req, res) => {
  try {
    const { userId, coins = 10 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    const currentCredits = profile?.credits ?? 0;

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ credits: currentCredits + coins })
      .eq("id", userId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({
      success: true,
      newCredits: currentCredits + coins
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to add coins"
    });
  }
});

app.post("/generate-video", async (req, res) => {
  try {
    const { userId, prompt, duration = "5 seconds", type = "text-to-video" } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: "REPLICATE_API_TOKEN is missing on server" });
    }

    // 1. Check credits
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    const currentCredits = profile?.credits ?? 0;

    if (currentCredits < 1) {
      return res.status(403).json({ error: "Not enough coins" });
    }

    // 2. Create generation row first
    const { data: generationRow, error: insertError } = await supabaseAdmin
      .from("generations")
      .insert([
        {
          user_id: userId,
          prompt,
          duration,
          type,
          status: "queued"
        }
      ])
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({ error: insertError.message });
    }

    // 3. Send to Replicate
    const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
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

    const replicateData = await replicateResponse.json();

    if (!replicateResponse.ok) {
      await supabaseAdmin
        .from("generations")
        .update({ status: "failed" })
        .eq("id", generationRow.id);

      return res.status(replicateResponse.status).json({
        error:
          replicateData.detail ||
          replicateData.title ||
          replicateData.error ||
          "Replicate request failed",
        raw: replicateData
      });
    }

    // 4. Save replicate id + status
    const { error: generationUpdateError } = await supabaseAdmin
      .from("generations")
      .update({
        replicate_id: replicateData.id,
        status: replicateData.status || "starting"
      })
      .eq("id", generationRow.id);

    if (generationUpdateError) {
      return res.status(500).json({ error: generationUpdateError.message });
    }

    // 5. Deduct 1 coin ONLY after Replicate accepted the job
    const { error: deductError } = await supabaseAdmin
      .from("profiles")
      .update({ credits: currentCredits - 1 })
      .eq("id", userId);

    if (deductError) {
      return res.status(500).json({ error: deductError.message });
    }

    res.json({
      success: true,
      generationId: generationRow.id,
      replicate_id: replicateData.id,
      status: replicateData.status || "starting",
      remainingCredits: currentCredits - 1
    });
  } catch (error) {
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
      return res.status(response.status).json({
        error: data.detail || data.title || data.error || "Status check failed",
        raw: data
      });
    }

    let videoUrl = null;

    if ((data.status === "succeeded" || data.status === "successful") && data.output) {
      videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    }

    // optional auto-update when completed
    if (videoUrl) {
      await supabaseAdmin
        .from("generations")
        .update({
          status: "completed",
          result_url: videoUrl
        })
        .eq("replicate_id", req.params.id);
    }

    if (data.status === "failed") {
      await supabaseAdmin
        .from("generations")
        .update({
          status: "failed"
        })
        .eq("replicate_id", req.params.id);
    }

    res.json({
      success: true,
      status: data.status,
      video_url: videoUrl,
      error: data.error || null
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