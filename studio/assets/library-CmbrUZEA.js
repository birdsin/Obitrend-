import { i as interop, n as ReactModule, t as createRuntime } from "./jsx-runtime-Cltr0gcK.js";
import { n as useStudio } from "./studio-context-Mj6YOFXl.js";
const React = interop(ReactModule, 1);
const h = createRuntime();

function Library({ mode }) {
  const { realOutputs = [], jobs = [], t, locale } = useStudio();
  const [images, setImages] = React.useState([]);
  const [videos, setVideos] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const client = window.supabase || window.supabaseClient || window.obitrendSupabase;
        if (!client?.auth?.getSession) throw new Error("OBITREND session is not ready. Refresh and sign in again.");
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        const token = data?.session?.access_token;
        if (!token) throw new Error("Please sign in to view your saved creations.");
        const headers = { Authorization: "Bearer " + token };
        const [ir, vr] = await Promise.all([
          fetch("/api/image-gallery", { headers }),
          fetch("/api/video-gallery", { headers })
        ]);
        const [id, vd] = await Promise.all([
          ir.json().catch(() => ({})),
          vr.json().catch(() => ({}))
        ]);
        if (!ir.ok || id.success !== true) throw new Error(id.error || "Unable to load saved images.");
        if (!vr.ok || vd.success !== true) console.warn("OBITREND video gallery unavailable:", vd.error || vr.status);

        const metadata = new Map();
        for (const item of realOutputs) {
          try {
            const url = new URL(item.image);
            const marker = "/object/sign/obitrend-generated/";
            const at = url.pathname.indexOf(marker);
            if (at >= 0) metadata.set(decodeURIComponent(url.pathname.slice(at + marker.length)), item);
          } catch {}
        }
        const nextImages = (id.images || []).map((item) => {
          const detail = metadata.get(item.storagePath) || {};
          return {
            id: item.storagePath || item.id,
            title: detail.title || "OBITREND Image",
            prompt: detail.prompt || "",
            image: item.imageUrl,
            created: item.createdAt || detail.created || "",
            kind: "image"
          };
        });
        const nextVideos = (vd.videos || []).map((item) => ({
          id: item.id,
          title: "OBITREND Video",
          video: item.videoUrl,
          created: item.completedAt || item.createdAt || "",
          duration: item.duration,
          taskId: item.taskId,
          kind: "video"
        }));
        if (active) {
          setImages(nextImages);
          setVideos(nextVideos);
          if (!vr.ok || vd.success !== true) setError("Images loaded. Videos could not be loaded; refresh to retry.");
        }
      } catch (err) {
        if (active) setError(err?.message || "Unable to load saved creations.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [realOutputs]);

  const query = search.trim().toLowerCase();
  const filteredImages = images.filter((x) => (x.title + " " + x.prompt).toLowerCase().includes(query));
  const filteredVideos = videos.filter((x) => x.title.toLowerCase().includes(query));
  const showVideos = filteredVideos;
  const dateText = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale || undefined);
  };
  const pending = mode === "history" ? jobs.filter((x) => x.status !== "completed") : [];

  async function downloadItem(item) {
    setDownloading(item.id);
    setError("");
    try {
      const client = window.supabase || window.supabaseClient || window.obitrendSupabase;
      const { data } = await client.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Please sign in again to download this file.");
      const endpoint = item.kind === "video"
        ? "/api/video-download?taskId=" + encodeURIComponent(item.taskId || "")
        : "/api/generated-image?path=" + encodeURIComponent(item.storagePath || item.id);
      const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + token } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Download failed. Please try again.");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("The saved file is empty.");
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = item.kind === "video" ? "obitrend-fashion-video.mp4" : "obitrend-fashion-image.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (err) {
      setError(err?.message || "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  return h.jsxs("main", { className: "workspace-main", children: [
    h.jsx("div", { className: "eyebrow mb-2", children: t("lib.yourWorkspace") }),
    h.jsx("h1", { className: "page-title", children: t(mode) }),
    h.jsx("p", { className: "text-muted-foreground text-xs mt-3", children: mode === "history" ? "Your successfully generated OBITREND images." : "Your saved OBITREND images and videos. Download your creations anytime." }),
    h.jsx("div", { className: "relative max-w-sm mt-6 mb-6", children: h.jsx("input", {
      className: "ps-9", "aria-label": t("lib.searchAriaLabel"),
      placeholder: t("lib.searchPlaceholder"), value: search,
      onChange: (event) => setSearch(event.target.value)
    }) }),
    error ? h.jsx("p", { className: "text-destructive mb-4", role: "alert", children: error }) : null,
    pending.length ? h.jsxs("section", { className: "mb-6", "aria-label": t("lib.trackedJobs"), children: [
      h.jsx("h2", { className: "section-title mb-2", children: t("lib.trackedJobs") }),
      h.jsx("ul", { className: "space-y-2", children: pending.map((job) => h.jsxs("li", {
        className: "flex items-center justify-between gap-3 text-xs border border-border rounded-md p-3",
        children: [
          h.jsx("span", { className: "truncate", children: job.config.title + " · " + job.status }),
          h.jsx("a", { className: "text-primary shrink-0", href: "/studio/tools/" + encodeURIComponent(job.config.toolId), children: t("lib.open") })
        ]
      }, job.id)) })
    ] }) : null,
    showVideos.length ? h.jsxs("section", { className: "mb-8", children: [
      h.jsx("h2", { className: "section-title mb-3", children: "OBITREND videos" }),
      h.jsx("div", { className: "image-grid", children: showVideos.map((item) => h.jsxs("article", { className: "image-tile", children: [
        h.jsx("video", { src: item.video, controls: true, playsInline: true, preload: "metadata", className: "w-full rounded-md", style: { width: "100%", aspectRatio: "16 / 9", background: "#111" } }),
        h.jsx("div", { className: "sample-label mt-3", children: "REAL OBITREND VIDEO" }),
        h.jsx("h2", { className: "text-sm font-semibold mt-2", children: item.title }),
        item.duration ? h.jsx("p", { className: "text-xs text-muted-foreground mt-1", children: item.duration + " seconds" }) : null,
        h.jsx("p", { className: "text-[11px] text-muted-foreground mt-1", children: dateText(item.created) }),
        h.jsx("button", { type: "button", disabled: downloading === item.id, className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-3 text-sm", onClick: () => downloadItem(item), children: downloading === item.id ? "Preparing video…" : "Download video" })
      ] }, item.id)) })
    ] }) : null,
    filteredImages.length ? h.jsxs("section", { className: "mb-8", children: [
      h.jsx("h2", { className: "section-title mb-3", children: "OBITREND images" }),
      h.jsx("div", { className: "image-grid", children: filteredImages.map((item) => h.jsxs("article", { className: "image-tile", children: [
        h.jsx("img", { src: item.image, alt: item.title, width: 768, height: 1024, loading: "lazy", className: "w-full rounded-md" }),
        h.jsx("div", { className: "sample-label mt-3", children: "REAL OBITREND IMAGE" }),
        h.jsx("h2", { className: "text-sm font-semibold mt-2", children: item.title }),
        item.prompt ? h.jsx("p", { className: "text-xs text-muted-foreground mt-2 line-clamp-2", children: item.prompt }) : null,
        h.jsx("p", { className: "text-[11px] text-muted-foreground mt-1", children: dateText(item.created) }),
        h.jsx("button", { type: "button", disabled: downloading === item.id, className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-3 text-sm", onClick: () => downloadItem({ ...item, kind: "image", storagePath: item.id }), children: downloading === item.id ? "Preparing image…" : "Download image" })
      ] }, item.id)) })
    ] }) : null,
    loading ? h.jsx("div", { className: "output-empty mt-10", children: "Loading your saved creations…" }) :
      (!filteredImages.length && !showVideos.length) ? h.jsxs("div", { className: "output-empty mt-10", children: [
        h.jsx("h2", { className: "section-title", children: query ? "No matching creations" : "No saved creations yet" }),
        h.jsx("p", { className: "text-muted-foreground text-xs", children: query ? "Try another search." : "Your successfully generated images and videos will appear here automatically." }),
        h.jsx("a", { className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-4", href: "/studio/tools/fashion-image", children: "Open Fashion Image Creator" })
      ] }) : null
  ] });
}
export { Library as t };
