# Little RSS Reader

A small, build-free RSS and Atom reader made with plain HTML, CSS, and JavaScript. Click a story to read it inside the app. It is a static site and can be published on GitHub Pages.

## Run locally

Open `index.html` in a browser to try the reader. You can paste a direct RSS/Atom URL or a website URL; the app will try to discover a feed for a website automatically. YouTube channel RSS URLs, `/channel/UC...` channel URLs, and `@handle` URLs (for example, `https://www.youtube.com/@ggukim`) show video stories with thumbnails. Handle URLs are converted through a public RSSHub instance, which may be unavailable or rate-limited. Opening a video shows its preview in the app and opens playback on YouTube in a new tab. Bilibili user profile URLs (such as `https://space.bilibili.com/123456`) are converted to a video feed through the same public RSSHub instance; opening a video plays it in the app, with a link to open it on Bilibili if needed. Direct RSSHub Bilibili user-video feed URLs are supported too. A **Download video** button appears only when the feed itself provides a direct video-file attachment; YouTube and Bilibili watch links alone are not downloadable files. Whether a remote file downloads or opens in the browser depends on that file server's headers and browser policy. Opening a regular story also attempts to retrieve the full article and its images in the app, while trimming common comment and related-content sections. These features need an internet connection and use public RSS2JSON, RSSHub, and feedsearch.dev services (feed discovery, video-feed conversion, and article extraction use the Jina Reader proxy) because many feed and article servers do not allow browser requests directly. YouTube and Bilibili thumbnails and video playback are served by those platforms. These third-party services receive the URLs you request and may impose availability or usage limits outside this app's control.

For offline/PWA testing, serve the folder over HTTPS or localhost (for example, `npx serve .`) instead of opening the file directly. Your feed list and latest fetched stories are saved in browser storage. Use the top-bar refresh button to update saved feeds. Use the import and export buttons to merge OPML subscriptions with your library or download your subscriptions as an OPML file. Feed folders are included in OPML; stories, bookmarks, theme, and reading settings are not. Imported subscriptions already in your library are skipped. Create folders with the **+** beside Feeds. Use a feed’s **•••** menu to move it into a folder or back to Ungrouped; folder menus can rename or delete folders.
Use the sidebar theme control to switch between light and dark mode; your choice is saved on that device.
On a touch screen, pull down from the top of the story list and release when prompted to refresh feeds.
Bookmark stories from their cards or the reader, then open **Bookmarks** in the sidebar to see them later. Click a story or article image to view it larger in the app.
Opening a story marks it as read. Scrolling does not change read status. Use the **Unread**, **All**, and **Read** filters in the top bar; the Unread filter shows the number of unread stories. Use **Mark all read** to mark unread stories in the current view as read, or swipe a story card left on a touch device to mark it read.
Choose a retention period in **Settings**. When saving the setting, the app shows how many old read stories will be removed and asks for confirmation. Unread and bookmarked stories are kept. Refreshing feeds retains older stories within the selected period; **Keep all** disables age-based cleanup.

## Publish on GitHub Pages

1. Create a GitHub repository and add these files to its root.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**, choose `main` and `/(root)`, then save.
4. Open the Pages URL after deployment. Use the **+** button to add a website/feed URL.

The app uses relative file paths, so it also works when the GitHub Pages site is published under a repository subpath. After its first visit, the app shell and saved stories are available offline. Each device/browser keeps its own feeds and stories.
