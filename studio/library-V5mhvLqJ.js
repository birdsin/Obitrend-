import { i as interop, n as ReactModule, t as createRuntime } from "./jsx-runtime-Cltr0gcK.js";
import { o as useStudio } from "./studio-context-CBP69TUz.js";

const React = interop(ReactModule, 1);
const h = createRuntime();

function Library({ mode }) {
  const { realOutputs = [], videoOutputs = [], jobs = [], t, locale } = useStudio();
  const [search, setSearch] = React.useState("");
  const query = search.trim().toLowerCase();
  const images = realOutputs.filter((item) => (String(item.title || "") + " " + String(item.prompt || "")).toLowerCase().includes(query));
  const videos = mode === "downloads" ? videoOutputs.filter((item) => item?.videoUrl && ("obitrend video " + String(item.duration || "")).toLowerCase().includes(query)) : [];
  const pending = mode === "history" ? jobs.filter((job) => job.status !== "completed") : [];
  const dateText = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(locale || undefined);
  };

  return h.jsxs("main", { className: "workspace-main", children: [
    h.jsx("div", { className: "eyebrow mb-2", children: t("lib.yourWorkspace") }),
    h.jsx("h1", { className: "page-title", children: t(mode) }),
    h.jsx("p", { className: "text-muted-foreground text-xs mt-3", children: mode === "history" ? "Your saved OBITREND image creations." : "Your saved OBITREND images and videos. Open or download your creations anytime." }),
    h.jsx("div", { className: "relative max-w-sm mt-6 mb-6", children: h.jsx("input", {
      className: "ps-9", "aria-label": t("lib.searchAriaLabel"),
      placeholder: t("lib.searchPlaceholder"), value: search,
      onChange: (event) => setSearch(event.target.value)
    }) }),
    pending.length ? h.jsxs("section", { className: "mb-6", "aria-label": t("lib.trackedJobs"), children: [
      h.jsx("h2", { className: "section-title mb-2", children: t("lib.trackedJobs") }),
      h.jsx("ul", { className: "space-y-2", children: pending.map((job) => h.jsxs("li", {
        className: "flex items-center justify-between gap-3 text-xs border border-border rounded-md p-3",
        children: [
          h.jsx("span", { className: "truncate", children: (job.config?.title || "Fashion creation") + " · " + job.status }),
          h.jsx("a", { className: "text-primary shrink-0", href: "/studio/tools/" + encodeURIComponent(job.config?.toolId || "fashion-image"), children: t("lib.open") })
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
        h.jsx("a", { className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-3 text-sm", href: item.image, target: "_blank", rel: "noreferrer", download: true, children: "Open / download image" })
      ] }, item.id)) })
    ] }) : null,
    videos.length ? h.jsxs("section", { className: "mb-8", children: [
      h.jsx("h2", { className: "section-title mb-3", children: "OBITREND videos" }),
      h.jsx("div", { className: "image-grid", children: videos.map((item) => h.jsxs("article", { className: "image-tile", children: [
        h.jsx("video", { src: item.videoUrl, controls: true, playsInline: true, preload: "metadata", className: "w-full rounded-md", style: { width: "100%", aspectRatio: "9 / 16", maxHeight: "520px", background: "#090909" } }),
        h.jsx("div", { className: "sample-label mt-3", children: "REAL OBITREND VIDEO" }),
        h.jsx("h2", { className: "text-sm font-semibold mt-2", children: (Number(item.duration) || 0) + "s AI Fashion Video" }),
        h.jsx("p", { className: "text-[11px] text-muted-foreground mt-1", children: dateText(item.completedAt || item.createdAt) }),
        h.jsx("a", { className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-3 text-sm", href: item.videoUrl, target: "_blank", rel: "noreferrer", download: true, children: "Open / download video" })
      ] }, item.id)) })
    ] }) : null,
    (!images.length && !videos.length) ? h.jsxs("div", { className: "output-empty mt-10", children: [
      h.jsx("h2", { className: "section-title", children: query ? "No matching creations" : "No saved creations yet" }),
      h.jsx("p", { className: "text-muted-foreground text-xs", children: query ? "Try another search." : "Your successfully saved OBITREND creations will appear here automatically." }),
      h.jsx("a", { className: "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 mt-4", href: "/studio/tools/fashion-image", children: "Open Fashion Image Creator" })
    ] }) : null
  ] });
}

export { Library as t };
