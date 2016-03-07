Flowplayer hlsjs plugin
===========================

This plugin provides the `hlsjs` [engine](https://flowplayer.org/docs/api.html#engines) for
playback of [HLS](https://flowplayer.org/docs/setup.html#hls) streams in browsers which do not
support playback of HLS in a VIDEO tag, and without the need for
[Flash](https://flowplayer.org/docs/setup.html#flash-hls).

The plugin relies on the [hls.js](https://github.com/dailymotion/hls.js) client, courtesy of
[dailymotion](http://www.dailymotion.com).

Usage
-----

In production simply load the latest plugin after the Flowplayer script:

```html
<script src="//releases.flowplayer.org/6.0.5/flowplayer.min.js"></script>
<script src="//releases.flowplayer.org/hlsjs/flowplayer.hlsjs.min.js"></script>
```

Sources configuration:

```js
clip: {
   sources: [
        { type: "application/x-mpegurl", src: "//example.com/video.m3u8" },
        { type: "video/webm",            src: "//example.com/video.webm" },
        { type: "video/mp4",             src: "//example.com/video.mp4" }
   ]
}
```

### CommonJS

The plugin can be used in a [browserify](http://browserify.org) and/or
[webpack](https://webpack.github.io/) environment with a
[commonjs](http://requirejs.org/docs/commonjs.html) loader:

```js
var flowplayer = require('flowplayer');
require('flowplayer-hlsjs'); // Plugin injects itself to flowplayer

flowplayer('#container', {
  clip: {
    sources: [{
      type: 'application/x-mpegurl',
      src: '//stream.flowplayer.org/bauhaus.m3u8'
    }]
  }
});
```

Plugin configuration
--------------------

The plugin provides the `hlsjs` option on the
[global](https://flowplayer.org/docs/setup.html#global-configuration)
[player](https://flowplayer.org/docs/setup.html#player-options) and
[clip](https://flowplayer.org/docs/setup.html#player-options) levels.

The `hlsjs` option is an object which accepts all
[configuration parameters for hls.js](https://github.com/dailymotion/hls.js/blob/master/API.md#fine-tuning)
which are passed on to the client.

Setting `hlsjs` to `false` can be used to disable the engine for a specific player or clip.
Convenient when one knows that certain HLS streams are not served with the required [CORS](#cors)
policy.

### Manual quality selection

To enable and configure manual selection of HLS levels the plugin provides the `hlsQualities` option
on the global player and clip level.

option   | type          | description
:------- | :------------ | :----------
`hlsQualities` | boolean | By default manual quality selection is disabled. Set to `true` to make all HLS levels available for manual selection.
`hlsQualities` | array | Accepts and array of level index numbers from `0` (lowest) to highest to limit the number of HLS levels available for manual selection.

`hlsQualities` can also be configured as
[HTML data attribute](https://flowplayer.org/docs/setup.html#html-configuration) in a
[VIDEO tag based installation](https://flowplayer.org/docs/setup.html#videotag-install); for
example:

```html
<!-- set hlsQualities at clip level -->
<video data-hls-qualities="1,3,6,7">
<!-- ... -->
```

The user interface is the same as for the
[quality selector plugin](https://flowplayer.org/docs/plugins.html#quality-selector).
The same CSS file must be loaded:

```html
<script src="//releases.flowplayer.org/quality-selector/flowplayer.quality-selector.min.js"></script>
```

hlsjs manual quality selection integrates smoothly with the VOD quality selector plugin: If the
player should fail over to VOD quality selection in browsers not supporting hlsjs (for instance
[Mac OS Safari](#known-issues-and-constraints)), load the quality selector script after the hlsjs
plugin and make sure that `hlsQualities` are configured on the player or global level.


### Plugin options

Additionally the `hlsjs` configuration object accepts the following Flowplayer specific parameters:

option   | default value | description
:------- | :------------ | :----------
`anamorphic` | `false`   |Set to `true` for streams with a non-square sample aspect ratio. Some browsers do not handle these correctly, and will then not attempt to play them. *Caveat:* As these streams will not be played correctly by the [Flash HLS engine](https://flowplayer.org/docs/setup.html#flash-hls) either because Flash is agnostic of display aspect ratio, the `application/x-mpegurl` type should be set twice in the sources array, with the `engine` [source option](https://flowplayer.org/docs/setup.html#source-options) `hlsjs` and `html5`.
`autoLevelCapping` | `-1` | Forbids the player to pick a higher clip resolution/bitrate than specified when in ABR mode. Accepts an index number from `0` (lowest) to highest. The default value `-1` means no capping, and may also be specified as boolean `false`.
`recover` | `0` | Maximum attempts to recover from network and media errors which are considered fatal by hls.js. Set to `-1` for an infinite amount of recovery attempts. - Be careful, the player may have to be rescued from an undefined state.
`smoothSwitching` | `true` | Whether manual HLS quality selection should be smooth - level change with begin of next segment - or instant. Setting `false` can cause a playback pause on switch.
`startLevel` | | Tells the player which clip resolution/bitrate to pick initially. Accepts an index number from `0` (lowest) to highest. Defaults to the level listed first in the master playlist, as with [generic HLS playback](https://developer.apple.com/library/ios/documentation/NetworkingInternet/Conceptual/StreamingMediaGuide/UsingHTTPLiveStreaming/UsingHTTPLiveStreaming.html#//apple_ref/doc/uid/TP40008332-CH102-SW18). Set to `-1` or `"auto"` for automatic selection. - To override a specified setting locally with the default, set this to `"firstLevel"`.
`strict` | `false`       | Set to `true` if you want non fatal `hls.js` errors to trigger Flowplayer errors. Useful for debugging streams and live stream maintenance.


### Access to hls.js API

The [hls.js API](https://github.com/dailymotion/hls.js/blob/master/API.md), namely the
[quality switch control](https://github.com/dailymotion/hls.js/blob/master/API.md#quality-switch-control-api),
can be accessed via the `engine.hlsjs` object of the Flowplayer API.

Simple example:

```js
// switch to first hls level
flowplayer(0).engine.hlsjs.nextLevel = 0;
```

### Events

The plugin integrates listeners to all
[hls.js runtime events](https://github.com/dailymotion/hls.js/blob/master/API.md#runtime-events)
into the [player API](https://flowplayer.org/docs/api.html#events). The third argument of the event
handle functions gives access to the event's data object.

Simple example:

```js
flowplayer(0).on("hlsLevelSwitch", function (e, api, data) {
  var level = api.engine.hlsjs.levels[data.level];

  console.log("level index:", data.level);
  console.log("width:", level.width, "height:", level.height);
});
```

Note: `hlsLevelSwitch` above refers to the `LEVEL_SWITCH` constant in the
[hls.js documentation](https://github.com/dailymotion/hls.js/blob/master/API.md#runtime-events).
The constants are translated into event types like so:

`hls` + Captitalized contstant + Camel case for `_`Underscored letter

CORS
----

The HLS streams must be loaded from a server with a
[cross domain policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS)
permitting `GET` requests.

Demo
----

A fully documented demo can be found [here](http://demos.flowplayer.org/api/hlsjs.html).

Features
--------

- packs a compatibility tested version - current:
  [v0.5.8](https://github.com/dailymotion/hls.js/releases/tag/v0.5.8) - of hls.js
- by default the engine is only loaded if the browser supports
  [MediaSource extensions](http://w3c.github.io/media-source/) reliably for playback
- configurable manual HLS quality selection

Debugging
---------

A quick way to find out whether there's a problem with the actual plugin component is to
run your stream in the [hls.js demo player](http://dailymotion.github.io/hls.js/demo/).

For fine grained debugging load the unminified components and turn hlsjs debugging on:

```html
<script src="//releases.flowplayer.org/6.0.5/flowplayer.min.js"></script>
<!-- unminified hls.js library -->
<script src="//releases.flowplayer.org/hlsjs/hls.js"></script>
<!-- separate hlsjs plugin component -->
<script src="//releases.flowplayer.org/hlsjs/flowplayer.hlsjs.js"></script>

<script>
// turn on hlsjs debugging
flowplayer.conf.hlsjs = {
  debug: true
});
</script>
```

### Building the plugin

Build requirement:

- [nodejs](https://nodejs.org) with [npm](https://www.npmjs.com)

```sh
cd flowplayer-hlsjs
make deps
make
```

Known issues and constraints
----------------------------

- Only codecs which are valid in advanced MP4 video/audio and are supported by MSE are allowed:
  [MPEG-4 AVC](https://en.wikipedia.org/wiki/H.264/MPEG-4_AVC) for video,
  [AAC](https://en.wikipedia.org/wiki/Advanced_Audio_Coding) for audio.
- Safari's MSE implementation has fatal problems with
  [fragmented MP4 playback](https://github.com/dailymotion/hls.js/issues/9) - for the moment the
  hlsjs engine will only be loaded in Safari for [debugging purposes](#debugging).
