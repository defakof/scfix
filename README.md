# scfix

A calmer SoundCloud for Chrome: an editorial redesign of the web player with a live scope visualizer, light and dark themes, and a shuffle that actually covers your whole library.

## What you get

- **A new interface over soundcloud.com.** Serif typography, warm paper tones (or a warm dark theme), your likes grouped by the month you liked them, filter and sort.
- **Now Playing.** A big, quiet view of the current track with a live visualizer and an Up Next queue you can jump around in, trim, or reshuffle.
- **A visualizer that follows the music.** By default it draws the song’s real waveform, held steady like an oscilloscope; a calmer band-based style is one click away. It ignores the volume slider and uses SoundCloud’s loudness map of the whole song, so quiet intros stay small and drops hit big. Smoothness, zoom, height and lookahead are adjustable in Settings → Visualizer (or the Visualizer button on Now Playing).
- **Shuffle that works.** SoundCloud's own shuffle only mixes the first few dozen loaded tracks. scfix loads the whole list (likes or playlists) and shuffles everything, including tracks before the one you started from. ~1,400 likes shuffle in under a second once preloaded.
- **Your whole library.** Feed, search, playlists, artist pages and the people you follow all have scfix screens, with Back and Esc to step back. Playlists and artist pages play in order or with full shuffle.
- **Keyboard shortcuts.** Space, ← → to seek, Shift ← → for previous/next, S shuffle, L like, N Now Playing, / search, Esc back, C classic SoundCloud.
- **Classic mode.** Press C (or open History) to use SoundCloud's own interface; a button in the corner brings you back.

Playback stays SoundCloud's own player, so your login, play counts, Go+ and everything else keep working.

## Install

1. Download `scfix-v2.1.1.zip` from the [latest release](https://github.com/defakof/scfix/releases/latest) and unzip it, or clone this repo
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select the folder that has `manifest.json` directly inside
5. Reload any open SoundCloud tabs

## How it works

- `page.js` runs in SoundCloud's own page. It finds SoundCloud's internal player by the methods it has (never by module number, so it survives most updates), taps its Web Audio graph for the visualizer, loads likes 200 per request with a background preload shared with SoundCloud's own requests, and implements full shuffle.
- `app.js` draws the interface in an isolated shadow root, so SoundCloud's styles can't leak in. It talks to `page.js` through window messages: state comes in four times a second, commands go out.
- To play a list, scfix steers the SoundCloud page underneath (it opens the list and starts the track) and then controls SoundCloud's player directly.

## Privacy

- One permission: `storage`, for your settings
- No data collection, no analytics, no external servers
- Network requests go only to SoundCloud's API and to Google Fonts for the typefaces

## Limitations

- Chrome only for now (any Chromium browser with Manifest V3 should work)
- History still opens in classic SoundCloud
- The feed needs you to be signed in to SoundCloud
- Tracks SoundCloud won't play in your region, and Go+ previews, are shown dimmed and left out of shuffles
- scfix relies on SoundCloud's internal player code. If an update breaks it, please [open an issue](https://github.com/defakof/scfix/issues).
