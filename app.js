const STORAGE_KEY = "little-reader-v1";
const RSS_TO_JSON_URL = "https://api.rss2json.com/v1/api.json?rss_url=";
const FEED_SEARCH_URL = "https://r.jina.ai/https://feedsearch.dev/api/v1/search?url=";
const RSSHUB_BASE_URL = "https://rsshub.gujiakai.top";
const MAX_STORIES_PER_FEED = 40;
const MAX_DISCOVERED_FEEDS_TO_TRY = 6;

const menuToggle = document.querySelector("#menu-toggle");
const sidebar = document.querySelector("#feed-sidebar");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const closeSidebarButton = document.querySelector("#close-sidebar");
const feedNavigation = document.querySelector("#feed-navigation");
const sidebarFeedList = document.querySelector("#sidebar-feed-list");
const allFeedsButton = document.querySelector(".all-feeds-item");
const bookmarksButton = document.querySelector("#bookmarks-button");
const settingsButton = document.querySelector("#settings-button");
const themeToggle = document.querySelector("#theme-toggle");
const addFolderButton = document.querySelector("#add-folder-button");
const addFolderForm = document.querySelector("#add-folder-form");
const cancelAddFolderButton = document.querySelector("#cancel-add-folder");
const newFolderNameInput = document.querySelector("#new-folder-name");
const folderCreateStatus = document.querySelector("#folder-create-status");
const addDialog = document.querySelector("#add-feed-dialog");
const settingsDialog = document.querySelector("#settings-dialog");
const retentionSelect = document.querySelector("#retention-months");
const retentionPreview = document.querySelector("#retention-preview");
const saveSettingsButton = document.querySelector("#save-settings");
const closeSettingsButton = document.querySelector("#close-settings");
const form = document.querySelector("#add-feed-form");
const feedInput = document.querySelector("#feed-url");
const addToggle = document.querySelector("#add-toggle");
const refreshButton = document.querySelector("#refresh-button");
const exportButton = document.querySelector("#export-button");
const importButton = document.querySelector("#import-button");
const importFileInput = document.querySelector("#import-file");
const closeDialogButton = document.querySelector("#close-dialog");
const storyList = document.querySelector("#story-list");
const markAllReadButton = document.querySelector("#mark-all-read");
const storyFilterButtons = [...document.querySelectorAll(".story-filter")];
const unreadCountElement = document.querySelector("#unread-count");
const emptyState = document.querySelector("#empty-state");
const backToTopButton = document.querySelector("#back-to-top");
const storiesView = document.querySelector("#stories-view");
const readerView = document.querySelector("#reader-view");
const backButton = document.querySelector("#back-button");
const readerMeta = document.querySelector("#reader-meta");
const readerTitle = document.querySelector("#reader-title");
const readerStatus = document.querySelector("#reader-status");
const readerContent = document.querySelector("#reader-content");
const readerBookmarkToggle = document.querySelector("#reader-bookmark-toggle");
const imageDialog = document.querySelector("#image-dialog");
const closeImageDialogButton = document.querySelector("#close-image-dialog");
const zoomedImage = document.querySelector("#zoomed-image");
const statusElement = document.querySelector("#status");
const dialogStatusElement = document.querySelector("#dialog-status");
const pullRefreshIndicator = document.querySelector("#pull-refresh-indicator");
const pullRefreshLabel = document.querySelector("#pull-refresh-label");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const PULL_REFRESH_THRESHOLD = 72;
const BACK_TO_TOP_THRESHOLD = 320;
let state = loadState();
document.documentElement.dataset.theme = state.theme;
let isRefreshing = false;
let selectedFeedUrl = "";
let selectedFolderId = "";
let showingBookmarks = false;
let collapsedFolderIds = new Set();
let storyFilter = "unread";
let openStoryId = "";
let swipeStart = null;
let suppressCardClick = null;
let pullStart = null;
let pullDistance = 0;
let articleRequestId = 0;
let renderedArticleImages = new Set();
let lastImageTrigger = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const folders = Array.isArray(saved.folders) ? saved.folders.filter(isValidFolder) : [];
    const folderIds = new Set(folders.map((folder) => folder.id));
    return {
      feeds: Array.isArray(saved.feeds)
        ? saved.feeds.filter(isValidSavedFeed).map((feed) => ({
          ...feed,
          folderId: folderIds.has(feed.folderId) ? feed.folderId : "",
        }))
        : [],
      stories: Array.isArray(saved.stories) ? saved.stories.filter(isValidSavedStory) : [],
      folders,
      theme: saved.theme === "dark" ? "dark" : "light",
      retentionMonths: isValidRetentionMonths(saved.retentionMonths) ? saved.retentionMonths : 3,
      retentionConfigured: saved.retentionConfigured === true,
    };
  } catch (error) {
    console.error("Could not read saved feeds.", error);
    return { feeds: [], stories: [], folders: [], theme: "light", retentionMonths: 3, retentionConfigured: false };
  }
}

function isValidRetentionMonths(value) {
  return value === "all" || [1, 3, 6, 12].includes(value);
}

function isValidSavedFeed(feed) {
  return feed && typeof feed.url === "string" && typeof feed.title === "string";
}

function isValidFolder(folder) {
  return folder && typeof folder.id === "string" && folder.id.trim() &&
    typeof folder.name === "string" && folder.name.trim();
}

function isValidSavedStory(story) {
  return story && typeof story.id === "string" && typeof story.title === "string" &&
    typeof story.link === "string" && typeof story.feedUrl === "string";
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save feeds to this device.", error);
    showStatus("Your browser could not save this feed. Check your available storage.", "error");
  }
}

function escapeXmlAttribute(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function exportOpml() {
  const feedsByFolder = new Map(state.folders.map((folder) => [folder.id, []]));
  const ungroupedFeeds = [];
  state.feeds.forEach((feed) => {
    const folderFeeds = feedsByFolder.get(feed.folderId);
    (folderFeeds || ungroupedFeeds).push(feed);
  });
  const feedOutline = (feed) =>
    `      <outline type="rss" text="${escapeXmlAttribute(feed.title)}" title="${escapeXmlAttribute(feed.title)}" xmlUrl="${escapeXmlAttribute(feed.url)}" />`;
  const folderOutlines = state.folders.map((folder) => [
    `    <outline text="${escapeXmlAttribute(folder.name)}" title="${escapeXmlAttribute(folder.name)}">`,
    ...feedsByFolder.get(folder.id).map(feedOutline),
    "    </outline>",
  ].join("\n"));
  const outlines = [
    ...folderOutlines,
    ...ungroupedFeeds.map(feedOutline),
  ];
  const opml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "  <head>",
    "    <title>Little RSS Reader subscriptions</title>",
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    "  </head>",
    "  <body>",
    ...outlines,
    "  </body>",
    "</opml>",
  ].join("\n");
  const blobUrl = URL.createObjectURL(new Blob([opml], { type: "text/x-opml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `rss-reader-subscriptions-${new Date().toISOString().slice(0, 10)}.opml`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  showStatus(`Exported ${state.feeds.length} feed${state.feeds.length === 1 ? "" : "s"} as OPML.`, "success");
}

function parseOpml(value) {
  const documentFromOpml = new DOMParser().parseFromString(value, "application/xml");
  if (documentFromOpml.querySelector("parsererror") ||
    documentFromOpml.documentElement?.tagName.toLowerCase() !== "opml") {
    throw new Error("The selected file is not valid OPML.");
  }
  const body = documentFromOpml.querySelector("opml > body");
  if (!body) throw new Error("The OPML file does not contain a subscription list.");

  const feeds = [];
  const outlines = [...body.querySelectorAll("outline")];
  const feedOutlines = outlines.filter((outline) =>
    outline.hasAttribute("xmlUrl") || outline.hasAttribute("xmlurl"),
  );
  feedOutlines.forEach((outline) => {
    const url = outline.getAttribute("xmlUrl") || outline.getAttribute("xmlurl") || "";
    if (!validFeedUrl(url)) return;
    const title = outline.getAttribute("title") || outline.getAttribute("text") || url;
    const parentFolder = outline.parentElement?.closest("outline");
    const folderName = parentFolder
      ? parentFolder.getAttribute("title") || parentFolder.getAttribute("text") || ""
      : "";
    feeds.push({ url, title, folderName });
  });
  if (!feeds.length) throw new Error("No valid RSS subscriptions were found in the OPML file.");
  const folderNames = outlines
    .filter((outline) => !outline.hasAttribute("xmlUrl") && !outline.hasAttribute("xmlurl"))
    .filter((outline) => {
      const childOutlines = [...outline.children].filter((child) => child.tagName.toLowerCase() === "outline");
      return childOutlines.length === 0 || childOutlines.some((child) =>
        child.hasAttribute("xmlUrl") || child.hasAttribute("xmlurl"),
      );
    })
    .map((outline) => outline.getAttribute("title") || outline.getAttribute("text") || "")
    .filter(Boolean);
  return { feeds, folderNames };
}

async function importOpml(file) {
  if (!file) return;
  try {
    const imported = parseOpml(await file.text());
    const folders = [...state.folders];
    const folderIdsByName = new Map(folders.map((folder) => [folder.name.toLocaleLowerCase(), folder.id]));
    const existingFeedUrls = new Set(state.feeds.map((feed) => feed.url));
    const newFeeds = [];
    const ensureFolder = (name) => {
      const normalizedName = name.toLocaleLowerCase();
      let folderId = folderIdsByName.get(normalizedName) || "";
      if (!folderId) {
        folderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        folders.push({ id: folderId, name });
        folderIdsByName.set(normalizedName, folderId);
      }
      return folderId;
    };
    imported.folderNames.forEach(ensureFolder);
    imported.feeds.forEach((feed) => {
      if (existingFeedUrls.has(feed.url)) return;
      const folderId = feed.folderName ? ensureFolder(feed.folderName) : "";
      newFeeds.push({ url: feed.url, title: feed.title, folderId });
      existingFeedUrls.add(feed.url);
    });
    const mergedState = { ...state, feeds: [...state.feeds, ...newFeeds], folders };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedState));
    } catch (error) {
      console.error("Could not save imported OPML subscriptions.", error);
      throw new Error("The subscriptions could not be saved. Check available browser storage.");
    }
    state = mergedState;
    render();
    const skippedCount = imported.feeds.length - newFeeds.length;
    const resultMessage = `Imported ${newFeeds.length} feed${newFeeds.length === 1 ? "" : "s"}` +
      (skippedCount ? `; skipped ${skippedCount} already saved.` : ".");
    showStatus(resultMessage, "success");
  } catch (error) {
    console.error("Could not import OPML subscriptions.", error);
    showStatus(error.message, "error");
  } finally {
    importFileInput.value = "";
  }
}

function showStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = `status${type ? ` ${type}` : ""}`;
  if (addDialog.open) {
    dialogStatusElement.textContent = message;
    dialogStatusElement.className = `status${type ? ` ${type}` : ""}`;
  }
}

function validFeedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function textFromHtml(value) {
  return articleTextFromHtml(value).replace(/\s+/g, " ").trim();
}

function articleTextFromHtml(value) {
  const documentFromHtml = new DOMParser().parseFromString(value, "text/html");
  documentFromHtml.querySelectorAll("script, style").forEach((element) => element.remove());
  const paragraphs = [...documentFromHtml.querySelectorAll("p, li, blockquote, h1, h2, h3")]
    .map((element) => element.textContent.trim())
    .filter(Boolean);
  return (paragraphs.length ? paragraphs.join("\n\n") : documentFromHtml.body.textContent || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeImageUrl(value, baseUrl = location.href) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim(), baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function imageKey(value) {
  const imageUrl = safeImageUrl(value);
  if (!imageUrl) return "";
  const url = new URL(imageUrl);
  return `${url.origin}${url.pathname}`.toLowerCase();
}

function imageFromHtml(value, baseUrl) {
  if (typeof value !== "string") return "";
  const documentFromHtml = new DOMParser().parseFromString(value, "text/html");
  const image = documentFromHtml.querySelector("img");
  return safeImageUrl(image?.getAttribute("src") || image?.getAttribute("data-src"), baseUrl);
}

function extractStoryImage(item, content, summary, baseUrl) {
  const enclosureCandidates = [
    item.enclosure,
    ...(Array.isArray(item.enclosures) ? item.enclosures : []),
  ]
    .filter((enclosure) => enclosure && (
      typeof enclosure.type === "string" && enclosure.type.startsWith("image/") ||
      /\.(avif|gif|jpe?g|png|webp)(\?|$)/i.test(enclosure.url || enclosure.link || "")
    ))
    .map((enclosure) => enclosure.url || enclosure.link);
  const candidates = [
    item.thumbnail,
    item.image,
    item.image?.url,
    item.media?.thumbnail?.url,
    item.media?.content?.url,
    item.media?.url,
    ...enclosureCandidates,
  ];
  for (const candidate of candidates) {
    const imageUrl = safeImageUrl(candidate, baseUrl);
    if (imageUrl) return imageUrl;
  }
  return imageFromHtml(content, baseUrl) || imageFromHtml(summary, baseUrl);
}

function extractVideoDownloadUrl(item, baseUrl) {
  const candidates = [
    item.enclosure,
    ...(Array.isArray(item.enclosures) ? item.enclosures : []),
    ...(Array.isArray(item.attachments) ? item.attachments : []),
    item.media?.content,
    ...(Array.isArray(item.media?.content) ? item.media.content : []),
  ];
  for (const candidate of candidates) {
    const mediaUrl = typeof candidate === "string"
      ? candidate
      : candidate?.url || candidate?.href || candidate?.link;
    if (typeof mediaUrl !== "string") continue;
    const mimeType = typeof candidate?.type === "string"
      ? candidate.type
      : typeof candidate?.mime_type === "string" ? candidate.mime_type : "";
    if (!mimeType.toLowerCase().startsWith("video/") &&
      !/\.(mp4|m4v|webm|mov|mkv|ogv|avi)(?:[?#]|$)/i.test(mediaUrl)) continue;
    const safeUrl = safeImageUrl(mediaUrl, baseUrl);
    if (safeUrl) return safeUrl;
  }
  return "";
}

function parseJsonFeed(data, sourceUrl) {
  const items = Array.isArray(data?.items)
    ? data.items.filter((item) => item && typeof item === "object")
    : [];
  if (items.length === 0) {
    throw new Error("No stories were found in this feed.");
  }

  const titleValue = data.feed?.title || data.title;
  const title = typeof titleValue === "string" && titleValue.trim()
    ? titleValue.trim()
    : validFeedUrl(sourceUrl) ? new URL(sourceUrl).hostname : "JSON feed";
  const feedUrl = typeof data.feed?.url === "string" && validFeedUrl(data.feed.url)
    ? data.feed.url
    : typeof data.feed_url === "string" && validFeedUrl(data.feed_url)
      ? data.feed_url
      : sourceUrl;
  const stories = items.slice(0, MAX_STORIES_PER_FEED).map((item, index) => {
    const linkValue = item.url || item.external_url || item.link;
    const link = typeof linkValue === "string" ? linkValue : feedUrl;
    const idValue = item.id || item.guid;
    const id = typeof idValue === "string" && idValue ? idValue : link || String(index);
    const contentValue = item.content || item.content_html || item.content_text ||
      item.description || item.summary || "";
    const summaryValue = item.description || item.summary || contentValue;
    const content = typeof contentValue === "string" ? contentValue : "";
    const summary = typeof summaryValue === "string" ? textFromHtml(summaryValue).slice(0, 360) : "";
    const dateValue = item.date_published || item.pubDate || item.published || item.date_modified;
    return {
      id: `${feedUrl}|${id}`,
      title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "Untitled story",
      link,
      image: extractStoryImage(item, content, summaryValue, feedUrl),
      videoUrl: extractVideoDownloadUrl(item, feedUrl),
      summary,
      content: articleTextFromHtml(content).slice(0, 20000),
      date: typeof dateValue === "string" ? dateValue : "",
      feedUrl,
      source: title,
    };
  });

  return { feed: { url: feedUrl, title }, stories };
}

async function fetchFeed(value) {
  if (!validFeedUrl(value)) {
    try {
      const data = JSON.parse(value);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("The JSON must contain a list of stories.");
      }
      const sourceUrl = typeof data.feed_url === "string" ? data.feed_url : `json:${data.feed?.title || data.title || "feed"}`;
      return parseJsonFeed(data, sourceUrl);
    } catch (error) {
      if (error instanceof SyntaxError) {
        const websiteUrl = normalizeWebsiteUrl(value);
        if (!websiteUrl) throw new Error("Paste a website/feed URL or valid JSON.");
        const youtubeFeedUrl = normalizeYoutubeFeedUrl(websiteUrl);
        if (youtubeFeedUrl) return readYoutubeFeed(youtubeFeedUrl);
        const bilibiliFeedUrl = normalizeBilibiliFeedUrl(websiteUrl);
        if (bilibiliFeedUrl) return readBilibiliFeed(bilibiliFeedUrl);
        return discoverWebsiteFeed(websiteUrl);
      }
      throw error;
    }
  }

  const youtubeFeedUrl = normalizeYoutubeFeedUrl(value);
  if (youtubeFeedUrl) {
    return readYoutubeFeed(youtubeFeedUrl);
  }

  if (isYoutubeRssHubFeed(value)) {
    return readYoutubeFeed(value);
  }

  const bilibiliFeedUrl = normalizeBilibiliFeedUrl(value);
  if (bilibiliFeedUrl) {
    return readBilibiliFeed(bilibiliFeedUrl);
  }

  if (isBilibiliRssHubFeed(value)) {
    return readBilibiliFeed(value);
  }

  try {
    return await readRssFeed(value);
  } catch {
    return discoverWebsiteFeed(value);
  }
}

function normalizeBilibiliFeedUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (!["space.bilibili.com", "bilibili.com", "www.bilibili.com"].includes(hostname)) return "";
    const userMatch = url.pathname.match(/^\/(\d+)(?:\/video)?\/?$/);
    if (!userMatch) return "";
    return `${RSSHUB_BASE_URL}/bilibili/user/video/${userMatch[1]}`;
  } catch {
    return "";
  }
}

function normalizeYoutubeFeedUrl(value) {
  try {
    const url = new URL(value);
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname.toLowerCase())) {
      return "";
    }

    if (url.pathname === "/feeds/videos.xml") {
      const channelId = url.searchParams.get("channel_id");
      return channelId
        ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
        : "";
    }

    const handleMatch = url.pathname.match(/^\/(@[\w.-]+)\/?$/);
    if (handleMatch) {
      return `${RSSHUB_BASE_URL}/youtube/user/${encodeURIComponent(handleMatch[1])}`;
    }

    const channelMatch = url.pathname.match(/^\/channel\/(UC[\w-]+)\/?$/);
    return channelMatch
      ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelMatch[1])}`
      : "";
  } catch {
    return "";
  }
}

function isYoutubeRssHubFeed(value) {
  try {
    const url = new URL(value);
    return /^\/youtube\/user\/%40[\w.-]+\/?$/i.test(url.pathname) ||
      /^\/youtube\/user\/@[\w.-]+\/?$/i.test(decodeURIComponent(url.pathname));
  } catch {
    return false;
  }
}

async function readYoutubeFeed(feedUrl) {
  const result = await readFeedThroughJsonConverter(feedUrl, "YouTube");
  result.stories = result.stories.map((story) => {
    const videoId = youtubeVideoId(story);
    return videoId
      ? { ...story, image: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` }
      : story;
  });
  return result;
}

function isBilibiliRssHubFeed(value) {
  try {
    const url = new URL(value);
    return /^\/bilibili\/user\/video\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

async function readBilibiliFeed(feedUrl) {
  return readFeedThroughJsonConverter(feedUrl, "Bilibili");
}

async function readFeedThroughJsonConverter(feedUrl, platform) {
  const converterUrl = `https://feed2json.org/convert?url=${encodeURIComponent(feedUrl)}`;
  const response = await fetch(`https://r.jina.ai/${converterUrl}`);
  if (!response.ok) {
    throw new Error(`The ${platform} feed request failed (${response.status}).`);
  }

  const resultText = await response.text();
  const marker = "Markdown Content:";
  const contentStart = resultText.indexOf(marker);
  if (contentStart === -1) {
    throw new Error(`The ${platform} feed service returned an unreadable response.`);
  }

  let data;
  try {
    data = JSON.parse(resultText.slice(contentStart + marker.length).trim());
  } catch {
    throw new Error(`The ${platform} feed service returned invalid feed data.`);
  }

  if (typeof data.err === "string" && data.err) {
    throw new Error(`The ${platform} feed converter could not read this feed: ${data.err}`);
  }
  return parseJsonFeed(data, feedUrl);
}

function youtubeVideoId(story) {
  const idMatch = story.id.match(/yt:video:([\w-]+)/);
  if (idMatch) return idMatch[1];
  try {
    const url = new URL(story.link);
    if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname.toLowerCase())) return "";
    return url.pathname === "/watch" ? url.searchParams.get("v") || "" : "";
  } catch {
    return "";
  }
}

function bilibiliVideoParams(story) {
  try {
    const url = new URL(story.link);
    if (!["bilibili.com", "www.bilibili.com", "m.bilibili.com"].includes(url.hostname.toLowerCase())) return null;
    const videoMatch = url.pathname.match(/^\/video\/(BV[\da-zA-Z]+|av\d+)\/?$/i);
    if (!videoMatch) return null;
    const videoId = videoMatch[1];
    return /^BV/i.test(videoId)
      ? { key: "bvid", value: videoId }
      : { key: "aid", value: videoId.slice(2) };
  } catch {
    return null;
  }
}

function appendVideoDownloadLink(container, story) {
  const videoUrl = safeImageUrl(story.videoUrl);
  if (!videoUrl) return;
  const link = document.createElement("a");
  link.className = "video-download-link";
  link.href = videoUrl;
  link.download = `${story.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "video"}`;
  link.rel = "noopener noreferrer";
  link.textContent = "Download video";
  container.append(link);
}

function normalizeWebsiteUrl(value) {
  try {
    const url = new URL(`https://${value}`);
    return url.hostname.includes(".") ? url.href : "";
  } catch {
    return "";
  }
}

async function readRssFeed(feedUrl) {
  const response = await fetch(`${RSS_TO_JSON_URL}${encodeURIComponent(feedUrl)}`);
  if (!response.ok) {
    throw new Error(`The feed request failed (${response.status}).`);
  }
  const data = await response.json();
  if (data?.status !== "ok") {
    throw new Error(typeof data?.message === "string" ? data.message : "The feed service could not read this RSS or Atom feed.");
  }
  return parseJsonFeed(data, feedUrl);
}

async function discoverWebsiteFeed(websiteUrl) {
  const response = await fetch(`${FEED_SEARCH_URL}${encodeURIComponent(websiteUrl)}`);
  if (!response.ok) {
    throw new Error(`Feed discovery failed (${response.status}).`);
  }

  const resultText = await response.text();
  const marker = "Markdown Content:";
  const contentStart = resultText.indexOf(marker);
  if (contentStart === -1) {
    throw new Error("The feed discovery service returned an unreadable response.");
  }

  let candidates;
  try {
    candidates = JSON.parse(resultText.slice(contentStart + marker.length).trim());
  } catch {
    throw new Error("The feed discovery service returned invalid feed data.");
  }
  if (!Array.isArray(candidates)) {
    throw new Error("No RSS or Atom feeds were found for this website.");
  }

  const websiteHost = new URL(websiteUrl).hostname.replace(/^www\./i, "");
  const rankedCandidates = candidates
    .filter((candidate) => candidate && typeof candidate.url === "string" && validFeedUrl(candidate.url))
    .sort((a, b) => {
      const hostRank = (candidate) => {
        const host = new URL(candidate.url).hostname.replace(/^www\./i, "");
        return host === websiteHost ? 0 : 1;
      };
      const pathRank = (candidate) => /feed|rss|atom|\.xml/i.test(new URL(candidate.url).pathname) ? 0 : 1;
      return hostRank(a) - hostRank(b) ||
        pathRank(a) - pathRank(b) ||
        (Number(b.score) || 0) - (Number(a.score) || 0);
    });

  const candidatesToTry = [
    ...rankedCandidates.filter((candidate) => !/podcast/i.test(`${candidate.title || ""} ${candidate.url}`)),
    ...rankedCandidates.filter((candidate) => /podcast/i.test(`${candidate.title || ""} ${candidate.url}`)),
  ].slice(0, MAX_DISCOVERED_FEEDS_TO_TRY);
  for (const candidate of candidatesToTry) {
    try {
      return await readRssFeed(candidate.url);
    } catch (error) {
      console.info(`Discovered feed candidate could not be loaded: ${candidate.url}`, error);
    }
  }

  throw new Error("No working RSS or Atom feed was found for this website.");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function retentionCutoff(months, now = new Date()) {
  const cutoff = new Date(now);
  const day = cutoff.getDate();
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - months);
  const lastDay = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(day, lastDay));
  return cutoff;
}

function isExpiredReadStory(story, months = state.retentionMonths, now = new Date(), includeUnconfigured = false) {
  if ((!state.retentionConfigured && !includeUnconfigured) ||
    months === "all" || story.read !== true || story.bookmarked === true || !story.date) return false;
  const storyDate = new Date(story.date);
  if (Number.isNaN(storyDate.getTime())) return false;
  return storyDate < retentionCutoff(months, now);
}

function expiredReadStoryCount(months) {
  return state.stories.filter((story) => isExpiredReadStory(story, months, new Date(), true)).length;
}

function removeExpiredReadStories(months) {
  const previousCount = state.stories.length;
  state.stories = state.stories.filter((story) => !isExpiredReadStory(story, months));
  return previousCount - state.stories.length;
}

function updateRetentionPreview() {
  const months = retentionSelect.value === "all" ? "all" : Number(retentionSelect.value);
  const count = expiredReadStoryCount(months);
  retentionPreview.textContent = count
    ? `${count} old read stor${count === 1 ? "y" : "ies"} will be removed when you save this setting.`
    : "No old read stories need cleanup with this setting.";
}

function openSettings() {
  retentionSelect.value = String(state.retentionMonths);
  updateRetentionPreview();
  setSidebarOpen(false);
  settingsDialog.showModal();
}

function saveRetentionSetting() {
  const months = retentionSelect.value === "all" ? "all" : Number(retentionSelect.value);
  if (!isValidRetentionMonths(months)) {
    throw new Error("Select a valid story-retention period.");
  }

  const count = expiredReadStoryCount(months);
  if (count) {
    const period = months === 1 ? "1 month" : `${months} months`;
    const confirmed = window.confirm(
      `Remove ${count} read ${count === 1 ? "story" : "stories"} older than ${period}? Unread and bookmarked stories will be kept.`,
    );
    if (!confirmed) return;
  }

  state.retentionMonths = months;
  state.retentionConfigured = true;
  const removedCount = removeExpiredReadStories(months);
  saveState();
  render();
  settingsDialog.close();
  showStatus(removedCount
    ? `Removed ${removedCount} old read stor${removedCount === 1 ? "y" : "ies"}.`
    : "Reading settings saved.", "success");
}

function updateThemeToggle() {
  const darkMode = state.theme === "dark";
  themeToggle.querySelector("span").textContent = darkMode ? "Light mode" : "Dark mode";
  themeToggle.setAttribute("aria-label", `Switch to ${darkMode ? "light" : "dark"} mode`);
  themeColorMeta.content = darkMode ? "#151a17" : "#f5f3ee";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  updateThemeToggle();
  saveState();
}

function showFolderCreateStatus(message, type = "") {
  folderCreateStatus.textContent = message;
  folderCreateStatus.className = `sidebar-folder-status${type ? ` ${type}` : ""}`;
}

function addFolder(name) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    showFolderCreateStatus("Enter a folder name.", "error");
    return;
  }
  if (state.folders.some((folder) => folder.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase())) {
    showFolderCreateStatus("That folder already exists.", "error");
    return;
  }
  const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  state.folders.push({ id, name: trimmedName });
  saveState();
  render();
  newFolderNameInput.value = "";
  addFolderForm.hidden = true;
  showFolderCreateStatus(`Created ${trimmedName}.`);
}

function renameFolder(folderId, name) {
  const folder = state.folders.find((candidate) => candidate.id === folderId);
  if (!folder) return false;
  const trimmedName = name.trim();
  if (!trimmedName) {
    showStatus("Folder names cannot be empty.", "error");
    return false;
  }
  if (state.folders.some((candidate) =>
    candidate.id !== folderId && candidate.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
  )) {
    showStatus("A folder with that name already exists.", "error");
    return false;
  }
  folder.name = trimmedName;
  saveState();
  render();
  showStatus(`Renamed folder to ${trimmedName}.`, "success");
  return true;
}

function deleteFolder(folderId) {
  const folder = state.folders.find((candidate) => candidate.id === folderId);
  if (!folder) return;
  const assignedCount = state.feeds.filter((feed) => feed.folderId === folderId).length;
  if (assignedCount && !window.confirm(
    `Delete "${folder.name}" and move its ${assignedCount} ${assignedCount === 1 ? "feed" : "feeds"} to Ungrouped?`,
  )) return;
  state.folders = state.folders.filter((candidate) => candidate.id !== folderId);
  state.feeds.forEach((feed) => {
    if (feed.folderId === folderId) feed.folderId = "";
  });
  collapsedFolderIds.delete(folderId);
  if (selectedFolderId === folderId) selectedFolderId = "";
  saveState();
  render();
  showStatus(`Deleted ${folder.name}.`, "success");
}

function moveFeedToFolder(feed, folderId) {
  const savedFeed = state.feeds.find((candidate) => candidate.url === feed.url);
  if (!savedFeed) return;
  savedFeed.folderId = state.folders.some((folder) => folder.id === folderId) ? folderId : "";
  saveState();
  render();
}

function feedInitials(value) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "R";
}

function createSidebarFeedRow(feed) {
  const row = document.createElement("div");
  row.className = "sidebar-feed-row";
  const button = document.createElement("button");
  button.className = "nav-item feed-nav-item";
  button.type = "button";
  button.dataset.feedUrl = feed.url;
  button.setAttribute("aria-current", selectedFeedUrl === feed.url ? "page" : "false");
  const icon = document.createElement("span");
  icon.className = "feed-nav-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = feedInitials(feed.title);
  const label = document.createElement("span");
  label.className = "feed-nav-title";
  label.textContent = feed.title;
  button.append(icon, label);
  button.addEventListener("click", () => selectFeed(feed.url));
  const actions = document.createElement("details");
  actions.className = "sidebar-actions";
  const actionsButton = document.createElement("summary");
  actionsButton.textContent = "•••";
  actionsButton.setAttribute("aria-label", `More actions for ${feed.title}`);
  actionsButton.title = `More actions for ${feed.title}`;
  const menu = document.createElement("div");
  menu.className = "sidebar-actions-menu";
  const moveLabel = document.createElement("label");
  moveLabel.className = "sidebar-menu-label";
  moveLabel.textContent = "Move to folder";
  const folderSelect = document.createElement("select");
  folderSelect.className = "sidebar-menu-select";
  folderSelect.setAttribute("aria-label", `Move ${feed.title} to folder`);
  const ungroupedOption = document.createElement("option");
  ungroupedOption.value = "";
  ungroupedOption.textContent = "Ungrouped";
  folderSelect.append(ungroupedOption);
  state.folders.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.append(option);
  });
  folderSelect.value = feed.folderId || "";
  folderSelect.addEventListener("change", () => moveFeedToFolder(feed, folderSelect.value));
  moveLabel.append(folderSelect);
  menu.append(moveLabel);
  actions.append(actionsButton, menu);
  const remove = document.createElement("button");
  remove.className = "sidebar-remove-feed";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Remove ${feed.title}`);
  remove.title = `Remove ${feed.title}`;
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    removeFeed(feed.url);
  });
  row.append(button, actions, remove);
  return row;
}

function createSidebarFolderGroup(folder, feeds) {
  const group = document.createElement("section");
  group.className = "sidebar-feed-group";
  const heading = document.createElement("div");
  heading.className = "sidebar-folder-heading";
  const selectFolderButton = document.createElement("button");
  selectFolderButton.className = "sidebar-folder-select";
  selectFolderButton.type = "button";
  selectFolderButton.setAttribute("aria-current", selectedFolderId === folder.id ? "page" : "false");
  const icon = document.createElement("span");
  icon.className = "sidebar-folder-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "▱";
  const name = document.createElement("span");
  name.className = "sidebar-folder-name";
  name.textContent = folder.name;
  const count = document.createElement("span");
  count.className = "sidebar-folder-count";
  count.textContent = String(feeds.length);
  selectFolderButton.append(icon, name, count);
  selectFolderButton.addEventListener("click", () => selectFolder(folder.id));
  const actions = document.createElement("details");
  actions.className = "sidebar-actions folder-actions";
  const actionsButton = document.createElement("summary");
  actionsButton.textContent = "•••";
  actionsButton.setAttribute("aria-label", `More actions for ${folder.name}`);
  actionsButton.title = `More actions for ${folder.name}`;
  const menu = document.createElement("div");
  menu.className = "sidebar-actions-menu folder-actions-menu";
  const menuActions = document.createElement("div");
  menuActions.className = "sidebar-folder-menu-actions";
  const renameButton = document.createElement("button");
  renameButton.className = "sidebar-menu-action";
  renameButton.type = "button";
  renameButton.textContent = "Rename folder";
  const renameForm = document.createElement("form");
  renameForm.className = "sidebar-folder-rename-form";
  renameForm.hidden = true;
  const renameInput = document.createElement("input");
  renameInput.type = "text";
  renameInput.maxLength = 40;
  renameInput.value = folder.name;
  renameInput.setAttribute("aria-label", `New name for ${folder.name}`);
  const renameSubmit = document.createElement("button");
  renameSubmit.type = "submit";
  renameSubmit.textContent = "Save";
  const renameCancel = document.createElement("button");
  renameCancel.type = "button";
  renameCancel.textContent = "Cancel";
  renameCancel.addEventListener("click", () => {
    renameForm.hidden = true;
    menuActions.hidden = false;
  });
  renameForm.append(renameInput, renameSubmit, renameCancel);
  renameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (renameFolder(folder.id, renameInput.value)) actions.open = false;
  });
  renameButton.addEventListener("click", () => {
    menuActions.hidden = true;
    renameForm.hidden = false;
    renameInput.focus();
    renameInput.select();
  });
  const deleteButton = document.createElement("button");
  deleteButton.className = "sidebar-menu-action is-danger";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete folder";
  deleteButton.addEventListener("click", () => {
    actions.open = false;
    deleteFolder(folder.id);
  });
  menuActions.append(renameButton, deleteButton);
  menu.append(menuActions, renameForm);
  actions.append(actionsButton, menu);
  const collapsed = collapsedFolderIds.has(folder.id);
  const collapseButton = document.createElement("button");
  collapseButton.className = "sidebar-folder-collapse";
  collapseButton.type = "button";
  collapseButton.textContent = collapsed ? "›" : "⌄";
  collapseButton.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${folder.name}`);
  collapseButton.setAttribute("aria-expanded", String(!collapsed));
  collapseButton.addEventListener("click", () => {
    if (collapsedFolderIds.has(folder.id)) collapsedFolderIds.delete(folder.id);
    else collapsedFolderIds.add(folder.id);
    render();
  });
  heading.append(selectFolderButton, actions, collapseButton);
  const feedList = document.createElement("div");
  feedList.className = "sidebar-folder-feeds";
  feedList.hidden = collapsed;
  if (feeds.length) feeds.forEach((feed) => feedList.append(createSidebarFeedRow(feed)));
  else {
    const empty = document.createElement("span");
    empty.className = "sidebar-feed-empty";
    empty.textContent = "No feeds yet";
    feedList.append(empty);
  }
  group.append(heading, feedList);
  return group;
}

function render() {
  const unreadCount = state.stories.filter((story) => story.read !== true).length;
  unreadCountElement.textContent = String(unreadCount);
  unreadCountElement.setAttribute("aria-label", `${unreadCount} unread ${unreadCount === 1 ? "story" : "stories"}`);
  sidebarFeedList.replaceChildren();
  state.folders.forEach((folder) => {
    const feeds = state.feeds.filter((feed) => feed.folderId === folder.id);
    sidebarFeedList.append(createSidebarFolderGroup(folder, feeds));
  });
  const ungroupedFeeds = state.feeds.filter((feed) => !state.folders.some((folder) => folder.id === feed.folderId));
  if (state.folders.length && ungroupedFeeds.length) {
    const ungroupedGroup = document.createElement("section");
    ungroupedGroup.className = "sidebar-feed-group";
    const ungroupedLabel = document.createElement("div");
    ungroupedLabel.className = "sidebar-ungrouped-label";
    ungroupedLabel.textContent = "Ungrouped";
    ungroupedGroup.append(ungroupedLabel);
    ungroupedFeeds.forEach((feed) => ungroupedGroup.append(createSidebarFeedRow(feed)));
    sidebarFeedList.append(ungroupedGroup);
  } else {
    ungroupedFeeds.forEach((feed) => sidebarFeedList.append(createSidebarFeedRow(feed)));
  }
  allFeedsButton.setAttribute("aria-current", !selectedFeedUrl && !selectedFolderId && !showingBookmarks ? "page" : "false");
  bookmarksButton.setAttribute("aria-current", showingBookmarks ? "page" : "false");

  const folderFeedUrls = selectedFolderId
    ? new Set(state.feeds.filter((feed) => feed.folderId === selectedFolderId).map((feed) => feed.url))
    : null;
  const storiesByView = showingBookmarks
    ? state.stories.filter((story) => story.bookmarked)
    : selectedFeedUrl
      ? state.stories.filter((story) => story.feedUrl === selectedFeedUrl)
      : folderFeedUrls
        ? state.stories.filter((story) => folderFeedUrls.has(story.feedUrl))
        : state.stories;
  const unreadStoriesInView = storiesByView.filter((story) => story.read !== true);
  markAllReadButton.hidden = unreadStoriesInView.length === 0;
  const visibleStories = storiesByView.filter((story) =>
    storyFilter === "all" || (storyFilter === "read" ? story.read === true : story.read !== true),
  );
  storyFilterButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.storyFilter === storyFilter));
  });
  const sortedStories = [...visibleStories].sort((a, b) => {
    const dateA = Date.parse(a.date) || 0;
    const dateB = Date.parse(b.date) || 0;
    return dateB - dateA;
  });
  storyList.replaceChildren();
  for (const story of sortedStories) {
    const card = document.createElement("article");
    card.className = "story-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Read ${story.title}`);
    if (story.read === true) card.classList.add("is-read");
    card.addEventListener("click", (event) => {
      if (suppressCardClick === card) {
        suppressCardClick = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      openStory(story);
    });
    card.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" && !event.target.closest("button, a, img")) {
        swipeStart = { card, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      }
    });
    card.addEventListener("pointerup", (event) => {
      if (!swipeStart || swipeStart.card !== card || swipeStart.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - swipeStart.x;
      const deltaY = event.clientY - swipeStart.y;
      swipeStart = null;
      if (deltaX < -70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
        suppressCardClick = card;
        setTimeout(() => {
          if (suppressCardClick === card) suppressCardClick = null;
        }, 500);
        markStoryRead(story);
      }
    });
    card.addEventListener("pointercancel", () => {
      if (swipeStart?.card === card) swipeStart = null;
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openStory(story);
      }
    });

    const meta = document.createElement("div");
    meta.className = "story-meta";
    const avatar = document.createElement("span");
    avatar.className = "source-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = feedInitials(story.source || "RSS feed");
    const source = document.createElement("span");
    source.className = "story-source";
    source.textContent = story.source || "RSS feed";
    meta.append(avatar, source);
    if (story.read === true) {
      const readLabel = document.createElement("span");
      readLabel.className = "story-read-label";
      readLabel.textContent = "Read";
      meta.append(readLabel);
    }
    const date = formatDate(story.date);
    if (date) {
      const dot = document.createElement("span");
      dot.className = "meta-dot";
      dot.textContent = "·";
      const dateLabel = document.createElement("span");
      dateLabel.textContent = date;
      meta.append(dot, dateLabel);
    }

    const title = document.createElement("h3");
    title.className = "story-title";
    title.textContent = story.title;
    const bookmarkToggle = createBookmarkToggle(story);
    bookmarkToggle.classList.add("story-bookmark-toggle");
    bookmarkToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleBookmark(story);
    });
    bookmarkToggle.addEventListener("keydown", (event) => event.stopPropagation());
    const main = document.createElement("div");
    main.className = "story-main";
    const copy = document.createElement("div");
    copy.className = "story-copy";
    copy.append(title);
    if (story.summary) {
      const summary = document.createElement("p");
      summary.className = "story-summary";
      summary.textContent = story.summary;
      copy.append(summary);
    }
    main.append(copy);
    const thumbnailUrl = safeImageUrl(story.image);
    if (thumbnailUrl) {
      const thumbnail = document.createElement("img");
      thumbnail.className = "story-thumbnail";
      thumbnail.src = thumbnailUrl;
      thumbnail.alt = "";
      thumbnail.loading = "lazy";
      thumbnail.tabIndex = 0;
      thumbnail.setAttribute("role", "button");
      thumbnail.setAttribute("aria-label", `Zoom image for ${story.title}`);
      thumbnail.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openImageZoom(thumbnailUrl, story.title, thumbnail);
      });
      thumbnail.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          openImageZoom(thumbnailUrl, story.title, thumbnail);
        }
      });
      thumbnail.addEventListener("error", () => thumbnail.remove(), { once: true });
      main.append(thumbnail);
    }
    card.append(meta, main, bookmarkToggle);
    const arrow = document.createElement("span");
    arrow.className = "story-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "›";
    card.append(arrow);
    storyList.append(card);
  }

  emptyState.hidden = sortedStories.length > 0;
  const emptyMessage = emptyState.querySelector("p");
  const selectedFolderName = state.folders.find((folder) => folder.id === selectedFolderId)?.name;
  emptyMessage.textContent = !storiesByView.length
    ? showingBookmarks ? "No bookmarked stories yet." : "No stories yet."
    : storyFilter === "read"
      ? "No read stories here."
      : storyFilter === "unread"
        ? "You’re all caught up."
        : selectedFeedUrl
          ? `No stories in ${state.feeds.find((feed) => feed.url === selectedFeedUrl)?.title || "this feed"} yet.`
          : selectedFolderName
            ? `No stories in ${selectedFolderName} yet.`
          : "No stories yet.";
}

function createBookmarkToggle(story) {
  const button = document.createElement("button");
  button.className = "bookmark-toggle";
  button.type = "button";
  button.setAttribute("aria-pressed", String(Boolean(story.bookmarked)));
  button.setAttribute("aria-label", story.bookmarked ? "Remove bookmark" : "Bookmark story");
  button.title = story.bookmarked ? "Remove bookmark" : "Bookmark story";
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>';
  return button;
}

function updateReaderBookmark(story) {
  const button = createBookmarkToggle(story);
  readerBookmarkToggle.setAttribute("aria-pressed", button.getAttribute("aria-pressed"));
  readerBookmarkToggle.setAttribute("aria-label", button.getAttribute("aria-label"));
  readerBookmarkToggle.title = button.title;
  readerBookmarkToggle.querySelector("span").textContent = story.bookmarked ? "Bookmarked" : "Bookmark";
}

function toggleBookmark(story) {
  const savedStory = state.stories.find((candidate) => candidate.id === story.id);
  if (!savedStory) return;
  savedStory.bookmarked = !savedStory.bookmarked;
  if (openStoryId === savedStory.id) updateReaderBookmark(savedStory);
  saveState();
  render();
}

function markStoryRead(story) {
  const savedStory = state.stories.find((candidate) => candidate.id === story.id);
  if (!savedStory || savedStory.read === true) return;
  savedStory.read = true;
  saveState();
  render();
}

function markAllUnreadAsRead() {
  const folderFeedUrls = selectedFolderId
    ? new Set(state.feeds.filter((feed) => feed.folderId === selectedFolderId).map((feed) => feed.url))
    : null;
  const unreadStories = state.stories.filter((story) =>
    story.read !== true &&
    (showingBookmarks
      ? story.bookmarked
      : selectedFeedUrl
        ? story.feedUrl === selectedFeedUrl
        : folderFeedUrls
          ? folderFeedUrls.has(story.feedUrl)
          : true),
  );
  if (!unreadStories.length) return;
  unreadStories.forEach((story) => {
    story.read = true;
  });
  saveState();
  render();
  showStatus(`Marked ${unreadStories.length} unread stor${unreadStories.length === 1 ? "y" : "ies"} as read.`, "success");
}

function selectStoryFilter(filter) {
  if (!["unread", "all", "read"].includes(filter)) return;
  storyFilter = filter;
  render();
}

function setSidebarOpen(isOpen) {
  sidebar.classList.toggle("is-open", isOpen);
  sidebar.setAttribute("aria-hidden", String(!isOpen));
  sidebar.inert = !isOpen;
  sidebarBackdrop.hidden = !isOpen;
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close feed menu" : "Open feed menu");
  document.body.classList.toggle("sidebar-open", isOpen);
  if (isOpen) closeSidebarButton.focus();
  else menuToggle.focus();
}

function selectFeed(feedUrl) {
  showingBookmarks = false;
  selectedFeedUrl = feedUrl;
  selectedFolderId = "";
  readerView.hidden = true;
  storiesView.hidden = false;
  setSidebarOpen(false);
  render();
  window.scrollTo(0, 0);
}

function selectFolder(folderId) {
  if (!state.folders.some((folder) => folder.id === folderId)) return;
  showingBookmarks = false;
  selectedFeedUrl = "";
  selectedFolderId = folderId;
  readerView.hidden = true;
  storiesView.hidden = false;
  setSidebarOpen(false);
  render();
  window.scrollTo(0, 0);
}

function selectBookmarks() {
  showingBookmarks = true;
  selectedFeedUrl = "";
  selectedFolderId = "";
  readerView.hidden = true;
  storiesView.hidden = false;
  setSidebarOpen(false);
  render();
  window.scrollTo(0, 0);
}

async function openStory(story) {
  markStoryRead(story);
  const requestId = ++articleRequestId;
  openStoryId = story.id;
  updateReaderBookmark(story);
  readerMeta.replaceChildren();
  const source = document.createElement("span");
  source.className = "story-source";
  source.textContent = story.source || "RSS feed";
  readerMeta.append(source);
  const date = formatDate(story.date);
  if (date) {
    const dot = document.createElement("span");
    dot.className = "meta-dot";
    dot.textContent = "·";
    const dateLabel = document.createElement("span");
    dateLabel.textContent = date;
    readerMeta.append(dot, dateLabel);
  }

  readerTitle.textContent = story.title;
  readerContent.replaceChildren();
  renderedArticleImages = new Set();
  storiesView.hidden = true;
  readerView.hidden = false;
  window.scrollTo(0, 0);

  const videoId = youtubeVideoId(story);
  const bilibiliVideo = bilibiliVideoParams(story);
  if (bilibiliVideo) {
    const playerUrl = new URL("https://player.bilibili.com/player.html");
    playerUrl.searchParams.set(bilibiliVideo.key, bilibiliVideo.value);
    playerUrl.searchParams.set("page", "1");
    playerUrl.searchParams.set("autoplay", "0");
    playerUrl.searchParams.set("isOutside", "true");
    const preview = document.createElement("div");
    preview.className = "bilibili-preview";
    const playerFrame = document.createElement("iframe");
    playerFrame.className = "bilibili-player";
    playerFrame.src = playerUrl.href;
    playerFrame.title = `Bilibili video: ${story.title}`;
    playerFrame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    playerFrame.allowFullscreen = true;
    playerFrame.referrerPolicy = "strict-origin-when-cross-origin";
    const watchLink = document.createElement("a");
    watchLink.className = "bilibili-watch-link";
    watchLink.href = story.link;
    watchLink.target = "_blank";
    watchLink.rel = "noopener noreferrer";
    watchLink.textContent = "Open on Bilibili ↗";
    preview.append(playerFrame, watchLink);
    appendVideoDownloadLink(preview, story);
    readerContent.append(preview);
    readerStatus.textContent = "";
    readerStatus.className = "status";
    return;
  }

  if (videoId) {
    const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const preview = document.createElement("div");
    preview.className = "youtube-preview";
    const thumbnailLink = document.createElement("a");
    thumbnailLink.className = "youtube-thumbnail-link";
    thumbnailLink.href = videoUrl;
    thumbnailLink.target = "_blank";
    thumbnailLink.rel = "noopener noreferrer";
    thumbnailLink.setAttribute("aria-label", `Watch ${story.title} on YouTube in a new tab`);
    const thumbnail = document.createElement("img");
    thumbnail.src = safeImageUrl(story.image) ||
      `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
    thumbnail.alt = `Video thumbnail: ${story.title}`;
    thumbnailLink.append(thumbnail);
    const playIcon = document.createElement("span");
    playIcon.className = "youtube-preview-play";
    playIcon.setAttribute("aria-hidden", "true");
    playIcon.textContent = "▶";
    thumbnailLink.append(playIcon);
    const watchLink = document.createElement("a");
    watchLink.className = "youtube-watch-link";
    watchLink.href = videoUrl;
    watchLink.target = "_blank";
    watchLink.rel = "noopener noreferrer";
    watchLink.textContent = "Watch on YouTube ↗";
    preview.append(thumbnailLink, watchLink);
    appendVideoDownloadLink(preview, story);
    readerContent.append(preview);
    readerStatus.textContent = "";
    readerStatus.className = "status";
    return;
  }

  if (story.fullContentMarkdown) {
    const articleMarkdown = trimArticleExtras(story.fullContentMarkdown);
    if (articleMarkdown !== story.fullContentMarkdown) {
      story.fullContentMarkdown = articleMarkdown;
      saveState();
    }
    appendVideoDownloadLink(readerContent, story);
    appendMarkdownArticle(articleMarkdown);
    if (renderedArticleImages.size === 0 && story.image) appendArticleImage(story.image, story.title);
    readerStatus.textContent = "";
    readerStatus.className = "status";
    return;
  }
  appendVideoDownloadLink(readerContent, story);
  if (story.image) appendArticleImage(story.image, story.title);
  appendPlainArticleText(story.content || story.summary || "This feed did not include article text.");
  if (!validFeedUrl(story.link)) return;
  readerStatus.textContent = "Loading full article…";
  readerStatus.className = "status";
  try {
    const article = await fetchFullArticle(story);
    if (requestId !== articleRequestId || readerView.hidden) return;
    readerContent.replaceChildren();
    renderedArticleImages = new Set();
    appendMarkdownArticle(article.markdown);
    if (renderedArticleImages.size === 0 && story.image) appendArticleImage(story.image, story.title);
    story.fullContentMarkdown = article.markdown;
    story.fullContentImages = article.images;
    if (!story.image && article.images.length) story.image = article.images[0];
    story.fullContentLoaded = true;
    saveState();
    render();
    readerStatus.textContent = "";
    readerStatus.className = "status";
  } catch (error) {
    if (requestId !== articleRequestId || readerView.hidden) return;
    console.error(`Could not load the full article ${story.link}.`, error);
    readerStatus.textContent = "Showing the feed's available content. The full article could not be loaded.";
    readerStatus.className = "status error";
  }
}

async function fetchFullArticle(story) {
  const response = await fetch(`https://r.jina.ai/${story.link}`, {
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Article request failed (${response.status}).`);
  const responseText = await response.text();
  const marker = "Markdown Content:";
  const contentStart = responseText.indexOf(marker);
  if (contentStart === -1) throw new Error("The article service returned unreadable content.");

  const markdown = extractArticleMarkdown(
    responseText.slice(contentStart + marker.length).trim(),
    story.title,
  );
  const images = [...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .filter((match) => !/logo|avatar|headshot|icon/i.test(match[1]))
    .map((match) => safeImageUrl(match[2], story.link))
    .filter((image, index, all) => image && all.indexOf(image) === index)
    .slice(0, 12);
  return { markdown, images };
}

function normalizeHeading(value) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function extractArticleMarkdown(markdown, title) {
  const lines = markdown.split(/\r?\n/);
  const expectedTitles = [
    title,
    ...title.split(/[:：–—-]/).slice(1),
  ].map(normalizeHeading).filter(Boolean);
  const titleIndex = lines.findIndex((line) => {
    if (!/^#{1,3}\s+/.test(line)) return false;
    const heading = normalizeHeading(
      line.replace(/^#{1,3}\s+/, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
    );
    return expectedTitles.includes(heading);
  });
  if (titleIndex === -1) throw new Error("Article heading was not found in the page.");

  return trimArticleExtras(lines.slice(titleIndex + 1).join("\n"));
}

function trimArticleExtras(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sectionPrefixes = [
    "comments",
    "comment",
    "leave a comment",
    "post a comment",
    "discussion",
    "responses",
    "related articles",
    "related stories",
    "related news",
    "you may also like",
    "留言",
    "留言板",
    "评论",
    "評論",
    "相关报道",
    "相关新闻",
    "相關新聞",
    "댓글",
    "コメント",
  ];
  const content = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^#{1,6}\s+/.test(trimmed) || /^\*\*[^*]+\*\*$/.test(trimmed);
    const sectionText = normalizeHeading(
      trimmed
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\*\*([^*]+)\*\*$/, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
    );
    const isShortSectionLabel = trimmed.length <= 80 && !/[.!?。！？]/.test(trimmed);
    if ((isHeading || isShortSectionLabel) &&
      (sectionPrefixes.some((prefix) => sectionText.startsWith(normalizeHeading(prefix))) ||
        /^(was this page helpful|national aeronautics and space administration|follow nasa)/i.test(sectionText))) {
      break;
    }
    content.push(line);
  }
  return content.join("\n").trim();
}

function appendArticleImage(src, alt) {
  const imageUrl = safeImageUrl(src);
  const key = imageKey(imageUrl);
  if (!imageUrl || !key || renderedArticleImages.has(key)) return;
  renderedArticleImages.add(key);
  const figure = document.createElement("figure");
  figure.className = "article-image";
  const trigger = document.createElement("button");
  trigger.className = "image-zoom-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-label", `Zoom image${alt ? `: ${alt}` : ""}`);
  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = alt;
  image.loading = "lazy";
  image.addEventListener("error", () => figure.remove(), { once: true });
  trigger.append(image);
  trigger.addEventListener("click", () => openImageZoom(imageUrl, alt, trigger));
  figure.append(trigger);
  readerContent.append(figure);
}

function openImageZoom(src, alt, trigger) {
  const imageUrl = safeImageUrl(src);
  if (!imageUrl) return;
  lastImageTrigger = trigger;
  zoomedImage.src = imageUrl;
  zoomedImage.alt = alt || "";
  imageDialog.showModal();
}

function closeImageZoom() {
  if (imageDialog.open) imageDialog.close();
}

function appendPlainArticleText(value) {
  for (const paragraph of value.split(/\n{2,}/)) {
    if (!paragraph.trim()) continue;
    const element = document.createElement("p");
    element.textContent = paragraph;
    readerContent.append(element);
  }
}

function appendMarkdownArticle(markdown) {
  for (const block of markdown.split(/\n\s*\n/)) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;
    const firstLine = trimmedBlock.split(/\r?\n/, 1)[0];
    const headingLevel = (firstLine.match(/^#{1,3}\s/) || [""])[0].length;
    const imageMatches = [...trimmedBlock.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g)];
    for (const match of imageMatches) {
      if (!/logo|avatar|headshot|icon/i.test(match[1])) appendArticleImage(match[2], match[1]);
    }
    const text = trimmedBlock
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g, "")
      .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
      .replace(/[*_~`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const element = document.createElement(headingLevel ? "h3" : "p");
    element.textContent = text;
    readerContent.append(element);
  }
}

function closeStory() {
  articleRequestId += 1;
  openStoryId = "";
  readerView.hidden = true;
  storiesView.hidden = false;
  window.scrollTo(0, 0);
}

function removeFeed(feedUrl) {
  state.feeds = state.feeds.filter((feed) => feed.url !== feedUrl);
  state.stories = state.stories.filter((story) => story.feedUrl !== feedUrl);
  if (selectedFeedUrl === feedUrl) selectedFeedUrl = "";
  saveState();
  render();
}

async function addFeed(value) {
  const feedInputValue = value.trim();
  if (!feedInputValue) {
    showStatus("Enter a feed URL or paste JSON.", "error");
    return;
  }
  if (state.feeds.some((feed) => feed.url === feedInputValue)) {
    showStatus("That feed is already in your reading list.", "error");
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  showStatus("Finding your stories…");
  try {
    const result = await fetchFeed(feedInputValue);
    if (state.feeds.some((feed) => feed.url === result.feed.url)) {
      showStatus("That feed is already in your reading list.", "error");
      return;
    }
    state.feeds.push(result.feed);
    state.stories = [
      ...state.stories.filter((story) => story.feedUrl !== result.feed.url),
      ...result.stories,
    ];
    saveState();
    render();
    feedInput.value = "";
    addDialog.close();
    showStatus(`Added ${result.feed.title}.`, "success");
  } catch (error) {
    console.error(`Could not load feed ${feedInputValue}.`, error);
    showStatus(`${error.message} The feed may be unavailable or the feed service may be busy.`, "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function refreshFeeds() {
  if (isRefreshing) return;
  const refreshableFeeds = state.feeds.filter((feed) => validFeedUrl(feed.url));
  if (refreshableFeeds.length === 0) {
    showStatus(state.feeds.length
      ? "Your saved JSON stories are up to date."
      : "Add a feed before refreshing.", state.feeds.length ? "success" : "");
    return;
  }
  isRefreshing = true;
  refreshButton.disabled = true;
  refreshButton.classList.add("is-refreshing");
  showStatus("Refreshing your feeds…");
  try {
    const results = await Promise.allSettled(refreshableFeeds.map((feed) => fetchFeed(feed.url)));
    const failures = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        const { feed, stories } = result.value;
        const previousStories = new Map(state.stories.map((story) => [story.id, story]));
        const refreshedStories = stories.map((story) => {
          const previous = previousStories.get(story.id);
          if (!previous) return story;
          return {
            ...story,
            image: story.image || previous.image,
            bookmarked: Boolean(story.bookmarked || previous.bookmarked),
            read: previous.read === true || story.read === true,
            fullContentMarkdown: previous.fullContentMarkdown,
            fullContentImages: previous.fullContentImages,
            fullContentLoaded: Boolean(previous.fullContentMarkdown),
          };
        });
        state.feeds = state.feeds.map((saved) => saved.url === feed.url
          ? { ...feed, folderId: saved.folderId || "" }
          : saved);
        const refreshedIds = new Set(refreshedStories.map((story) => story.id));
        const retainedStories = state.stories.filter((story) =>
          story.feedUrl === feed.url &&
          !refreshedIds.has(story.id) &&
          !isExpiredReadStory(story),
        );
        state.stories = [
          ...state.stories.filter((story) => story.feedUrl !== feed.url),
          ...retainedStories,
          ...refreshedStories,
        ];
      } else {
        failures.push(result.reason);
      }
    }
    state.stories = state.stories.filter((story) => !isExpiredReadStory(story));
    saveState();
    render();
    if (failures.length) {
      failures.forEach((error) => console.error("Could not refresh a feed.", error));
      showStatus(`Updated available feeds. ${failures.length} feed${failures.length === 1 ? "" : "s"} could not be refreshed; saved stories are still shown.`, "error");
    } else {
      showStatus("All feeds are up to date.", "success");
    }
  } finally {
    isRefreshing = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-refreshing");
  }
}

function resetPullRefresh() {
  pullStart = null;
  pullDistance = 0;
  pullRefreshIndicator.style.setProperty("--pull-distance", "0px");
  pullRefreshIndicator.removeAttribute("data-state");
  pullRefreshIndicator.setAttribute("aria-hidden", "true");
  pullRefreshLabel.textContent = "Pull to refresh";
}

function updateBackToTopButton() {
  backToTopButton.hidden = window.scrollY <= BACK_TO_TOP_THRESHOLD;
}

function handlePullStart(event) {
  if (event.touches.length !== 1 || window.scrollY > 0 || readerView.hidden === false ||
    addDialog.open || imageDialog.open || sidebar.classList.contains("is-open") ||
    event.target.closest("button, a, input, textarea, select, iframe, dialog")) {
    pullStart = null;
    return;
  }
  pullStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}

function handlePullMove(event) {
  if (!pullStart || event.touches.length !== 1 || window.scrollY > 0) return;
  const touch = event.touches[0];
  const deltaX = touch.clientX - pullStart.x;
  const deltaY = touch.clientY - pullStart.y;
  if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
    resetPullRefresh();
    return;
  }

  if (deltaY < 8) return;
  event.preventDefault();
  pullDistance = Math.min(PULL_REFRESH_THRESHOLD + 28, deltaY * 0.65);
  pullRefreshIndicator.style.setProperty("--pull-distance", `${pullDistance}px`);
  pullRefreshIndicator.setAttribute("aria-hidden", "false");
  const ready = pullDistance >= PULL_REFRESH_THRESHOLD;
  pullRefreshIndicator.dataset.state = ready ? "ready" : "pulling";
  pullRefreshLabel.textContent = ready ? "Release to refresh" : "Pull to refresh";
}

function handlePullEnd() {
  if (!pullStart) return;
  const shouldRefresh = pullDistance >= PULL_REFRESH_THRESHOLD;
  pullStart = null;
  if (!shouldRefresh || isRefreshing) {
    resetPullRefresh();
    return;
  }

  pullRefreshIndicator.dataset.state = "refreshing";
  pullRefreshIndicator.setAttribute("aria-hidden", "false");
  pullRefreshLabel.textContent = "Refreshing feeds…";
  Promise.resolve(refreshFeeds())
    .catch((error) => {
      console.error("Could not refresh feeds after pull gesture.", error);
      showStatus("Could not refresh your feeds. Please try again.", "error");
    })
    .finally(resetPullRefresh);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  addFeed(feedInput.value);
});
storyFilterButtons.forEach((button) => {
  button.addEventListener("click", () => selectStoryFilter(button.dataset.storyFilter));
});
markAllReadButton.addEventListener("click", markAllUnreadAsRead);
exportButton.addEventListener("click", exportOpml);
importButton.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", () => importOpml(importFileInput.files[0]));
refreshButton.addEventListener("click", refreshFeeds);
backToTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("scroll", updateBackToTopButton, { passive: true });
document.addEventListener("touchstart", handlePullStart, { passive: true });
document.addEventListener("touchmove", handlePullMove, { passive: false });
document.addEventListener("touchend", handlePullEnd, { passive: true });
document.addEventListener("touchcancel", resetPullRefresh, { passive: true });
backButton.addEventListener("click", closeStory);
closeImageDialogButton.addEventListener("click", closeImageZoom);
imageDialog.addEventListener("click", (event) => {
  if (event.target === imageDialog) closeImageZoom();
});
imageDialog.addEventListener("close", () => {
  zoomedImage.removeAttribute("src");
  lastImageTrigger?.focus();
  lastImageTrigger = null;
});
menuToggle.addEventListener("click", () => setSidebarOpen(!sidebar.classList.contains("is-open")));
closeSidebarButton.addEventListener("click", () => setSidebarOpen(false));
sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));
allFeedsButton.addEventListener("click", () => selectFeed(""));
bookmarksButton.addEventListener("click", selectBookmarks);
settingsButton.addEventListener("click", openSettings);
themeToggle.addEventListener("click", toggleTheme);
document.addEventListener("click", (event) => {
  if (event.target.closest(".sidebar-actions")) return;
  sidebar.querySelectorAll(".sidebar-actions[open]").forEach((menu) => {
    menu.open = false;
  });
});
addFolderButton.addEventListener("click", () => {
  addFolderForm.hidden = !addFolderForm.hidden;
  folderCreateStatus.textContent = "";
  if (!addFolderForm.hidden) newFolderNameInput.focus();
});
cancelAddFolderButton.addEventListener("click", () => {
  addFolderForm.hidden = true;
  newFolderNameInput.value = "";
  folderCreateStatus.textContent = "";
});
addFolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addFolder(newFolderNameInput.value);
});
retentionSelect.addEventListener("change", updateRetentionPreview);
saveSettingsButton.addEventListener("click", saveRetentionSetting);
closeSettingsButton.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
settingsDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  settingsDialog.close();
});
readerBookmarkToggle.addEventListener("click", () => {
  const story = state.stories.find((candidate) => candidate.id === openStoryId);
  if (story) toggleBookmark(story);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sidebar.classList.contains("is-open")) setSidebarOpen(false);
});
addToggle.addEventListener("click", () => {
  dialogStatusElement.textContent = "";
  dialogStatusElement.className = "status";
  addDialog.showModal();
  addToggle.setAttribute("aria-expanded", "true");
  feedInput.focus();
});
closeDialogButton.addEventListener("click", () => addDialog.close());
addDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  addDialog.close();
});
addDialog.addEventListener("click", (event) => {
  if (event.target === addDialog) addDialog.close();
});
addDialog.addEventListener("close", () => {
  addToggle.setAttribute("aria-expanded", "false");
  addToggle.focus();
});
window.addEventListener("online", () => showStatus("You’re back online.", "success"));
window.addEventListener("offline", () => {
  showStatus("You’re offline. Saved stories are still available.", "error");
});

render();
updateThemeToggle();
updateBackToTopButton();
if (navigator.onLine && state.feeds.some((feed) => validFeedUrl(feed.url))) refreshFeeds();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Could not register the offline app worker.", error);
    });
  });
}
