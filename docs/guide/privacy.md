# Privacy

The [published privacy guide](https://grimoiremods.com/docs/privacy) describes
Grimoire's network activity. The following opt-in requests also apply to mod
video previews.

## YouTube previews

Opening mod details fetches the author's embedded video URLs as part of the
existing GameBanana details request. When a video preview scrolls into view,
its thumbnail loads from YouTube's image service at `i.ytimg.com`. This request
contains the video ID and your IP address, with no HTTP referrer. Thumbnails
do not load the YouTube player or start playback.

Clicking Play loads YouTube's privacy-enhanced player from
`www.youtube-nocookie.com`. Playback then contacts YouTube and Google's video
and asset servers. Those services receive the selected video ID, your IP
address, and the normal information sent by an embedded browser player. The
player request identifies the application as `com.grimoire.modmanager` using
the HTTP referrer; it contains no local paths or mod-library metadata.

Watch on YouTube opens the video in your default browser. Closing the mod
details view removes its embedded players. Starting another video stops the
previous one.
