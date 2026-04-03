"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Badge,
  Card,
  MetricCard,
  SectionTitle,
  WorkflowStep,
  EmptyState,
  Spinner,
  SecondaryButton,
} from "./components";
import { supabase } from "@/lib/supabase";

// ─── CONSTANTS ───────────────────────────────────────────────
const API_URL = "/api/trigger-n8n";

const TABS = [
  { id: "overview",   label: "Overview",        icon: "▦" },
  { id: "analysis",   label: "Ads Analysis",    icon: "◎" },
  { id: "create",     label: "Create Ad",       icon: "◈" },
  { id: "approval",   label: "Approval",        icon: "◉" },
  { id: "campaigns",  label: "Live Campaigns",  icon: "◷" },
  { id: "social",     label: "Social Posts",     icon: "◫" },
  { id: "reports",    label: "Reports",          icon: "◧" },
];

const TOPICS = [
  "Black-grey tattoo",
  "Anime tattoo",
  "Realistic tattoo",
  "Piercing (general)",
  "Clean shop / hygiene",
  "VIP service",
  "Award-winning artists",
];

// ─── MAIN DASHBOARD ──────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState("overview");
  const [selectedTopic, setSelectedTopic] = useState(TOPICS[1]);

  // Analysis
  const [analysisStatus, setAnalysisStatus] = useState("idle");
  // idle | generating | waiting | done | error
  const [analysisData,   setAnalysisData]   = useState(null);
  const [analysisError,  setAnalysisError]  = useState("");

  // Ad creation
  const [adStatus, setAdStatus] = useState("idle");
  // idle | generating | waiting | done | error
  const [adData,   setAdData]   = useState(null);

  // Approval & launch
  const [approved,     setApproved]     = useState(false);
  const [budget,       setBudget]       = useState(50);
  const [duration,     setDuration]     = useState(7);
  const [launchStatus, setLaunchStatus] = useState("idle");
  // idle | launching | live | error

  // Campaigns
  const [campaigns,   setCampaigns]   = useState([]);
  const [stoppedIds,  setStoppedIds]  = useState([]);
  const [stopStatus,  setStopStatus]  = useState("idle");
  // idle | stopping | stopped | error

  // Report
  const [reportStatus, setReportStatus] = useState("idle");
  // idle | generating | done | error

  // Social
  const [socialStatus,    setSocialStatus]    = useState("idle");
  // idle | generating | done | error
  const [socialActiveEvt, setSocialActiveEvt] = useState(null);

  // Shared error
  const [webhookError, setWebhookError] = useState("");

  // Approval queue
  const [scheduledAds,      setScheduledAds]      = useState([]);
  const [approvedAds,       setApprovedAds]        = useState([]);
  const [rejectedAds,       setRejectedAds]        = useState([]);
  const [approvalFilter,    setApprovalFilter]     = useState("all");
  const [adCardStatuses,    setAdCardStatuses]     = useState({});
  const [schedulePickerOpen,setSchedulePickerOpen] = useState(null);
  const [scheduleDates,     setScheduleDates]      = useState({});

  // ── Supabase reports state ──
  const [sbRows, setSbRows] = useState([]);
  const [sbLoading, setSbLoading] = useState(true);
  const [sbTriggeringId, setSbTriggeringId] = useState(null);
  const [sbToasts, setSbToasts] = useState([]);
  const [sbExpandedInsights, setSbExpandedInsights] = useState({});
  const [sbAdsConfigOpen, setSbAdsConfigOpen] = useState({});
  const [sbAdsConfigs, setSbAdsConfigs] = useState({});
  const [sbModalReport, setSbModalReport] = useState(null);
  const [sbModalTab, setSbModalTab] = useState("competitors");
  const [sbSortField, setSbSortField] = useState("score");
  const [sbSortDir, setSbSortDir] = useState("desc");

  // ── Ad preview videos state ──
  const [adVideos, setAdVideos] = useState([
    { bucket: "AD1", label: "Ad 1", file: null },
    { bucket: "AD2", label: "Ad 2", file: null },
    { bucket: "AD3", label: "Ad 3", file: null },
  ]);
  const [adVideosRefreshing, setAdVideosRefreshing] = useState(false);

  const fetchAdVideos = useCallback(async () => {
    setAdVideosRefreshing(true);
    const buckets = ["AD1", "AD2", "AD3"];
    const results = await Promise.all(
      buckets.map(async (bucket) => {
        const { data, error } = await supabase.storage.from(bucket).list("", { limit: 1, sortBy: { column: "created_at", order: "desc" } });
        const file = (!error && data && data.length > 0) ? data[0].name : null;
        return { bucket, label: `Ad ${buckets.indexOf(bucket) + 1}`, file };
      })
    );
    setAdVideos(results);
    setAdVideosRefreshing(false);
  }, []);

  useEffect(() => { fetchAdVideos(); }, [fetchAdVideos]);

  const addSbToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setSbToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setSbToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    async function fetchReports() {
      const { data, error } = await supabase
        .from("reports_json")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Supabase error:", error);
        addSbToast("Failed to fetch reports", "error");
      }
      setSbRows(data || []);
      setSbLoading(false);
    }
    fetchReports();

    // Load persisted analysis data
    const savedAnalysis = localStorage.getItem("lastAnalysisData");
    if (savedAnalysis) {
      try {
        const parsed = JSON.parse(savedAnalysis);
        setAnalysisData(parsed);
        setAnalysisStatus("done");
      } catch (e) {
        console.error("Failed to parse saved analysis:", e);
      }
    }

    // Realtime: auto-fetch new/updated/deleted rows
    const channel = supabase
      .channel("reports_json_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports_json" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setSbRows((prev) => [payload.new, ...prev]);
            addSbToast("New report received!");
          } else if (payload.eventType === "UPDATE") {
            setSbRows((prev) =>
              prev.map((r) => (r.id === payload.new.id ? payload.new : r))
            );
          } else if (payload.eventType === "DELETE") {
            setSbRows((prev) => prev.filter((r) => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addSbToast]);

  function parseSbReport(row) {
    let rd = row.report_data;
    try {
      if (typeof rd === "string") rd = JSON.parse(rd);
      // Handle array-wrapped format: [{...}] → {...}
      if (Array.isArray(rd)) rd = rd[0] || {};
      return rd || {};
    } catch { return {}; }
  }

  const sbReports = sbRows.map((row) => ({ row, report: parseSbReport(row) }));
  const sbTotalReports = sbRows.length;
  const sbTotalCompetitors = sbReports.reduce((s, { report }) => s + (report.competitors_table || []).length, 0);
  const sbHighThreats = sbReports.reduce((s, { report }) => s + (report.competitors_table || []).filter((c) => c.threat === "high").length, 0);
  const sbPendingAds = sbRows.filter((r) => !r.ads_workflow_triggered).length;

  // ── Ads config helpers ──
  const VIDEO_TYPES = ["Reel", "Story", "Feed Post", "Carousel"];
  const DURATIONS = ["15 seconds", "30 seconds", "60 seconds", "90 seconds"];
  const AUDIO_STYLES = ["Background Music", "Voiceover Only", "Music + Voiceover", "No Audio"];
  const VIDEO_STYLES = ["Bold & Colorful", "Cinematic", "Minimal & Clean", "Dark & Moody", "Neon / Glow", "Hand-drawn / Sketch"];

  function getAdsConfig(reportId) {
    return sbAdsConfigs[reportId] || { numAds: 1, videos: [{ videoType: "Reel", duration: "15 seconds", audioStyle: "Background Music", videoStyle: "Bold & Colorful", videoIdea: "" }] };
  }

  function updateAdsConfig(reportId, updater) {
    setSbAdsConfigs((prev) => {
      const current = prev[reportId] || { numAds: 1, videos: [{ videoType: "Reel", duration: "15 seconds", audioStyle: "Background Music", videoStyle: "Bold & Colorful", videoIdea: "" }] };
      return { ...prev, [reportId]: updater(current) };
    });
  }

  function setNumAds(reportId, num) {
    updateAdsConfig(reportId, (cfg) => {
      const n = Math.max(1, Math.min(5, num));
      const videos = [...cfg.videos];
      while (videos.length < n) videos.push({ videoType: "Reel", duration: "15 seconds", audioStyle: "Background Music", videoStyle: "Bold & Colorful", videoIdea: "" });
      return { ...cfg, numAds: n, videos: videos.slice(0, n) };
    });
  }

  function updateVideoConfig(reportId, idx, field, value) {
    updateAdsConfig(reportId, (cfg) => {
      const videos = [...cfg.videos];
      videos[idx] = { ...videos[idx], [field]: value };
      return { ...cfg, videos };
    });
  }

  async function handleTriggerAds(reportId, reportData) {
    const config = getAdsConfig(reportId);
    setSbTriggeringId(reportId);
    try {
      const res = await fetch("/api/trigger-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, report_data: reportData, ads_config: config }),
      });
      const result = await res.json();
      if (result.success) {
        setSbRows((prev) => prev.map((r) => r.id === reportId ? { ...r, ads_workflow_triggered: true } : r));
        addSbToast("Ads workflow triggered successfully!");
      } else {
        addSbToast("Failed to trigger. Try again.", "error");
      }
    } catch {
      addSbToast("Failed to trigger. Try again.", "error");
    }
    setSbTriggeringId(null);
  }

  function formatSbDate(iso) {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
    return `${day} ${mon} ${d.getFullYear()}`;
  }

  function truncateSb(str, len = 200) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len) + "..." : str;
  }

  function toggleSbSort(field) {
    if (sbSortField === field) setSbSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSbSortField(field); setSbSortDir("desc"); }
  }

  // ── Reusable webhook caller ──
  async function callWebhook(payload, setStatus) {
    setStatus("generating");
    setWebhookError("");
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({ ok: true }));
      const resultData = Array.isArray(data) ? data[0] : data;
      const isValid =
        resultData &&
        typeof resultData === "object" &&
        !resultData.rawResponse &&
        Object.keys(resultData).length > 0;
      return isValid ? resultData : null;
    } catch (e) {
      setStatus("error");
      setWebhookError(e.message || "Could not reach n8n");
      console.error("Webhook error:", e);
      return null;
    }
  }

  // ── Action 1: Competitor Analysis ──
  async function runCompetitorAnalysis() {
    setAnalysisData(null);
    setAnalysisError("");
    const result = await callWebhook({
      action:    "competitor_analysis",
      topic:     selectedTopic,
      timestamp: new Date().toISOString(),
    }, setAnalysisStatus);
    if (result) {
      console.log("n8n analysis response:", result);
      setAnalysisData(result);
      localStorage.setItem("lastAnalysisData", JSON.stringify(result));
      setAnalysisStatus("done");
    } else if (analysisStatus !== "error") {
      setAnalysisStatus("waiting");
    }
  }

  // ── Action 2: Generate Ad ──
  async function createAdFromAnalysis() {
    setAdData(null);
    const result = await callWebhook({
      action:            "generate_ad",
      topic:             selectedTopic,
      executive_summary: analysisData?.executive_summary   || "",
      top_hooks:         analysisData?.hooks_table         || [],
      competitors:       (analysisData?.competitors_table  || []).slice(0, 5),
      gaps:              analysisData?.gaps_table          || [],
      timestamp:         new Date().toISOString(),
    }, setAdStatus);
    if (result) {
      console.log("n8n ad response:", result);
      setAdData(result);
      setAdStatus("done");
    } else if (adStatus !== "error") {
      setAdStatus("waiting");
    }
  }

  // ── Action 3: Launch Meta Ad ──
  async function launchMetaAd() {
    const result = await callWebhook({
      action:    "launch_meta_ad",
      adData:    adData,
      budget:    budget,
      duration:  duration,
      timestamp: new Date().toISOString(),
    }, setLaunchStatus);
    // Optimistic: add to campaigns list regardless of n8n response
    setCampaigns(prev => [...prev, {
      id:       `C${Date.now()}`,
      name:     adData?.topic    || "New Campaign",
      platform: "Meta",
      budget:   `€${budget}/day`,
      duration: `${duration} days`,
      status:   "launching",
      spend:    "€0",
      ctr:      "—",
      clicks:   0,
      leads:    0,
    }]);
    if (result) setLaunchStatus("live");
    setTab("campaigns");
  }

  // ── Action 4: Stop Campaign ──
  async function stopCampaign(campaignId, campaignName) {
    setStoppedIds(prev => [...prev, campaignId]); // optimistic
    await callWebhook({
      action:       "stop_campaign",
      campaignId:   campaignId,
      campaignName: campaignName,
      timestamp:    new Date().toISOString(),
    }, setStopStatus);
  }

  // ── Action 5: Generate Report ──
  async function generateReport() {
    const result = await callWebhook({
      action:    "generate_report",
      period:    "manual",
      timestamp: new Date().toISOString(),
    }, setReportStatus);
    if (result) setReportStatus("done");
  }

  // ── Action 6: Generate Social Post ──
  async function generateSocialPost(eventName) {
    setSocialActiveEvt(eventName);
    const result = await callWebhook({
      action:     "generate_social_post",
      event:      eventName,
      platforms:  ["ig", "tiktok", "fb", "snapchat"],
      timestamp:  new Date().toISOString(),
    }, setSocialStatus);
    if (result) setSocialStatus("done");
  }

  // ── Receive n8n result ──
  function receiveAnalysisResult(data) {
    setAnalysisData(data);
    setAnalysisStatus("done");
  }

  // ── DEV: simulate n8n response ──
  function simulateAnalysisResponse() {
    receiveAnalysisResult({
      success: true,
      executive_summary:
        "Local competitors rely heavily on price discounts, creating a clear opening for premium value-based positioning. Anime and illustrative styles show 3× more engagement than traditional black-and-grey. Capturing this gap with quality-focused hooks could deliver strong CTR at lower spend.",
      competitors_table: [
        { name: "InkMaster Berlin",    ads: 14, score: 72, threat: "High",   angle: "Price discount",       hook: "15% off your first tattoo" },
        { name: "TattooVibe Studio",   ads: 9,  score: 85, threat: "High",   angle: "Anime / trend-driven", hook: "Your fave character, on skin" },
        { name: "PiercingPro",         ads: 6,  score: 54, threat: "Medium", angle: "Seasonal event",       hook: "Halloween piercing package" },
        { name: "ArtSkin Collective",  ads: 11, score: 61, threat: "Medium", angle: "Keyword targeting",    hook: "Realistic portrait near you" },
        { name: "NeedlePoint Studio",  ads: 4,  score: 38, threat: "Low",    angle: "Brand awareness",      hook: "Award-winning artists" },
      ],
      hooks_table: [
        { pattern: "Stencil peel reveal",    example: "Watch the paper peel — one take, zero edits",          reason: "High curiosity and retention in first 3 sec",   score: "9.2" },
        { pattern: "Artist sketch time-lapse", example: "From blank page to skin in 60 seconds",              reason: "Process content builds trust and saves",         score: "8.7" },
        { pattern: "Customer reaction close-up", example: "Her face when she saw the final piece",            reason: "Emotional payoff drives shares",                 score: "8.4" },
        { pattern: "Before / after split",    example: "Reference photo → finished tattoo",                   reason: "Clear transformation = strong CTA intent",      score: "8.1" },
        { pattern: "Trending audio + art",    example: "Anime piece synced to viral track",                   reason: "Algorithm boost + niche community share",       score: "7.9" },
      ],
      market_insights_table: [
        { field: "Dominant platform",  value: "Meta (Instagram Reels)" },
        { field: "Average CPC",        value: "€1.20" },
        { field: "Top ad format",      value: "Video reel — 15 sec" },
        { field: "Trending style",     value: "Anime & illustrative (+3×)" },
        { field: "Peak booking time",  value: "Thu–Sat, 6–10 pm" },
        { field: "Avg. competitor spend", value: "€60/day" },
      ],
      gaps_table: [
        { gap: "Quality vs price",       opportunity: "Counter discount-led ads with award proof",         priority: "High",   impact: "High CTR, lower CPA" },
        { gap: "Anime niche untapped",   opportunity: "Anime reel featuring your artist's style",          priority: "High",   impact: "3× organic reach potential" },
        { gap: "Seasonal hooks missing", opportunity: "Halloween piercing + costume combo campaign",       priority: "Medium", impact: "Timely spike in bookings" },
        { gap: "Realistic portraits",    opportunity: "Target 'realistic tattoo near me' keywords",       priority: "Medium", impact: "High-intent search traffic" },
        { gap: "Process transparency",   opportunity: "Behind-the-scenes studio content series",          priority: "Low",    impact: "Brand trust & retention" },
      ],
    });
  }

  // ── Approval helpers ──
  function getAdStatus(adId) {
    return adCardStatuses[adId] || "pending";
  }

  function approveAd(ad) {
    setAdCardStatuses(prev => ({ ...prev, [ad.id]: "approved" }));
    setApprovedAds(prev => [...prev.filter(a => a.id !== ad.id), ad]);
    setSchedulePickerOpen(null);
  }

  function rejectAd(adId) {
    setAdCardStatuses(prev => ({ ...prev, [adId]: "rejected" }));
    setApprovedAds(prev  => prev.filter(a => a.id !== adId));
    setScheduledAds(prev => prev.filter(a => a.id !== adId));
    setSchedulePickerOpen(null);
  }

  function scheduleAd(ad) {
    const dateInfo = scheduleDates[ad.id];
    if (!dateInfo?.date) return;
    const scheduledAt = `${dateInfo.date} ${dateInfo.time || "09:00"}`;
    setAdCardStatuses(prev => ({ ...prev, [ad.id]: "scheduled" }));
    setScheduledAds(prev => [
      ...prev.filter(a => a.id !== ad.id),
      { ...ad, scheduledAt },
    ]);
    setSchedulePickerOpen(null);
  }

  function undoAction(adId) {
    setAdCardStatuses(prev => ({ ...prev, [adId]: "pending" }));
    setApprovedAds(prev  => prev.filter(a => a.id !== adId));
    setScheduledAds(prev => prev.filter(a => a.id !== adId));
    setRejectedAds(prev  => prev.filter(a => a.id !== adId));
  }

  function approveAllPending() {
    (adData?.ad_scripts || [])
      .filter(a => getAdStatus(a.id) === "pending")
      .forEach(ad => approveAd(ad));
  }

  function rejectAllPending() {
    (adData?.ad_scripts || [])
      .filter(a => getAdStatus(a.id) === "pending")
      .forEach(ad => rejectAd(ad.id));
  }

  function countByStatus(status) {
    return (adData?.ad_scripts || []).filter(a => getAdStatus(a.id) === status).length;
  }

  function simulateAdResponse() {
    setAdData({
      topic: selectedTopic,
      headline: "Where Anime Meets Skin — Your Story, Inked Forever",
      body: "Our award-winning artists bring your favourite anime characters to life. Bold lines, vivid colour, unmatched detail. Book your consultation today.",
      cta: "Book Now",
      format: "Video reel — 15 sec",
      platform: "Meta (FB + IG)",
    });
    setAdStatus("done");
  }

  // ─── STYLES ───
  const tabStyle = (id) => ({
    padding: "8px 16px",
    borderRadius: "var(--radius-pill)",
    fontSize: 13,
    cursor: "pointer",
    border:
      tab === id
        ? "1.5px solid var(--purple)"
        : "1px solid transparent",
    background: tab === id ? "var(--purple-light)" : "transparent",
    color: tab === id ? "var(--purple)" : "var(--text-muted)",
    fontWeight: tab === id ? 600 : 400,
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "inherit",
    transition: "all 0.2s ease",
    letterSpacing: "0.01em",
  });

  const topicBtnStyle = (t) => ({
    fontSize: 12,
    padding: "6px 14px",
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    border:
      selectedTopic === t
        ? "1.5px solid var(--purple)"
        : "1px solid var(--border)",
    background:
      selectedTopic === t ? "var(--purple-light)" : "transparent",
    color:
      selectedTopic === t ? "var(--purple)" : "var(--text-muted)",
    fontWeight: selectedTopic === t ? 500 : 400,
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  });

  // ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        fontFamily: "var(--font-inter), system-ui, -apple-system, sans-serif",
        color: "var(--text)",
        maxWidth: 920,
        margin: "0 auto",
        padding: "0 20px 3rem",
      }}
    >
      {/* ── HEADER ── */}
      <div
        style={{
          padding: "20px 0 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-md)",
              background:
                "linear-gradient(135deg, var(--purple), #7C6FD8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            T
          </div>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Tattoo Studio
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              AI Automation Dashboard
            </div>
          </div>
        </div>
        <Badge text="n8n connected" color="var(--green)" bg="var(--green-light)" />
      </div>

      {/* ── NAV TABS ── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          padding: "10px 0 18px",
          borderBottom: "0.5px solid var(--border)",
          marginBottom: 18,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            style={tabStyle(t.id)}
            onClick={() => setTab(t.id)}
          >
            <span style={{ fontSize: 12, opacity: 0.7 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          OVERVIEW
      ═══════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="animate-fade-in">
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <MetricCard
              label="Live campaigns"
              value={campaigns.length || "0"}
              sub="Meta + Google"
              color="var(--purple)"
              bg="var(--purple-light)"
            />
            <MetricCard
              label="Analysis status"
              value={
                analysisStatus === "done" ? "Ready" : "Idle"
              }
              sub="Competitor intel"
              color="var(--green)"
              bg="var(--green-light)"
            />
            <MetricCard
              label="Pending approval"
              value={adData && !approved ? "1" : "0"}
              sub={
                adData && !approved
                  ? "Action needed"
                  : "All clear"
              }
              color="var(--amber)"
              bg="var(--amber-light)"
              dot={!!(adData && !approved)}
            />
            <MetricCard
              label="Stopped"
              value={stoppedIds.length}
              sub="This session"
              color="var(--blue)"
              bg="var(--blue-light)"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <Card>
              <SectionTitle>n8n Integration</SectionTitle>
              {[
                [
                  "Webhook URL",
                  "/api/trigger-n8n → n8n",
                  "var(--blue)",
                  "var(--blue-light)",
                ],
                [
                  "Analysis",
                  analysisStatus,
                  "var(--green)",
                  "var(--green-light)",
                ],
                [
                  "Ad generation",
                  adStatus,
                  "var(--green)",
                  "var(--green-light)",
                ],
                [
                  "Campaigns live",
                  campaigns.length.toString(),
                  "var(--purple)",
                  "var(--purple-light)",
                ],
              ].map(([k, v, c, bg], i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 0",
                    borderBottom:
                      i < 3
                        ? "0.5px solid var(--border-light)"
                        : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {k}
                  </span>
                  <Badge text={v} color={c} bg={bg} />
                </div>
              ))}
            </Card>

            <Card>
              <SectionTitle>Quick Actions</SectionTitle>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {[
                  ["Run competitor analysis", () => setTab("analysis"), "◎"],
                  ["Create new ad", () => setTab("create"), "◈"],
                  ["Review approvals", () => setTab("approval"), "◉"],
                  ["Live campaigns", () => setTab("campaigns"), "◷"],
                  ["Social posts", () => setTab("social"), "◫"],
                  ["Reports", () => setTab("reports"), "◧"],
                ].map(([label, fn, icon], i) => (
                  <button
                    key={i}
                    onClick={fn}
                    style={{
                      fontSize: 12,
                      padding: "9px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                      background: "var(--card-bg)",
                      color: "var(--text)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition:
                        "background 0.15s, border-color 0.15s, transform 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--purple-light)";
                      e.currentTarget.style.borderColor =
                        "var(--purple)";
                      e.currentTarget.style.color =
                        "var(--purple)";
                      e.currentTarget.style.transform =
                        "translateX(2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "var(--card-bg)";
                      e.currentTarget.style.borderColor =
                        "var(--border)";
                      e.currentTarget.style.color = "var(--text)";
                      e.currentTarget.style.transform =
                        "translateX(0)";
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ opacity: 0.5, fontSize: 11 }}>{icon}</span>
                      {label}
                    </span>
                    <span style={{ opacity: 0.4 }}>→</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          ADS ANALYSIS
      ═══════════════════════════════════════════════════════ */}
      {tab === "analysis" && (
        <div className="animate-fade-in">
          <Card style={{ marginBottom: 14 }}>
            <SectionTitle>Topic for analysis</SectionTitle>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 20,
              }}
            >
              {TOPICS.map((t) => (
                <button
                  key={t}
                  style={topicBtnStyle(t)}
                  onClick={() => setSelectedTopic(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <SectionTitle>n8n Workflow Steps</SectionTitle>
            <WorkflowStep
              step="1"
              label="Trigger webhook"
              sub={`POST → ${API_URL}/competitor_analysis`}
              active={analysisStatus === "idle"}
              done={analysisStatus !== "idle"}
            />
            <WorkflowStep
              step="2"
              label="n8n receives & scrapes competitors"
              sub="Apify actor — IG, FB, Google local studios"
              active={analysisStatus === "generating" || analysisStatus === "waiting"}
              done={analysisStatus === "done"}
            />
            <WorkflowStep
              step="3"
              label="Claude analyzes patterns in n8n"
              sub="CTR, creative type, offers, copy angles"
              active={analysisStatus === "waiting"}
              done={analysisStatus === "done"}
            />
            <WorkflowStep
              step="4"
              label="n8n POSTs results back to dashboard"
              sub="Results appear below"
              active={false}
              done={analysisStatus === "done"}
            />

            {/* TRIGGER BUTTON — shown when idle, error, or done (allow re-run) */}
            {(analysisStatus === "idle" || analysisStatus === "done" || analysisStatus === "error") && (
              <div>
                <button
                  onClick={runCompetitorAnalysis}
                  disabled={false}
                  style={{
                    width: "100%",
                    padding: "11px 18px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "var(--purple)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "background 0.2s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#3D35A0"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--purple)"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  {analysisStatus === "done"
                    ? "Re-run competitor analysis"
                    : "Trigger n8n webhook — run competitor analysis"}
                </button>
                {analysisStatus === "error" && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--red-strong)" }}>
                    Could not reach n8n: {analysisError || webhookError}. Please try again.
                  </div>
                )}
              </div>
            )}

            {/* GENERATING */}
            {analysisStatus === "generating" && (
              <div
                className="animate-slide-up"
                style={{ background: "var(--purple-light)", borderRadius: "var(--radius-md)", padding: 16, textAlign: "center" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
                  <Spinner size={14} />
                  <span style={{ fontSize: 13, color: "var(--purple)", fontWeight: 500 }}>
                    Sending to n8n...
                  </span>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--purple-dark)" }}>
                  POST {API_URL}
                </div>
              </div>
            )}

            {/* WAITING */}
            {analysisStatus === "waiting" && (
              <div className="animate-slide-up">
                <div
                  style={{
                    background: "var(--amber-light)",
                    border: "0.5px solid var(--amber)",
                    borderRadius: "var(--radius-md)",
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--amber)",
                      fontWeight: 500,
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Spinner size={12} color="var(--amber)" />
                    Webhook triggered — waiting for n8n response
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--amber-dark)",
                      lineHeight: 1.6,
                    }}
                  >
                    n8n scraping + analyzing competitors. When
                    done, n8n must POST results back here.
                    <br />
                    <strong>
                      Add a &ldquo;Respond to Webhook&rdquo; node
                      in n8n
                    </strong>{" "}
                    with the JSON format below.
                  </div>
                </div>

                {/* Expected response format */}
                <div
                  style={{
                    background: "var(--surface)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 14px",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Expected n8n response format
                  </div>
                  <pre
                    style={{
                      fontSize: 11,
                      color: "var(--text)",
                      margin: 0,
                      lineHeight: 1.7,
                      overflow: "auto",
                    }}
                  >
                    {`{
  "success": true,
  "executive_summary": "...",
  "competitors_table": [
    { "name": "...", "ads": 0, "score": 0,
      "threat": "...", "angle": "...", "hook": "..." }
  ],
  "hooks_table": [
    { "pattern": "...", "example": "...",
      "reason": "...", "score": "..." }
  ],
  "market_insights_table": [
    { "field": "...", "value": "..." }
  ],
  "gaps_table": [
    { "gap": "...", "opportunity": "...",
      "priority": "...", "impact": "..." }
  ]
}`}
                  </pre>
                </div>

                <SecondaryButton onClick={simulateAnalysisResponse}>
                  ⚙ Simulate n8n response — UI testing only
                </SecondaryButton>
              </div>
            )}

            {/* ERROR */}
            {analysisStatus === "error" && (
              <div className="animate-slide-up">
                <div
                  style={{
                    background: "var(--red-error-bg)",
                    border: "0.5px solid var(--red-error)",
                    borderRadius: "var(--radius-md)",
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--red-strong)",
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    Webhook trigger failed
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--red-dark)",
                    }}
                  >
                    {analysisError}
                  </div>
                </div>
                <SecondaryButton
                  onClick={() => setAnalysisStatus("idle")}
                >
                  Reset
                </SecondaryButton>
              </div>
            )}

            {/* DONE */}
            {analysisStatus === "done" && (
              <div
                className="animate-slide-up"
                style={{
                  background: "var(--green-light)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--green)",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>✓</span> n8n response received — results
                  below
                </div>
              </div>
            )}
          </Card>

          {/* ── RESULTS ── */}
          {analysisStatus === "done" && analysisData && (
            <div className="animate-slide-up">

              {/* 1. Executive Summary */}
              {analysisData?.executive_summary && (
                <Card style={{ marginBottom: 14 }}>
                  <SectionTitle>Executive Summary</SectionTitle>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-body)" }}>
                    {analysisData.executive_summary}
                  </div>
                </Card>
              )}

              {/* 2. Competitor Ads Table */}
              {(analysisData?.competitors_table?.length > 0) && (
                <Card style={{ marginBottom: 14 }}>
                  <SectionTitle>Competitor Ads</SectionTitle>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--surface)" }}>
                          {["Name", "Ads", "Score", "Threat", "Angle", "Hook"].map((h) => (
                            <th key={h} style={{
                              padding: "9px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: 11,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              borderBottom: "1px solid var(--border)",
                              whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisData.competitors_table.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid var(--border-light)" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--text)" }}>{row?.name}</td>
                            <td style={{ padding: "10px 12px", color: "var(--text-body)" }}>{row?.ads}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "var(--radius-pill)",
                                fontSize: 11,
                                fontWeight: 600,
                                background: row?.score >= 75 ? "var(--green-light)" : row?.score >= 50 ? "var(--amber-light)" : "var(--red-error-bg)",
                                color: row?.score >= 75 ? "var(--green)" : row?.score >= 50 ? "var(--amber)" : "var(--red-dark)",
                              }}>{row?.score}</span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <Badge
                                text={row?.threat}
                                color={row?.threat === "High" ? "var(--red-dark)" : row?.threat === "Medium" ? "var(--amber)" : "var(--green)"}
                                bg={row?.threat === "High" ? "var(--red-error-bg)" : row?.threat === "Medium" ? "var(--amber-light)" : "var(--green-light)"}
                              />
                            </td>
                            <td style={{ padding: "10px 12px", color: "var(--text-body)" }}>{row?.angle}</td>
                            <td style={{ padding: "10px 12px", color: "var(--purple)", fontStyle: "italic" }}>&ldquo;{row?.hook}&rdquo;</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* 3. Top Hook Patterns Table */}
              {(analysisData?.hooks_table?.length > 0) && (
                <Card style={{ marginBottom: 14 }}>
                  <SectionTitle>Top Hook Patterns</SectionTitle>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--surface)" }}>
                          {["Pattern", "Example", "Reason", "Score"].map((h) => (
                            <th key={h} style={{
                              padding: "9px 12px",
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: 11,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              borderBottom: "1px solid var(--border)",
                              whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisData.hooks_table.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid var(--border-light)" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap" }}>{row?.pattern}</td>
                            <td style={{ padding: "10px 12px", color: "var(--purple)", fontStyle: "italic" }}>&ldquo;{row?.example}&rdquo;</td>
                            <td style={{ padding: "10px 12px", color: "var(--text-body)", lineHeight: 1.5 }}>{row?.reason}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "var(--radius-pill)",
                                fontSize: 11,
                                fontWeight: 700,
                                background: "var(--purple-light)",
                                color: "var(--purple)",
                              }}>{row?.score}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* 4 + 5. Market Insights & Gap Opportunities — side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

                {/* 4. Market Insights Table */}
                {(analysisData?.market_insights_table?.length > 0) && (
                  <Card>
                    <SectionTitle>Market Insights</SectionTitle>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--surface)" }}>
                          {["Field", "Value"].map((h) => (
                            <th key={h} style={{
                              padding: "8px 10px",
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: 11,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              borderBottom: "1px solid var(--border)",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisData.market_insights_table.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid var(--border-light)" }}>
                            <td style={{ padding: "9px 10px", fontWeight: 500, color: "var(--text-muted)", fontSize: 11 }}>{row?.field}</td>
                            <td style={{ padding: "9px 10px", fontWeight: 500, color: "var(--text)" }}>{row?.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}

                {/* 5. Gap Opportunities Table */}
                {(analysisData?.gaps_table?.length > 0) && (
                  <Card>
                    <SectionTitle>Gap Opportunities</SectionTitle>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--surface)" }}>
                          {["Gap", "Opportunity", "Priority", "Impact"].map((h) => (
                            <th key={h} style={{
                              padding: "8px 10px",
                              textAlign: "left",
                              fontWeight: 600,
                              fontSize: 11,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              borderBottom: "1px solid var(--border)",
                              whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisData.gaps_table.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid var(--border-light)" }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <td style={{ padding: "9px 10px", fontWeight: 500, color: "var(--text)" }}>{row?.gap}</td>
                            <td style={{ padding: "9px 10px", color: "var(--text-body)", lineHeight: 1.5 }}>{row?.opportunity}</td>
                            <td style={{ padding: "9px 10px" }}>
                              <Badge
                                text={row?.priority}
                                color={row?.priority === "High" ? "var(--red-dark)" : row?.priority === "Medium" ? "var(--amber)" : "var(--green)"}
                                bg={row?.priority === "High" ? "var(--red-error-bg)" : row?.priority === "Medium" ? "var(--amber-light)" : "var(--green-light)"}
                              />
                            </td>
                            <td style={{ padding: "9px 10px", color: "var(--blue)", fontSize: 11 }}>{row?.impact}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>

              {/* Raw response fallback — shown when none of the expected tables are present */}
              {!analysisData?.competitors_table?.length &&
                !analysisData?.hooks_table?.length &&
                !analysisData?.market_insights_table?.length &&
                !analysisData?.gaps_table?.length && (
                <Card style={{ marginBottom: 14 }}>
                  <SectionTitle>n8n Raw Response</SectionTitle>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    n8n responded but no table data was found. Raw output:
                  </div>
                  <pre style={{
                    fontSize: 11,
                    background: "var(--surface)",
                    borderRadius: "var(--radius-md)",
                    padding: 12,
                    overflow: "auto",
                    maxHeight: 300,
                    margin: 0,
                    color: "var(--text)",
                    lineHeight: 1.6,
                  }}>
                    {JSON.stringify(analysisData, null, 2)}
                  </pre>
                </Card>
              )}

              <div>
                <button
                  onClick={createAdFromAnalysis}
                  disabled={adStatus === "generating" || adStatus === "waiting"}
                  style={{
                    padding: "11px 18px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: adStatus === "generating" || adStatus === "waiting" ? "var(--purple-light)" : "var(--purple)",
                    color: adStatus === "generating" || adStatus === "waiting" ? "var(--purple)" : "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: adStatus === "generating" || adStatus === "waiting" ? "not-allowed" : "pointer",
                    opacity: adStatus === "generating" || adStatus === "waiting" ? 0.7 : 1,
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "background 0.2s",
                  }}
                >
                  {adStatus === "generating" ? <><Spinner size={12} color="var(--purple)" /> Sending to n8n...</> :
                   adStatus === "waiting"    ? <><Spinner size={12} color="var(--purple)" /> Generating ad...</> :
                   "Create ad based on this analysis →"}
                </button>
                {adStatus === "waiting" && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--amber)" }}>
                    n8n is generating your ad using the analysis data. Results will appear in the Create Ad tab when ready.
                  </div>
                )}
                {adStatus === "error" && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--red-strong)" }}>
                    Could not reach n8n: {webhookError}. Please try again.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          CREATE AD
      ═══════════════════════════════════════════════════════ */}
      {tab === "create" && (
        <div className="animate-fade-in">
          {!analysisData && (
            <div
              style={{
                background: "var(--amber-light)",
                border: "0.5px solid var(--amber)",
                borderRadius: "var(--radius-md)",
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "var(--amber)",
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                No competitor analysis yet
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--amber-dark)",
                }}
              >
                Run competitor analysis first so AI can create a
                better ad based on real data.
              </div>
            </div>
          )}

          <Card style={{ marginBottom: 14 }}>
            <SectionTitle>Select topic</SectionTitle>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 20,
              }}
            >
              {TOPICS.map((t) => (
                <button
                  key={t}
                  style={topicBtnStyle(t)}
                  onClick={() => setSelectedTopic(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <SectionTitle>n8n Workflow Steps</SectionTitle>
            <WorkflowStep
              step="1"
              label="Topic + analysis data sent to n8n"
              sub="Competitor brief + topic = better ad"
              active={adStatus === "idle"}
              done={adStatus !== "idle"}
            />
            <WorkflowStep
              step="2"
              label="Claude generates ad copy"
              sub="Using top hook patterns and ready templates"
              active={adStatus === "waiting"}
              done={adStatus === "done"}
            />
            <WorkflowStep
              step="3"
              label="Runway ML video / DALL-E image"
              sub="15-sec reel or static visual"
              active={adStatus === "waiting"}
              done={adStatus === "done"}
            />
            <WorkflowStep
              step="4"
              label="Ready ad sent to Approval tab"
              sub="You confirm budget & launch"
              active={false}
              done={adStatus === "done"}
            />

            <div>
              <button
                onClick={createAdFromAnalysis}
                disabled={adStatus === "generating" || adStatus === "waiting"}
                style={{
                  width: "100%",
                  padding: "11px 18px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: adStatus === "generating" || adStatus === "waiting" ? "var(--surface)" : "var(--purple)",
                  color: adStatus === "generating" || adStatus === "waiting" ? "var(--purple)" : "#fff",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: adStatus === "generating" || adStatus === "waiting" ? "not-allowed" : "pointer",
                  opacity: adStatus === "generating" || adStatus === "waiting" ? 0.7 : 1,
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "background 0.2s",
                }}
              >
                {adStatus === "generating" ? <><Spinner size={12} color="var(--purple)" /> Sending to n8n...</> :
                 adStatus === "waiting"    ? <><Spinner size={12} color="var(--purple)" /> Generating ad...</> :
                 "Generate ad — trigger n8n"}
              </button>
              {adStatus === "waiting" && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--amber)" }}>
                  n8n is generating your ad. Results will appear here when ready.
                </div>
              )}
              {adStatus === "error" && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--red-strong)" }}>
                  Could not reach n8n: {webhookError}. Please try again.
                </div>
              )}
            </div>
          </Card>

          {adStatus === "waiting" && !adData && (
            <Card style={{ marginBottom: 14 }}>
              <div
                style={{
                  background: "var(--amber-light)",
                  borderRadius: "var(--radius-md)",
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--amber)",
                    fontWeight: 500,
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Spinner size={12} color="var(--amber)" />
                  n8n generating ad — please wait
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--amber-dark)",
                  }}
                >
                  When Claude + Runway ML complete, n8n will POST
                  the ad here.
                </div>
              </div>
              <SecondaryButton onClick={simulateAdResponse}>
                ⚙ Simulate n8n ad response — UI testing only
              </SecondaryButton>
            </Card>
          )}

          {/* Top hook patterns reference — shown when analysis data available */}
          {adStatus === "idle" && analysisData?.hooks_table?.length > 0 && (
            <Card style={{ marginBottom: 14 }}>
              <SectionTitle>Top Hook Patterns from Analysis</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(analysisData.hooks_table || []).map((row, idx) => (
                  <div key={idx} style={{ padding: "10px 12px", background: "var(--surface)", borderRadius: "var(--radius-md)", fontSize: 12, lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 600, color: "var(--purple)", marginBottom: 3 }}>{row?.pattern}</div>
                    <div style={{ color: "var(--text-body)", fontStyle: "italic" }}>&ldquo;{row?.example}&rdquo;</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {adData && (
            <Card>
              <SectionTitle>
                Generated ad — {adData.topic}
              </SectionTitle>
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginBottom: 4,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontWeight: 500,
                  }}
                >
                  Headline
                </div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {adData.headline}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginBottom: 4,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontWeight: 500,
                  }}
                >
                  Body
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-body)",
                    lineHeight: 1.7,
                  }}
                >
                  {adData.body}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginBottom: 18,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-dim)",
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: 500,
                    }}
                  >
                    CTA
                  </div>
                  <Badge
                    text={adData.cta}
                    color="var(--green)"
                    bg="var(--green-light)"
                  />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-dim)",
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: 500,
                    }}
                  >
                    Format
                  </div>
                  <Badge
                    text={adData.format}
                    color="var(--blue)"
                    bg="var(--blue-light)"
                  />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-dim)",
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontWeight: 500,
                    }}
                  >
                    Platform
                  </div>
                  <Badge
                    text={adData.platform}
                    color="var(--purple)"
                    bg="var(--purple-light)"
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  setApproved(false);
                  setTab("approval");
                }}
                style={{
                  width: "100%",
                  background: "var(--green)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition:
                    "background 0.2s, transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#0C5A47";
                  e.currentTarget.style.transform =
                    "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(15,110,86,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "var(--green)";
                  e.currentTarget.style.transform =
                    "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Send to approval →
              </button>
            </Card>
          )}

          {/* ── AD PREVIEWS ── */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionTitle>Ad Previews</SectionTitle>
              <button
                onClick={fetchAdVideos}
                disabled={adVideosRefreshing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: adVideosRefreshing ? "not-allowed" : "pointer",
                  opacity: adVideosRefreshing ? 0.6 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                <span style={{ display: "inline-block", animation: adVideosRefreshing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
                {adVideosRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {adVideos.map((ad) => (
                <Card key={ad.bucket} style={{ padding: 12 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      marginBottom: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {ad.label}
                  </div>
                  <div
                    style={{
                      background: "var(--surface)",
                      borderRadius: "var(--radius-md)",
                      aspectRatio: "9/16",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {ad.file ? (
                      <video
                        key={ad.file}
                        src={`https://nidoqmcxmlyiovdktzxg.supabase.co/storage/v1/object/public/${ad.bucket}/${ad.file}`}
                        controls
                        autoPlay={false}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No video yet</span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          APPROVAL
      ═══════════════════════════════════════════════════════ */}
      {tab === "approval" && (
        <div className="animate-fade-in">

          {/* No ads yet */}
          {(!adData || !adData.ad_scripts || adData.ad_scripts.length === 0) && (
            <div style={{ textAlign: "center", padding: "32px 16px",
              color: "var(--text-muted)", fontSize: 13 }}>
              No ads waiting for approval. Generate ads first in the Create Ad tab.
            </div>
          )}

          {adData?.ad_scripts?.length > 0 && (
            <>
              {/* Summary metric cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)",
                gap: 8, marginBottom: 14 }}>
                {[
                  { label: "Pending",   count: countByStatus("pending"),   bg: "#F1EFE8", color: "#5F5E5A" },
                  { label: "Approved",  count: countByStatus("approved"),  bg: "#E1F5EE", color: "#0F6E56" },
                  { label: "Scheduled", count: countByStatus("scheduled"), bg: "#FAEEDA", color: "#854F0B" },
                  { label: "Rejected",  count: countByStatus("rejected"),  bg: "#FCEBEB", color: "#A32D2D" },
                ].map(c => (
                  <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: c.color,
                      textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: c.color }}>{c.count}</div>
                  </div>
                ))}
              </div>

              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {[
                  { key: "all",       label: `All (${(adData.ad_scripts || []).length})` },
                  { key: "pending",   label: `Pending (${countByStatus("pending")})` },
                  { key: "approved",  label: `Approved (${countByStatus("approved")})` },
                  { key: "scheduled", label: `Scheduled (${countByStatus("scheduled")})` },
                  { key: "rejected",  label: `Rejected (${countByStatus("rejected")})` },
                ].map(t => (
                  <button key={t.key} onClick={() => setApprovalFilter(t.key)} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: approvalFilter === t.key ? 500 : 400,
                    border: approvalFilter === t.key ? "1.5px solid #534AB7" : "0.5px solid var(--border)",
                    background: approvalFilter === t.key ? "#EEEDFE" : "transparent",
                    color: approvalFilter === t.key ? "#534AB7" : "var(--text-muted)",
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Bulk action buttons */}
              {countByStatus("pending") > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button onClick={approveAllPending} style={{ fontSize: 12, padding: "7px 14px",
                    borderRadius: 8, border: "none", background: "#0F6E56",
                    color: "white", cursor: "pointer", fontWeight: 500, fontFamily: "inherit" }}>
                    Approve all pending
                  </button>
                  <button onClick={rejectAllPending} style={{ fontSize: 12, padding: "7px 14px",
                    borderRadius: 8, border: "0.5px solid #E24B4A",
                    background: "#FCEBEB", color: "#A32D2D", cursor: "pointer",
                    fontWeight: 500, fontFamily: "inherit" }}>
                    Reject all pending
                  </button>
                </div>
              )}

              {/* Scheduled queue panel */}
              {scheduledAds.length > 0 && (
                <div style={{ background: "#FAEEDA", border: "0.5px solid #EF9F27",
                  borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#854F0B", marginBottom: 8 }}>
                    Scheduled queue — {scheduledAds.length} ad{scheduledAds.length > 1 ? "s" : ""} waiting
                  </div>
                  {scheduledAds.map((a, i) => (
                    <div key={a.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "5px 0",
                      borderBottom: i < scheduledAds.length - 1 ? "0.5px solid rgba(239,159,39,0.3)" : "none",
                      fontSize: 12, color: "#633806",
                    }}>
                      <span>{a.topic}</span>
                      <span style={{ fontWeight: 500 }}>{a.scheduledAt}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ad cards */}
              {(adData.ad_scripts || [])
                .filter(ad => approvalFilter === "all" || getAdStatus(ad.id) === approvalFilter)
                .map(ad => {
                  const status     = getAdStatus(ad.id);
                  const isActioned = status !== "pending";
                  const schedInfo  = scheduledAds.find(a => a.id === ad.id);
                  const dateVal    = scheduleDates[ad.id]?.date || "";
                  const timeVal    = scheduleDates[ad.id]?.time || "09:00";
                  const borderColor =
                    status === "approved"  ? "#5DCAA5" :
                    status === "rejected"  ? "#F09595" :
                    status === "scheduled" ? "#EF9F27" :
                    "var(--border)";

                  return (
                    <div key={ad.id} style={{
                      background: "var(--card-bg)",
                      border: `1px solid ${borderColor}`,
                      borderRadius: 12, padding: 16, marginBottom: 12,
                      opacity: status === "rejected" ? 0.55 : 1,
                      transition: "all 0.2s",
                    }}>

                      {/* Card header */}
                      <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{ad.topic}</span>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 500,
                              background: ad.ad_type === "video" ? "#EEEDFE" : "#E6F1FB",
                              color: ad.ad_type === "video" ? "#534AB7" : "#185FA5" }}>
                              {ad.ad_type === "video" ? "Video" : "Image"}
                            </span>
                            {ad.framework && (
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20,
                                background: "#F1EFE8", color: "#5F5E5A", fontWeight: 500 }}>
                                {ad.framework}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {ad.target_audience}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px",
                          borderRadius: 20, whiteSpace: "nowrap",
                          background:
                            status === "approved"  ? "#E1F5EE" :
                            status === "rejected"  ? "#FCEBEB" :
                            status === "scheduled" ? "#FAEEDA" : "#F1EFE8",
                          color:
                            status === "approved"  ? "#0F6E56" :
                            status === "rejected"  ? "#A32D2D" :
                            status === "scheduled" ? "#854F0B" : "#5F5E5A",
                          border: `1px solid ${borderColor}`,
                        }}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </div>

                      {/* Media preview */}
                      {(ad.image_url || ad.video_url) && (
                        <div style={{ background: "var(--surface)", borderRadius: 8,
                          height: 100, marginBottom: 10, display: "flex",
                          alignItems: "center", justifyContent: "center",
                          overflow: "hidden", position: "relative" }}>
                          {ad.image_url && (
                            <img src={ad.image_url} alt={ad.topic}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          )}
                          {ad.ad_type === "video" && (
                            <div style={{ position: "absolute", background: "rgba(0,0,0,0.35)",
                              borderRadius: "50%", width: 32, height: 32,
                              display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <div style={{ width: 0, height: 0,
                                borderTop: "7px solid transparent",
                                borderBottom: "7px solid transparent",
                                borderLeft: "12px solid white", marginLeft: 2 }} />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Hook */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Hook</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{ad.hook}</div>
                      </div>

                      {/* Body copy */}
                      {ad.body_copy && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Body copy</div>
                          <div style={{ fontSize: 12, color: "var(--text-body)", lineHeight: 1.5 }}>
                            {ad.body_copy}
                          </div>
                        </div>
                      )}

                      {/* Script for video */}
                      {ad.script && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Script</div>
                          <div style={{ fontSize: 11, fontFamily: "monospace", lineHeight: 1.6,
                            background: "var(--surface)", padding: "8px 10px", borderRadius: 6,
                            color: "var(--text-body)" }}>
                            {ad.script}
                          </div>
                        </div>
                      )}

                      {/* CTA */}
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20,
                          background: "#E1F5EE", color: "#0F6E56",
                          border: "0.5px solid #5DCAA5", fontWeight: 500 }}>
                          CTA: {ad.cta}
                        </span>
                      </div>

                      {/* Schedule picker */}
                      {schedulePickerOpen === ad.id && (
                        <div style={{ background: "#FAEEDA", border: "0.5px solid #EF9F27",
                          borderRadius: 8, padding: 12, marginBottom: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#854F0B", marginBottom: 8 }}>
                            Schedule this ad
                          </div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#854F0B", marginBottom: 3 }}>Date</div>
                              <input type="date" value={dateVal}
                                onChange={e => setScheduleDates(prev => ({
                                  ...prev, [ad.id]: { ...prev[ad.id], date: e.target.value },
                                }))}
                                style={{ width: "100%", fontSize: 12, padding: "6px 8px",
                                  borderRadius: 6, border: "1px solid #EF9F27",
                                  background: "white", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#854F0B", marginBottom: 3 }}>Time</div>
                              <input type="time" value={timeVal}
                                onChange={e => setScheduleDates(prev => ({
                                  ...prev, [ad.id]: { ...prev[ad.id], time: e.target.value },
                                }))}
                                style={{ width: "100%", fontSize: 12, padding: "6px 8px",
                                  borderRadius: 6, border: "1px solid #EF9F27",
                                  background: "white", boxSizing: "border-box" }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => scheduleAd(ad)}
                              style={{ flex: 1, padding: "7px", borderRadius: 6, border: "none",
                                background: "#854F0B", color: "white",
                                fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                              Confirm schedule
                            </button>
                            <button onClick={() => setSchedulePickerOpen(null)}
                              style={{ padding: "7px 12px", borderRadius: 6,
                                border: "0.5px solid #EF9F27", background: "white",
                                color: "#854F0B", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Scheduled time display */}
                      {status === "scheduled" && schedInfo?.scheduledAt && (
                        <div style={{ background: "#FAEEDA", borderRadius: 6,
                          padding: "6px 10px", marginBottom: 10,
                          fontSize: 12, color: "#854F0B" }}>
                          Scheduled for: <strong>{schedInfo.scheduledAt}</strong>
                        </div>
                      )}

                      {/* Action buttons */}
                      {!isActioned ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => approveAd(ad)}
                            style={{ flex: 1, padding: 9, borderRadius: 8, border: "none",
                              background: "#0F6E56", color: "white",
                              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                            Approve
                          </button>
                          <button onClick={() => setSchedulePickerOpen(
                              schedulePickerOpen === ad.id ? null : ad.id
                            )}
                            style={{ flex: 1, padding: 9, borderRadius: 8,
                              border: "0.5px solid #EF9F27", background: "#FAEEDA",
                              color: "#854F0B", fontSize: 13, fontWeight: 500,
                              cursor: "pointer", fontFamily: "inherit" }}>
                            Schedule
                          </button>
                          <button onClick={() => rejectAd(ad.id)}
                            style={{ flex: 1, padding: 9, borderRadius: 8,
                              border: "0.5px solid #E24B4A", background: "#FCEBEB",
                              color: "#A32D2D", fontSize: 13, fontWeight: 500,
                              cursor: "pointer", fontFamily: "inherit" }}>
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => undoAction(ad.id)}
                            style={{ padding: "7px 14px", borderRadius: 8,
                              border: "0.5px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--text-muted)", fontSize: 12,
                              cursor: "pointer", fontFamily: "inherit" }}>
                            Undo
                          </button>
                          {status === "scheduled" && (
                            <button onClick={() => setSchedulePickerOpen(ad.id)}
                              style={{ padding: "7px 14px", borderRadius: 8,
                                border: "0.5px solid #EF9F27", background: "#FAEEDA",
                                color: "#854F0B", fontSize: 12,
                                cursor: "pointer", fontFamily: "inherit" }}>
                              Change time
                            </button>
                          )}
                          {status === "approved" && (
                            <button onClick={() => setTab("campaigns")}
                              style={{ padding: "7px 14px", borderRadius: 8, border: "none",
                                background: "#534AB7", color: "white",
                                fontSize: 12, fontWeight: 500,
                                cursor: "pointer", fontFamily: "inherit" }}>
                              Set budget &amp; launch
                            </button>
                          )}
                        </div>
                      )}

                    </div>
                  );
                })}

            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          LIVE CAMPAIGNS
      ═══════════════════════════════════════════════════════ */}
      {tab === "campaigns" && (
        <div className="animate-fade-in">
          {campaigns.length === 0 ? (
            <Card>
              <EmptyState
                title="No live campaigns"
                sub="Approve and launch an ad from the Approval tab."
              />
            </Card>
          ) : (
            campaigns.map((c, idx) => {
              const stopped = stoppedIds.includes(c.id);
              return (
                <Card
                  key={c.id}
                  style={{
                    marginBottom: 12,
                    animationDelay: `${idx * 0.05}s`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          marginBottom: 3,
                        }}
                      >
                        {c.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                        }}
                      >
                        {c.platform} · {c.budget} · {c.duration}
                      </div>
                    </div>
                    <Badge
                      text={
                        stopped
                          ? "Stopped"
                          : c.status === "launching"
                          ? "Launching..."
                          : "Live"
                      }
                      color={
                        stopped
                          ? "var(--red-dark)"
                          : c.status === "launching"
                          ? "var(--amber)"
                          : "var(--green)"
                      }
                      bg={
                        stopped
                          ? "var(--red-error-bg)"
                          : c.status === "launching"
                          ? "var(--amber-light)"
                          : "var(--green-light)"
                      }
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(4, 1fr)",
                      gap: 12,
                      marginBottom: 14,
                      padding: "12px 0",
                      borderTop:
                        "0.5px solid var(--border-light)",
                      borderBottom:
                        "0.5px solid var(--border-light)",
                    }}
                  >
                    {[
                      ["Spend", c.spend],
                      ["CTR", c.ctr],
                      ["Clicks", c.clicks],
                      ["Leads", c.leads],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-dim)",
                            marginBottom: 3,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            fontWeight: 500,
                          }}
                        >
                          {k}
                        </div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!stopped && (
                    <button
                      onClick={() => stopCampaign(c.id, c.name)}
                      disabled={stopStatus === "stopping"}
                      style={{
                        fontSize: 12,
                        padding: "8px 18px",
                        borderRadius: "var(--radius-sm)",
                        border: "0.5px solid var(--red)",
                        background: stopStatus === "stopping" ? "var(--surface)" : "var(--red-light)",
                        color: "var(--red)",
                        cursor: stopStatus === "stopping" ? "not-allowed" : "pointer",
                        opacity: stopStatus === "stopping" ? 0.6 : 1,
                        fontWeight: 500,
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "background 0.15s, transform 0.15s",
                      }}
                      onMouseEnter={(e) => { if (stopStatus !== "stopping") { e.currentTarget.style.background = "#F5DDD4"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = stopStatus === "stopping" ? "var(--surface)" : "var(--red-light)"; e.currentTarget.style.transform = "translateY(0)"; }}
                    >
                      {stopStatus === "stopping"
                        ? <><Spinner size={10} color="var(--red)" /> Stopping...</>
                        : "Stop campaign — n8n Meta API call"}
                    </button>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          SOCIAL POSTS
      ═══════════════════════════════════════════════════════ */}
      {tab === "social" && (
        <div className="animate-fade-in">
          <Card>
            <SectionTitle>
              Upcoming events &amp; special days — auto-detected by n8n
            </SectionTitle>
            {[
              { event: "Halloween",               date: "Thu 31 Oct", type: "Holiday",          status: "scheduled" },
              { event: "Friday the 13th",          date: "Fri 13 Dec", type: "Tattoo tradition", status: "scheduled" },
              { event: "Black Friday",             date: "Fri 29 Nov", type: "Discount day",     status: "draft" },
              { event: "Berlin Tattoo Convention", date: "Sat 9 Nov",  type: "Local event",      status: "draft" },
            ].map((e, i, arr) => {
              const isActive = socialActiveEvt === e.event && (socialStatus === "generating" || socialStatus === "waiting");
              const isDone   = socialActiveEvt === e.event && socialStatus === "done";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: i < arr.length - 1 ? "0.5px solid var(--border-light)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.event}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{e.date} · {e.type}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge
                      text={isDone ? "Posted" : e.status}
                      color={isDone ? "var(--green)" : e.status === "scheduled" ? "var(--green)" : "var(--amber)"}
                      bg={isDone ? "var(--green-light)" : e.status === "scheduled" ? "var(--green-light)" : "var(--amber-light)"}
                    />
                    <button
                      onClick={() => generateSocialPost(e.event)}
                      disabled={isActive || isDone}
                      style={{
                        fontSize: 11,
                        padding: "5px 12px",
                        borderRadius: "var(--radius-pill)",
                        border: "1px solid var(--purple)",
                        background: isActive || isDone ? "var(--purple-light)" : "transparent",
                        color: "var(--purple)",
                        cursor: isActive || isDone ? "not-allowed" : "pointer",
                        opacity: isActive || isDone ? 0.6 : 1,
                        fontWeight: 500,
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "background 0.15s",
                      }}
                    >
                      {isActive ? <><Spinner size={9} color="var(--purple)" /> Generating...</> :
                       isDone   ? "✓ Done" :
                       "Generate post"}
                    </button>
                  </div>
                </div>
              );
            })}

            {socialStatus === "error" && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--red-strong)" }}>
                Could not reach n8n: {webhookError}. Please try again.
              </div>
            )}

            {analysisData?.gaps_table?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <SectionTitle>Top Opportunities from Analysis</SectionTitle>
                <div style={{ background: "var(--purple-light)", padding: 14, borderRadius: "var(--radius-md)" }}>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--purple-dark)", lineHeight: 1.6 }}>
                    {(analysisData.gaps_table || []).map((row, idx) => (
                      <li key={idx} style={{ marginBottom: 4 }}><strong>{row?.gap}:</strong> {row?.opportunity}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          REPORTS — Supabase Intelligence Dashboard
      ═══════════════════════════════════════════════════════ */}
      {tab === "reports" && (
        <div className="animate-fade-in">
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Competitor Ads Intelligence</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "dotPulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Connected to Supabase</span>
              </div>
            </div>
            <div>
              <button
                onClick={generateReport}
                disabled={reportStatus === "generating" || reportStatus === "waiting"}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: reportStatus === "done" ? "var(--green)" : reportStatus === "generating" || reportStatus === "waiting" ? "var(--surface)" : "var(--purple)",
                  color: reportStatus === "generating" || reportStatus === "waiting" ? "var(--purple)" : "#fff",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: reportStatus === "generating" || reportStatus === "waiting" ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "background 0.2s",
                }}
              >
                {reportStatus === "generating" || reportStatus === "waiting"
                  ? <><Spinner size={12} color="var(--purple)" /> Generating...</>
                  : reportStatus === "done"
                  ? "✓ Report triggered"
                  : "Manual report trigger"}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
            <MetricCard label="Total Reports" value={sbTotalReports} sub="From Supabase" color="var(--purple)" bg="var(--purple-light)" />
            <MetricCard label="Competitors Tracked" value={sbTotalCompetitors} sub="All reports" color="var(--blue)" bg="var(--blue-light)" />
            <MetricCard label="High Threats" value={sbHighThreats} sub="Needs attention" color="var(--red)" bg="var(--red-light)" dot={sbHighThreats > 0} />
            <MetricCard label="Pending Ads" value={sbPendingAds} sub="Not yet triggered" color="var(--amber)" bg="var(--amber-light)" dot={sbPendingAds > 0} />
          </div>

          {/* Loading state */}
          {sbLoading && (
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 30 }}>
                <Spinner size={16} />
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading reports from Supabase...</span>
              </div>
            </Card>
          )}

          {/* Empty state */}
          {!sbLoading && sbReports.length === 0 && (
            <Card>
              <EmptyState
                title="No reports yet"
                sub="Run your n8n workflow to generate one. Reports will appear here automatically."
              />
            </Card>
          )}

          {/* Report cards */}
          {!sbLoading && sbReports.map(({ row, report }) => {
            const competitors = report.competitors_table || [];
            const hooks = report.hooks_table || [];
            const insights = report.market_insights_table || [];
            const gaps = report.gaps_table || [];
            const competitorCount = competitors.length;
            const highCount = competitors.filter((c) => c.threat === "high").length;
            const mediumCount = competitors.filter((c) => c.threat === "medium").length;
            const gapsCount = gaps.length;
            const triggered = row.ads_workflow_triggered;
            const isTriggering = sbTriggeringId === row.id;
            const insightsOpen = sbExpandedInsights[row.id];
            const adsConfigOpen = sbAdsConfigOpen[row.id];
            const adsConfig = getAdsConfig(row.id);

            return (
              <Card key={row.id} style={{ marginBottom: 14 }}>
                {/* Top row: date + status */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>
                    {formatSbDate(row.created_at)}
                  </span>
                  <Badge
                    text={triggered ? "Ads Created" : "Pending"}
                    color={triggered ? "var(--green)" : "var(--text-muted)"}
                    bg={triggered ? "var(--green-light)" : "var(--surface)"}
                  />
                </div>

                {/* Executive summary */}
                <p style={{ fontSize: 13, color: "var(--text-body)", lineHeight: 1.7, marginBottom: 14 }}>
                  {report.executive_summary || "No summary available."}
                </p>

                {/* Tags */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  <Badge text={`${competitorCount} competitors`} color="var(--blue)" bg="var(--blue-light)" />
                  {highCount > 0 && <Badge text={`${highCount} high threat`} color="var(--red)" bg="var(--red-light)" />}
                  {mediumCount > 0 && <Badge text={`${mediumCount} medium threat`} color="var(--amber)" bg="var(--amber-light)" />}
                  <Badge text={`${hooks.length} hooks`} color="var(--purple)" bg="var(--purple-light)" />
                  <Badge text={`${gapsCount} gaps`} color="var(--amber)" bg="var(--amber-light)" />
                </div>

                {/* ── INLINE: Top Competitors (always visible) ── */}
                {competitors.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      Top Competitors
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {competitors.slice(0, 5).map((c, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: "var(--radius-sm)",
                          background: "var(--surface)", border: "0.5px solid var(--border-light)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, width: 18 }}>{i + 1}</span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.ads} ads</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                                <div style={{
                                  height: "100%", borderRadius: 2,
                                  width: `${((c.score || 0) / 12) * 100}%`,
                                  background: c.score >= 9 ? "var(--red-error)" : c.score >= 6 ? "var(--amber)" : "var(--green)",
                                }} />
                              </div>
                              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.score}/12</span>
                            </div>
                            <Badge
                              text={c.threat}
                              color={c.threat === "high" ? "var(--red)" : c.threat === "medium" ? "var(--amber)" : "var(--green)"}
                              bg={c.threat === "high" ? "var(--red-light)" : c.threat === "medium" ? "var(--amber-light)" : "var(--green-light)"}
                            />
                          </div>
                        </div>
                      ))}
                      {competitors.length > 5 && (
                        <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", padding: 4 }}>
                          +{competitors.length - 5} more — click &ldquo;View Full Report&rdquo; to see all
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── INLINE: Top Hooks (always visible) ── */}
                {hooks.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      Top Hooks
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {hooks.slice(0, 4).map((h, i) => (
                        <div key={i} style={{
                          padding: "10px 12px", borderRadius: "var(--radius-sm)",
                          background: "var(--surface)", border: "0.5px solid var(--border-light)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{h.pattern}</span>
                            <Badge
                              text={h.score}
                              color={(h.score || "").toLowerCase() === "strong" ? "var(--green)" : (h.score || "").toLowerCase() === "moderate" ? "var(--amber)" : "var(--text-muted)"}
                              bg={(h.score || "").toLowerCase() === "strong" ? "var(--green-light)" : (h.score || "").toLowerCase() === "moderate" ? "var(--amber-light)" : "var(--surface)"}
                            />
                          </div>
                          <p style={{ fontSize: 11, fontStyle: "italic", color: "var(--amber)", lineHeight: 1.5 }}>
                            &ldquo;{h.example}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── INLINE: Top Gaps (always visible) ── */}
                {gaps.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      Gaps & Opportunities
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[...gaps].sort((a, b) => {
                        const order = { high: 0, medium: 1, low: 2 };
                        return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
                      }).slice(0, 3).map((g, i) => (
                        <div key={i} style={{
                          padding: "10px 12px", borderRadius: "var(--radius-sm)",
                          background: "var(--surface)", border: "0.5px solid var(--border-light)",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <Badge
                              text={g.priority?.toUpperCase()}
                              color={g.priority === "high" ? "var(--red)" : g.priority === "medium" ? "var(--amber)" : "var(--green)"}
                              bg={g.priority === "high" ? "var(--red-light)" : g.priority === "medium" ? "var(--amber-light)" : "var(--green-light)"}
                            />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{g.gap}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 5, paddingLeft: 2 }}>
                            <span style={{ fontSize: 11 }}>💡</span>
                            <p style={{ fontSize: 11, color: "var(--text-body)", lineHeight: 1.5 }}>{g.opportunity}</p>
                          </div>
                        </div>
                      ))}
                      {gaps.length > 3 && (
                        <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", padding: 4 }}>
                          +{gaps.length - 3} more gaps — click &ldquo;View Full Report&rdquo; to see all
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <SecondaryButton
                    onClick={() => setSbExpandedInsights((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                  >
                    {insightsOpen ? "Hide Insights" : "View Insights"}
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={() => { setSbModalReport({ row, report }); setSbModalTab("competitors"); }}
                  >
                    View Full Report
                  </SecondaryButton>
                  {triggered ? (
                    <span style={{
                      padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, fontWeight: 500,
                      background: "var(--green-light)", color: "var(--green)", display: "inline-flex", alignItems: "center", gap: 4,
                    }}>
                      Ads Triggered ✓
                    </span>
                  ) : (
                    <button
                      onClick={() => setSbAdsConfigOpen((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                      style={{
                        padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none",
                        background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                        fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
                        transition: "opacity 0.2s, transform 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                    >
                      {adsConfigOpen ? "Cancel" : "Generate Ads →"}
                    </button>
                  )}
                </div>

                {/* ── Video Configuration Panel ── */}
                {adsConfigOpen && !triggered && (
                  <div className="animate-slide-down" style={{
                    marginTop: 14, padding: 18, borderRadius: "var(--radius-md)",
                    background: "var(--surface)", border: "0.5px solid var(--border-light)",
                  }}>
                    {/* Number of Ads */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        Number of Ads to Generate
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={adsConfig.numAds}
                        onChange={(e) => setNumAds(row.id, parseInt(e.target.value) || 1)}
                        style={{
                          width: 70, padding: "8px 10px", borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)", background: "var(--card-bg)",
                          color: "var(--text)", fontSize: 13, fontFamily: "inherit", fontWeight: 500,
                          outline: "none", transition: "border-color 0.15s",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--purple)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                      />
                    </div>

                    {/* Video configs */}
                    {adsConfig.videos.map((video, vIdx) => (
                      <div key={vIdx} style={{
                        padding: 16, borderRadius: "var(--radius-md)", marginBottom: 12,
                        background: "var(--card-bg)", border: "0.5px solid var(--border)",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 15 }}>🎬</span> Video {vIdx + 1} Configuration
                        </div>

                        {/* Row 1: Video Type + Duration */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                              Video Type
                            </div>
                            <select
                              value={video.videoType}
                              onChange={(e) => updateVideoConfig(row.id, vIdx, "videoType", e.target.value)}
                              style={{
                                width: "100%", padding: "9px 10px", borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border)", background: "var(--card-bg)",
                                color: "var(--text)", fontSize: 12, fontFamily: "inherit",
                                outline: "none", cursor: "pointer", appearance: "auto",
                              }}
                            >
                              {VIDEO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                              Duration
                            </div>
                            <select
                              value={video.duration}
                              onChange={(e) => updateVideoConfig(row.id, vIdx, "duration", e.target.value)}
                              style={{
                                width: "100%", padding: "9px 10px", borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border)", background: "var(--card-bg)",
                                color: "var(--text)", fontSize: 12, fontFamily: "inherit",
                                outline: "none", cursor: "pointer", appearance: "auto",
                              }}
                            >
                              {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Row 2: Audio Style + Video Style */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                              Audio Style
                            </div>
                            <select
                              value={video.audioStyle}
                              onChange={(e) => updateVideoConfig(row.id, vIdx, "audioStyle", e.target.value)}
                              style={{
                                width: "100%", padding: "9px 10px", borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border)", background: "var(--card-bg)",
                                color: "var(--text)", fontSize: 12, fontFamily: "inherit",
                                outline: "none", cursor: "pointer", appearance: "auto",
                              }}
                            >
                              {AUDIO_STYLES.map((a) => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                              Video Style
                            </div>
                            <select
                              value={video.videoStyle}
                              onChange={(e) => updateVideoConfig(row.id, vIdx, "videoStyle", e.target.value)}
                              style={{
                                width: "100%", padding: "9px 10px", borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--border)", background: "var(--card-bg)",
                                color: "var(--text)", fontSize: 12, fontFamily: "inherit",
                                outline: "none", cursor: "pointer", appearance: "auto",
                              }}
                            >
                              {VIDEO_STYLES.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Video Idea */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                            Video Idea
                          </div>
                          <textarea
                            placeholder="e.g. generate a video with offer and sales ads, customer review and about service..."
                            value={video.videoIdea}
                            onChange={(e) => updateVideoConfig(row.id, vIdx, "videoIdea", e.target.value)}
                            style={{
                              width: "100%", minHeight: 60, padding: "10px 12px",
                              borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                              background: "var(--card-bg)", color: "var(--text)", fontSize: 12,
                              fontFamily: "inherit", lineHeight: 1.6, resize: "vertical",
                              outline: "none", transition: "border-color 0.15s",
                            }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--purple)"; }}
                            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                          />
                        </div>
                      </div>
                    ))}

                    {/* Submit */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        {adsConfig.numAds} video{adsConfig.numAds > 1 ? "s" : ""} configured — report data + config will be sent to the ads workflow
                      </span>
                      <button
                        onClick={() => handleTriggerAds(row.id, report)}
                        disabled={isTriggering}
                        style={{
                          padding: "9px 22px", borderRadius: "var(--radius-md)", border: "none",
                          background: "linear-gradient(135deg, #f97316, #ec4899)", color: "#fff",
                          fontSize: 12, fontWeight: 600, cursor: isTriggering ? "not-allowed" : "pointer",
                          fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
                          opacity: isTriggering ? 0.7 : 1, transition: "opacity 0.2s, transform 0.15s",
                        }}
                        onMouseEnter={(e) => { if (!isTriggering) e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                      >
                        {isTriggering ? <><Spinner size={12} /> Triggering...</> : "Confirm & Generate Ads →"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Market Insights Panel (toggled) */}
                {insightsOpen && insights.length > 0 && (
                  <div className="animate-slide-down" style={{
                    marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
                    background: "var(--surface)", borderRadius: "var(--radius-md)", padding: 14,
                  }}>
                    {insights.map((ins, i) => {
                      const f = (ins.field || "").toLowerCase();
                      const icon = f.includes("format") ? "🎬" : f.includes("angle") ? "🎯" : f.includes("framework") ? "📐" : f.includes("cta") ? "👆" : "📋";
                      return (
                        <div key={i} style={{ padding: "10px 12px", background: "var(--card-bg)", borderRadius: "var(--radius-sm)", border: "0.5px solid var(--border-light)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 14 }}>{icon}</span>
                            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              {ins.field}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, lineHeight: 1.5 }}>{ins.value}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}

          {/* ── FULL REPORT MODAL ── */}
          {sbModalReport && (() => {
            const { report } = sbModalReport;
            const competitors = [...(report.competitors_table || [])].sort((a, b) => {
              const av = a[sbSortField], bv = b[sbSortField];
              if (typeof av === "number") return sbSortDir === "desc" ? bv - av : av - bv;
              return sbSortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
            });
            const gaps = [...(report.gaps_table || [])].sort((a, b) => {
              const order = { high: 0, medium: 1, low: 2 };
              return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
            });
            const modalTabs = [
              { id: "competitors", label: "Competitors" },
              { id: "hooks", label: "Hooks" },
              { id: "insights", label: "Market Insights" },
              { id: "gaps", label: "Gaps" },
            ];

            return (
              <div
                onClick={() => setSbModalReport(null)}
                style={{
                  position: "fixed", inset: 0, zIndex: 1000,
                  background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 20, animation: "fadeIn 0.2s ease-out",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="animate-scale-in"
                  style={{
                    width: "100%", maxWidth: 820, maxHeight: "85vh",
                    background: "var(--card-bg)", border: "0.5px solid var(--border)",
                    borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                  }}
                >
                  {/* Modal header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "0.5px solid var(--border)" }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Full Report</div>
                    <button
                      onClick={() => setSbModalReport(null)}
                      style={{
                        width: 28, height: 28, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                        background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 14, color: "var(--text-muted)", fontFamily: "inherit",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Modal tabs */}
                  <div style={{ display: "flex", gap: 4, padding: "12px 20px 0", borderBottom: "0.5px solid var(--border)" }}>
                    {modalTabs.map((mt) => (
                      <button
                        key={mt.id}
                        onClick={() => setSbModalTab(mt.id)}
                        style={{
                          padding: "8px 14px", fontSize: 12, fontWeight: sbModalTab === mt.id ? 600 : 400,
                          borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
                          border: "none", cursor: "pointer", fontFamily: "inherit",
                          background: sbModalTab === mt.id ? "var(--purple-light)" : "transparent",
                          color: sbModalTab === mt.id ? "var(--purple)" : "var(--text-muted)",
                          transition: "all 0.15s",
                        }}
                      >
                        {mt.label}
                      </button>
                    ))}
                  </div>

                  {/* Modal content */}
                  <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

                    {/* TAB: Competitors */}
                    {sbModalTab === "competitors" && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                              <th style={{ padding: "8px 10px" }}>#</th>
                              <th style={{ padding: "8px 10px", cursor: "pointer" }} onClick={() => toggleSbSort("name")}>
                                Name {sbSortField === "name" && (sbSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th style={{ padding: "8px 10px", cursor: "pointer" }} onClick={() => toggleSbSort("ads")}>
                                Ads {sbSortField === "ads" && (sbSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th style={{ padding: "8px 10px", cursor: "pointer" }} onClick={() => toggleSbSort("score")}>
                                Score {sbSortField === "score" && (sbSortDir === "desc" ? "↓" : "↑")}
                              </th>
                              <th style={{ padding: "8px 10px" }}>Threat</th>
                              <th style={{ padding: "8px 10px" }}>Angle</th>
                              <th style={{ padding: "8px 10px" }}>Hook</th>
                            </tr>
                          </thead>
                          <tbody>
                            {competitors.map((c, i) => (
                              <tr key={i} style={{ borderTop: "0.5px solid var(--border-light)", background: i % 2 === 0 ? "transparent" : "var(--surface)" }}>
                                <td style={{ padding: "10px", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "10px", fontWeight: 500 }}>{c.name}</td>
                                <td style={{ padding: "10px", color: "var(--text-body)" }}>{c.ads}</td>
                                <td style={{ padding: "10px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ width: 50, height: 5, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                                      <div style={{
                                        height: "100%", borderRadius: 3,
                                        width: `${((c.score || 0) / 12) * 100}%`,
                                        background: c.score >= 9 ? "var(--red-error)" : c.score >= 6 ? "var(--amber)" : "var(--green)",
                                      }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.score}/12</span>
                                  </div>
                                </td>
                                <td style={{ padding: "10px" }}>
                                  <Badge
                                    text={c.threat}
                                    color={c.threat === "high" ? "var(--red)" : c.threat === "medium" ? "var(--amber)" : "var(--green)"}
                                    bg={c.threat === "high" ? "var(--red-light)" : c.threat === "medium" ? "var(--amber-light)" : "var(--green-light)"}
                                  />
                                </td>
                                <td style={{ padding: "10px", fontSize: 11, color: "var(--text-body)" }}>{c.angle}</td>
                                <td style={{ padding: "10px", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{c.hook}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {competitors.length === 0 && (
                          <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 13 }}>No competitors data</div>
                        )}
                      </div>
                    )}

                    {/* TAB: Hooks */}
                    {sbModalTab === "hooks" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {(report.hooks_table || []).map((h, i) => (
                          <div key={i} style={{
                            padding: 16, borderRadius: "var(--radius-md)", background: "var(--surface)",
                            border: "0.5px solid var(--border-light)", transition: "box-shadow 0.15s",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{h.pattern}</span>
                              <Badge
                                text={h.score}
                                color={
                                  (h.score || "").toLowerCase() === "strong" ? "var(--green)" :
                                  (h.score || "").toLowerCase() === "moderate" ? "var(--amber)" : "var(--text-muted)"
                                }
                                bg={
                                  (h.score || "").toLowerCase() === "strong" ? "var(--green-light)" :
                                  (h.score || "").toLowerCase() === "moderate" ? "var(--amber-light)" : "var(--surface)"
                                }
                              />
                            </div>
                            <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--amber)", marginBottom: 6, lineHeight: 1.5 }}>
                              &ldquo;{h.example}&rdquo;
                            </p>
                            <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{h.reason}</p>
                          </div>
                        ))}
                        {(!report.hooks_table || report.hooks_table.length === 0) && (
                          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 13 }}>No hooks data</div>
                        )}
                      </div>
                    )}

                    {/* TAB: Market Insights */}
                    {sbModalTab === "insights" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {(report.market_insights_table || []).map((ins, i) => {
                          const f = (ins.field || "").toLowerCase();
                          const icon = f.includes("format") ? "🎬" : f.includes("angle") ? "🎯" : f.includes("framework") ? "📐" : f.includes("cta") ? "👆" : "📋";
                          return (
                            <div key={i} style={{
                              padding: 18, borderRadius: "var(--radius-md)", background: "var(--surface)",
                              border: "0.5px solid var(--border-light)",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 18 }}>{icon}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{ins.field}</span>
                              </div>
                              <p style={{ fontSize: 12, color: "var(--text-body)", lineHeight: 1.6 }}>{ins.value}</p>
                            </div>
                          );
                        })}
                        {(!report.market_insights_table || report.market_insights_table.length === 0) && (
                          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 13 }}>No market insights data</div>
                        )}
                      </div>
                    )}

                    {/* TAB: Gaps & Opportunities */}
                    {sbModalTab === "gaps" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {gaps.map((g, i) => (
                          <div key={i} style={{
                            padding: 16, borderRadius: "var(--radius-md)", background: "var(--surface)",
                            border: "0.5px solid var(--border-light)",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                              <Badge
                                text={g.priority?.toUpperCase()}
                                color={g.priority === "high" ? "var(--red)" : g.priority === "medium" ? "var(--amber)" : "var(--green)"}
                                bg={g.priority === "high" ? "var(--red-light)" : g.priority === "medium" ? "var(--amber-light)" : "var(--green-light)"}
                              />
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{g.gap}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6, paddingLeft: 2 }}>
                              <span style={{ fontSize: 13 }}>💡</span>
                              <p style={{ fontSize: 12, color: "var(--text-body)", lineHeight: 1.5 }}>{g.opportunity}</p>
                            </div>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, paddingLeft: 2 }}>
                              <span style={{ fontSize: 13 }}>📈</span>
                              <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{g.impact}</p>
                            </div>
                          </div>
                        ))}
                        {gaps.length === 0 && (
                          <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 13 }}>No gaps data</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Toast notifications */}
          {sbToasts.length > 0 && (
            <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1100, display: "flex", flexDirection: "column", gap: 8 }}>
              {sbToasts.map((t) => (
                <div
                  key={t.id}
                  className="animate-slide-up"
                  onClick={() => setSbToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  style={{
                    padding: "10px 16px", borderRadius: "var(--radius-md)",
                    background: t.type === "success" ? "var(--green)" : "var(--red-error)",
                    color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer",
                    boxShadow: "var(--shadow-md)",
                  }}
                >
                  {t.message}
                </div>
              ))}
            </div>
          )}

          {reportStatus === "error" && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--red-strong)" }}>
              Could not reach n8n: {webhookError}. Please try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
