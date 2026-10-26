# scfix: SoundCloud Full Shuffle

A Chrome extension that makes SoundCloud's own **shuffle** button shuffle your *entire* likes or playlist, not just the first 20–100 tracks.

## The problem

On soundcloud.com, shuffle only mixes the tracks that have already been loaded into the play queue. Likes and playlists load in small batches, so with 1,400 liked tracks you hear a shuffled handful of recent likes, then the next handful, and so on. Older likes almost never come up. There's no desktop app to fall back on, so the web player is all there is.

## What scfix does

Press the normal shuffle button and scfix:

1. loads every track of the list into SoundCloud's queue, using SoundCloud's own player
2. lets SoundCloud shuffle the whole thing, including tracks that come *before* the one you started from

A small toast confirms it: **Shuffling all 1,451 tracks**.

| ~1,400 liked tracks | Time until shuffle covers everything |
|---|---|
| Stock SoundCloud (scroll the queue until it's all loaded) | ~15 s+ of scrolling |
| scfix, pressing shuffle right after opening the page | ~3.5 s |
| scfix, after the background preload (~4 s on the page) | **~0.6 s** |

## Install

1. Download `scfix-v1.0.0.zip` from the [latest release](https://github.com/defakof/scfix/releases/latest) and unzip it, or clone this repo
2. Open `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`)
5. Reload any open SoundCloud tabs

## Use

Play something from your likes (or anyone's likes) or a playlist, then press shuffle in the player bar. If shuffle is already on when you start a list, scfix handles it automatically. Turning shuffle off restores the original order.

The feed, stations and autoplay are left alone: they're endless, so they keep SoundCloud's normal behaviour.

## How it works

- **Finds SoundCloud's player.** scfix looks up SoundCloud's internal `PlayManager` by the methods it has (`pullNext`, `toggleShuffle`, …), not by internal module numbers, so it survives most SoundCloud updates.
- **Fills the queue, then shuffles.** When shuffle turns on, it calls `pullNext` until the list is exhausted, moves any tracks before the current one to the end, then lets SoundCloud's own shuffle mix everything after the current track.
- **Loads quickly.** Likes are requested 200 per page instead of 24. When you open a likes page, the remaining pages and any liked playlists are preloaded in the background and handed to SoundCloud when it asks for them. The preload downloads about 4.5 MB of track data for ~1,400 likes (less on the wire, since it's compressed) and is kept in memory for 10 minutes.
- **Avoids SoundCloud's slow path.** While filling the queue it keeps shuffle off and skips a per-track analytics event, which otherwise makes loading about 15× slower and freezes the page.

## Privacy

- No extension permissions
- No data collection, no analytics, no external servers
- The only network requests go to SoundCloud's own API (`api-v2.soundcloud.com`), the same requests SoundCloud makes itself

## Limitations

- Chrome only for now (any Chromium browser that supports Manifest V3 should work)
- Tracks SoundCloud won't play in your region, or Go+ previews, stay out of the queue, as they do on SoundCloud itself
- scfix relies on SoundCloud's internal player code. If a SoundCloud update changes it, scfix turns itself off and shuffle goes back to SoundCloud's default. Please [open an issue](https://github.com/defakof/scfix/issues) if that happens.
