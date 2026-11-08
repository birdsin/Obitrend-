import { i as interop, n as ReactModule, t as createRuntime } from "./jsx-runtime-Cltr0gcK.js";
import { a as Button, t as buttonRuntime } from "./button-Bk1RAhXQ.js";
import { n as useStudio } from "./studio-context-Mj6YOFXl.js";
import { o as getSession } from "./createLucideIcon-B2N3DdYd.js";
import { t as ArrowRight } from "./arrow-right-C3Ba2ccw.js";
import { t as DownloadIcon } from "./file-down-CfBTCM9S.js";
import { d as SearchIcon, h as SparklesIcon, l as GalleryIcon, m as EmptyIcon, s as formatDate } from "./index-DUgHPPqe.js";

const React = interop(ReactModule, 1);
const h = createRuntime();

function Library({ mode }) {
  const { locale, realOutputs = [], outputs = [], downloads = [], download, jobs = [], t } = useStudio();
  const [search, setSearch] = React.useState("");
  const [remoteImages, setRemoteImages] = React.useState([]);
  const [remoteVideos, setRemoteVideos] = React.useState([]);
  const [loadError, setLoadError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState(null);
  const [downloadError, setDownloadError] = React.useState("");

  React.useEffect(() => {
    let active = true;
    async function loadSavedCreations() {
      setLoading(true);
      setLoadError("");
      try {
        const session = await getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Your session has expired. Please sign in again.");
        const headers = { Authorization: "Bearer " + token };
        const [imageResponse, videoResponse] = await Promise.all([
          fetch("/api/image-gallery", { headers, cache: "no-store" }),
          fetch("/api/video-gallery", { headers, cache: "no-store" })
        ]);
        const [imageData, videoData] = await Promise.all([
          imageResponse.json(), videoResponse.json()
        ]);
        if (!imageResponse.ok || !imageData.success) throw new Error(imageData.error || "Unable to load saved images.");
        if (!videoResponse.ok || !videoData.success) throw new Error(videoData.error || "Unable to load saved videos.");
        if (active) {
          setRemoteImages((imageData.images || []).map((item) => ({
            id: "saved-" + item.id,
            image: item.imageUrl,
            title: "Fashion Image Creator",
            prompt: "",
            created: item.createdAt || "",
            kind: "saved"
          })));
          setRemoteVideos(videoData.videos || []);
        }
      } catch (error) {
        if (active) setLoadError(error?.message || "Unable to load your saved creations.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSavedCreations();
    return () => { active = false; };
  }, []);

  const query = search.trim().toLowerCase();
  const localImages = (mode === "history" ? realOutputs : downloads)
    .filter((item) => item?.image)
    .map((item) => ({ ...item, kind: "local" }));
  const allImages = [...remoteImages, ...localImages];
  const images = allImages.filter((item) =>
    (String(item.title || "") + " " + String(item.prompt || "")).toLowerCase().includes(query)
  );
  const videos = mode === "downloads"
    ? remoteVideos.filter((item) => item?.videoUrl && ("obitrend video " + String(item.duration || "")).toLowerCase().includes(query))
    : [];
  const pending = mode === "history" ? jobs.filter((job) => job.status !== "completed") : [];

  async function handleLocalDownload(item) {
    setBusyId(item.id);
    setDownloadError("");
    try { await download(item); }
    catch { setDownloadError(t("lib.downloadError")); }
    finally { setBusyId(null); }
  }

  function dateText(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale || undefined);
  }

  return h.jsxs("main", { className: "workspace-main", children: [
    h.jsx("div", { className: "eyebrow mb-2", children: t("lib.yourWorkspace") }),
    h.jsx("h1", { className: "page-title", children: t(mode) }),
    h.jsx("p", { className: "text-muted-foreground text-xs mt-3", children: mode === "history" ? "Your saved OBITREND image creations." : "Your saved OBITREND images and videos. Open or download your creations anytime." }),
    h.jsxs("div", { className: "relative max-w-sm mt-6 mb-6", children: [
      h.jsx(SearchIcon, { size: 15, className: "absolute start-3 top-3 text-muted-foreground" }),
      h.jsx("input", { className: "ps-9", "aria-label": t("lib.searchAriaLabel"), placeholder: t("lib.searchPlaceholder"), value: search, onChange: (event) => setSearch(event.target.value) })
    ] }),
    loadError ? h.jsx("p", { className: "text-destructive mb-4", role: "alert", children: loadError }) : null,
    downloadError ? h.jsx("p", { className: "text-destructive mb-4", role: "alert", children: downloadError }) : null,
    pending.length ? h.jsxs("section", { className: "mb-6", "aria-label": t("lib.trackedJobs"), children: [
      h.jsx("h2", { className: "section-title mb-2", children: t("lib.trackedJobs") }),
      h.jsx("ul", { className: "space-y-2", children: pending.map((job) => h.jsxs("li", {
        className: "flex items-center justify-between gap-3 text-xs border border-border rounded-md p-3",
        children: [
          h.jsx("span", { className: "truncate", children: (job.config?.title || "Fashion creation") + " · " + job.status }),
          h.jsx(Button, { className: "text-primary shrink-0", to: "/tools/$toolId", params: { toolId: job.config?.toolId || "fashion-image" }, children: t("lib.open") })
        ]
      }, job.id)) })
    ] }) : null,
    images.length ? h.jsxs("section", { className: "mb-8", children: [
      h.jsx("h2", { className: "section-title mb-3", children: "OBITREND images" }),
      h.jsx("div", { className: "image-grid", children: images.map((item) => h.jsxs("article", { className: "image-tile", children: [
        h.jsx("img", { src: item.image, alt: item.title || "OBITREND saved image", width: 768, height: 1024, loading: "lazy", className: "w-full rounded-md" }),
        h.jsx("div", { className: "sample-label mt-3", children: "REAL OBITREND IMAGE" }),
        h.jsx("h2", { className: "text-sm font-semibold mt-2", children: item.title || "Fashion Image Creator" }),
        item.prompt ? h.jsx("p", { className: "text-xs text-muted-foreground mt-2 line-clamp-2", children: item.prompt }) : null,
        h.jsx("p", { className: "text-[11px] text-muted-foreground mt-1", children: dateText(item.created) }),
        item.kind === "local"
          ? h.jsx(Button, { variant: "outline", size: "sm", className: "mt-3", disabled: busyId === item.id, onClick: () => handleLocalDownload(item), children: [h.jsx(DownloadIcon, {}), " ", t("lib.openImage")] })
          : h.jsx("a", { className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-3 text-sm", href: item.image, target: "_blank", rel: "noreferrer", download: true, children: [h.jsx(DownloadIcon, {}), " Open / download image"] })
      ] }, item.id)) })
    ] }) : null,
    videos.length ? h.jsxs("section", { className: "mb-8", children: [
      h.jsx("h2", { className: "section-title mb-3", children: "OBITREND videos" }),
      h.jsx("div", { className: "image-grid", children: videos.map((item) => h.jsxs("article", { className: "image-tile", children: [
        h.jsx("video", { src: item.videoUrl, controls: true, playsInline: true, preload: "metadata", className: "w-full rounded-md", style: { width: "100%", aspectRatio: "9 / 16", maxHeight: "520px", background: "#090909" } }),
        h.jsx("div", { className: "sample-label mt-3", children: "REAL OBITREND VIDEO" }),
        h.jsx("h2", { className: "text-sm font-semibold mt-2", children: (Number(item.duration) || 0) + "s AI Fashion Video" }),
        h.jsx("p", { className: "text-[11px] text-muted-foreground mt-1", children: dateText(item.completedAt || item.createdAt) }),
        h.jsx("a", { className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-3 text-sm", href: item.videoUrl, target: "_blank", rel: "noreferrer", download: true, children: [h.jsx(DownloadIcon, {}), " Open / download video"] })
      ] }, item.id)) })
    ] }) : null,
    loading && !images.length && !videos.length
      ? h.jsx("p", { className: "text-muted-foreground text-xs mt-10", children: "Loading your saved creations…" })
      : !images.length && !videos.length
        ? h.jsxs("div", { className: "output-empty mt-10", children: [
            h.jsx(EmptyIcon, { size: 35, className: "text-primary" }),
            h.jsx("h2", { className: "section-title", children: query ? "No matching creations" : "No saved creations yet" }),
            h.jsx("p", { className: "text-muted-foreground text-xs", children: query ? "Try another search." : "Your successfully saved OBITREND creations will appear here automatically." }),
            h.jsx(Button, { asChild: true, children: h.jsxs("a", { href: "/studio/tools/fashion-image", children: ["Open Fashion Image Creator", h.jsx(ArrowRight, {})] }) })
          ] })
        : null
  ] });
}

export { Library as t };
