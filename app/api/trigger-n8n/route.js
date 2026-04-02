// ============================================================
// API PROXY — /api/trigger-n8n
// Routes each action to its own n8n webhook URL (fixes CORS)
// ============================================================

const WEBHOOKS = {
  competitor_analysis:  "https://n8n.srv881198.hstgr.cloud/webhook/meta_ads_scraper",
  generate_ad:          "https://n8n.srv881198.hstgr.cloud/webhook/generate_ad",
  launch_meta_ad:       "https://n8n.srv881198.hstgr.cloud/webhook/launch_ad",
  stop_campaign:        "https://n8n.srv881198.hstgr.cloud/webhook/stop_campaign",
  generate_report:      "https://n8n.srv881198.hstgr.cloud/webhook/generate_report",
  generate_social_post: "https://n8n.srv881198.hstgr.cloud/webhook/social_post",
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    const url = WEBHOOKS[action];
    if (!url) {
      return Response.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawResponse: text, ok: response.ok };
    }

    // If n8n itself returned an error status, wrap it in a 200 so the
    // client's catch block handles it gracefully instead of throwing.
    if (!response.ok) {
      return Response.json(
        { error: data?.error || `n8n returned ${response.status}`, rawResponse: text },
        { status: 200 }
      );
    }

    return Response.json(data, { status: 200 });
  } catch (err) {
    // Network / parse errors — return 200 so the client can show a
    // user-friendly message without crashing the dev overlay.
    return Response.json(
      { error: err.message || "Failed to reach n8n" },
      { status: 200 }
    );
  }
}
