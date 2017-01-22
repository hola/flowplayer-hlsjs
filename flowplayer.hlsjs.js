/*jslint browser: true, for: true, node: true */
/*global window */
/*!

   hlsjs engine plugin for Flowplayer HTML5

   Copyright (c) 2015-2016, Flowplayer Oy

   Released under the MIT License:
   http://www.opensource.org/licenses/mit-license.php

   Includes hls.js
   Copyright (c) 2015 Dailymotion (http://www.dailymotion.com)
   https://github.com/dailymotion/hls.js/blob/master/LICENSE

   Includes es5.js
   https://github.com/inexorabletash/polyfill/blob/master/es5.js
   for compatibility with legacy browsers

   Requires Flowplayer HTML5 version 6.x
   revision: $GIT_ID$

*/
(function () {
    "use strict";
    var extension = function (Hls, flowplayer) {
        var engineName = "holaHls",
            hlsconf,
            common = flowplayer.common,
            extend = flowplayer.extend,
            support = flowplayer.support,
            version = flowplayer.version,

            isHlsType = function (typ) {
                return typ.toLowerCase().indexOf("mpegurl") > -1;
            },
            hlsQualitiesSupport = function (conf) {
                var hlsQualities = conf.clip.hlsQualities || conf.hlsQualities;

                return support.inlineVideo &&
                        (hlsQualities === true ||
                        (hlsQualities && hlsQualities.length));
            },

            engineImpl = function hlsjsEngine2(player, root) {
                var bean = flowplayer.bean,
                    videoTag,
                    hls,
                    recover,

                    // pre 6.0.4 poster detection
                    bc,
                    has_bg,

                    posterClass = "is-poster",
                    addPoster = function (e, autoplay) {
                        if (!autoplay) {
                            common.addClass(root, posterClass);
                            player.poster = true;
                        }
                    },
                    removePoster = function () {
                        if (player.poster) {
                            bean.one(videoTag, "timeupdate." + engineName, function () {
                                common.removeClass(root, posterClass);
                                player.poster = false;
                            });
                        }
                    },

                    getStartLevelConf = function (conf) {
                        var value = conf.startLevel;

                        switch (value) {
                        case "auto":
                            value = -1;
                            break;
                        case "firstLevel":
                            value = undefined;
                            break;
                        }
                        return value;
                    },

                    qActive = "active",
                    dataQuality = function (quality) {
                        // e.g. "Level 1" -> "level1"
                        if (!quality) {
                            quality = player.quality;
                        }
                        return quality.toLowerCase().replace(/\ /g, "");
                    },
                    removeAllQualityClasses = function () {
                        var qualities = player.qualities;

                        if (!qualities || !qualities.length) {
                            return;
                        }
                        common.removeClass(root, "quality-abr");
                        qualities.forEach(function (quality) {
                            common.removeClass(root, "quality-" + dataQuality(quality));
                        });
                    },
                    qClean = function () {
                        delete player.hlsQualities;
                        removeAllQualityClasses();
                        common.find(".fp-quality-selector", root).forEach(common.removeNode);
                    },
                    qIndex = function () {
                        return player.hlsQualities[player.qualities.indexOf(player.quality) + 1];
                    },
                    initQualitySelection = function (hlsQualitiesConf, conf, data) {
                        var levels = data.levels,
                            hlsQualities = [],
                            qIndices = [],
                            levelIndex = 0,
                            selector;

                        qClean();
                        if (hlsQualitiesConf === "drive") {
                            switch (levels.length) {
                            case 4:
                                hlsQualities = [1, 2, 3];
                                break;
                            case 5:
                                hlsQualities = [1, 2, 3, 4];
                                break;
                            case 6:
                                hlsQualities = [1, 3, 4, 5];
                                break;
                            case 7:
                                hlsQualities = [1, 3, 5, 6];
                                break;
                            case 8:
                                hlsQualities = [1, 3, 6, 7];
                                break;
                            default:
                                if (levels.length < 3 ||
                                        (levels[0].height && levels[2].height && levels[0].height === levels[2].height)) {
                                    return;
                                }
                                hlsQualities = [1, 2];
                            }
                        } else {
                            if (typeof hlsQualitiesConf === "string") {
                                hlsQualitiesConf.split(/\s*,\s*/).forEach(function (q) {
                                    qIndices.push(parseInt(q, 10));
                                });
                            } else if (typeof hlsQualitiesConf !== "boolean") {
                                hlsQualitiesConf.forEach(function (q) {
                                    qIndices.push(typeof q === "number"
                                        ? q
                                        : q.level);
                                });
                            }
                            levels.forEach(function (level) {
                                // do not check audioCodec,
                                // as e.g. HE_AAC is decoded as LC_AAC by hls.js on Android
                                if ((hlsQualitiesConf === true || qIndices.indexOf(levelIndex) > -1) &&
                                        (!level.videoCodec ||
                                        (level.videoCodec &&
                                        window.MediaSource.isTypeSupported('video/mp4;codecs=' + level.videoCodec)))) {
                                    hlsQualities.push(levelIndex);
                                }
                                levelIndex += 1;
                            });
                            if (hlsQualities.length < 2) {
                                return;
                            }
                        }

                        player.qualities = [];
                        hlsQualities.forEach(function (idx) {
                            var level = levels[idx],
                                width = level.width,
                                height = level.height,
                                q = qIndices.length
                                    ? hlsQualitiesConf[qIndices.indexOf(idx)]
                                    : idx,
                                label = typeof q === "object"
                                    ? q.label
                                    : (width && height)
                                        ? Math.min(width, height) + "p"
                                        : "Level " + (idx + 1);

                            player.qualities.push(label);
                        });

                        selector = common.createElement("ul", {
                            "class": "fp-quality-selector"
                        });
                        common.find(".fp-ui", root)[0].appendChild(selector);

                        hlsQualities.unshift(-1);
                        player.hlsQualities = hlsQualities;

                        if (!player.quality || player.qualities.indexOf(player.quality) < 0) {
                            hls.startLevel = getStartLevelConf(conf);
                            player.quality = "abr";
                        } else {
                            hls.startLevel = qIndex();
                            hls.loadLevel = hls.startLevel;
                        }

                        selector.appendChild(common.createElement("li", {
                            "data-quality": "abr"
                        }, "Auto"));
                        player.qualities.forEach(function (q) {
                            selector.appendChild(common.createElement("li", {
                                "data-quality": dataQuality(q)
                            }, q));
                        });

                        common.addClass(root, "quality-" + dataQuality());

                        bean.on(root, "click." + engineName, ".fp-quality-selector li", function (e) {
                            var choice = e.currentTarget,
                                selectors,
                                active,
                                smooth = conf.smoothSwitching,
                                paused = videoTag.paused,
                                i;

                            if (common.hasClass(choice, qActive)) {
                                return;
                            }

                            if (!paused && !smooth) {
                                bean.one(videoTag, "pause." + engineName, function () {
                                    common.removeClass(root, "is-paused");
                                });
                            }

                            selectors = common.find(".fp-quality-selector li", root);

                            for (i = 0; i < selectors.length; i += 1) {
                                active = selectors[i] === choice;
                                if (active) {
                                    player.quality = i > 0
                                        ? player.qualities[i - 1]
                                        : "abr";
                                    if (smooth && !player.poster) {
                                        hls.nextLevel = qIndex();
                                    } else {
                                        hls.currentLevel = qIndex();
                                    }
                                    common.addClass(choice, qActive);
                                    if (paused) {
                                        videoTag.play();
                                    }
                                }
                                common.toggleClass(selectors[i], qActive, active);
                            }
                            removeAllQualityClasses();
                            common.addClass(root, "quality-" + dataQuality());
                        });
                    },

                    engine = {
                        engineName: engineName,

                        pick: function (sources) {
                            var i,
                                source;

                            for (i = 0; i < sources.length; i += 1) {
                                source = sources[i];
                                if (isHlsType(source.type)) {
                                    if (typeof source.src === 'string') {
                                        source.src = common.createAbsoluteUrl(source.src);
                                    }
                                    return source;
                                }
                            }
                        },

                        load: function (video) {
                            var conf = player.conf,
                                EVENTS = {
                                    ended: "finish",
                                    loadeddata: "ready",
                                    pause: "pause",
                                    play: "resume",
                                    progress: "buffer",
                                    ratechange: "speed",
                                    seeked: "seek",
                                    timeupdate: "progress",
                                    volumechange: "volume"
                                },
                                HLSEVENTS = Hls.Events,
                                autoplay = !!video.autoplay || !!conf.autoplay,
                                hlsQualitiesConf = video.hlsQualities || conf.hlsQualities,
                                hlsUpdatedConf = extend(hlsconf, conf.hlsjs, conf.clip.hlsjs, video.hlsjs),
                                hlsClientConf = extend({}, hlsUpdatedConf),
                                hlsParams = [
                                    "autoLevelCapping", "startLevel",
                                    "adaptOnStartOnly", "smoothSwitching",
                                    "anamorphic", "recover", "strict"
                                ];

                            if (!hls) {
                                common.removeNode(common.findDirect("video", root)[0]
                                        || common.find(".fp-player > video", root)[0]);
                                videoTag = common.createElement("video", {
                                    "class": "fp-engine " + engineName + "-engine",
                                    "autoplay": autoplay
                                        ? "autoplay"
                                        : false,
                                    "preload": conf.clip.preload || "metadata",
                                    "x-webkit-airplay": "allow"
                                });

                                Object.keys(EVENTS).forEach(function (key) {
                                    var flow = EVENTS[key],
                                        type = key + "." + engineName,
                                        arg;

                                    bean.on(videoTag, type, function (e) {
                                        if (conf.debug && flow.indexOf("progress") < 0) {
                                            console.log(type, "->", flow, e.originalEvent);
                                        }
                                        if (!player.ready && flow.indexOf("ready") < 0) {
                                            return;
                                        }

                                        var ct,
                                            buffered,
                                            buffer = 0,
                                            buffend = 0,
                                            i,
                                            quality = player.quality,
                                            selectorIndex;

                                        switch (flow) {
                                        case "ready":
                                            arg = extend(player.video, {
                                                duration: videoTag.duration,
                                                seekable: videoTag.seekable.end(null),
                                                width: videoTag.videoWidth,
                                                height: videoTag.videoHeight,
                                                url: player.video.src
                                            });
                                            break;
                                        case "resume":
                                            removePoster();
                                            break;
                                        case "seek":
                                            arg = videoTag.currentTime;
                                            removePoster();
                                            break;
                                        case "progress":
                                            arg = videoTag.currentTime;
                                            break;
                                        case "speed":
                                            arg = videoTag.playbackRate;
                                            break;
                                        case "volume":
                                            arg = videoTag.volume;
                                            break;
                                        case "buffer":
                                            try {
                                                ct = videoTag.currentTime;
                                                buffered = videoTag.buffered;
                                                buffer = buffered.end(null);
                                                if (ct) {
                                                    // cycle through time ranges to obtain buffer
                                                    // nearest current time
                                                    for (i = buffered.length - 1; i > -1; i -= 1) {
                                                        buffend = buffered.end(i);
                                                        if (buffend >= ct) {
                                                            buffer = buffend;
                                                        }
                                                    }
                                                }
                                            } catch (ignore) {}
                                            video.buffer = buffer;
                                            arg = e;
                                            break;
                                        }

                                        player.trigger(flow, [player, arg]);

                                        if (flow === "ready" && quality) {
                                            selectorIndex = quality === "abr"
                                                ? 0
                                                : player.qualities.indexOf(quality) + 1;
                                            common.addClass(common.find(".fp-quality-selector li", root)[selectorIndex],
                                                    qActive);
                                        }
                                    });
                                });

                                if (conf.poster) {
                                    // engine too late, poster already removed
                                    // abuse timeupdate to re-instate poster
                                    bean.one(videoTag, "seeked." + engineName, function () {
                                        if (videoTag.currentTime < 0.5) {
                                            // slow loading streams need this
                                            bean.one(videoTag, "timeupdate." + engineName, function (e) {
                                                addPoster(e, autoplay || player.video.autoplay);
                                            });
                                        }
                                        player.on("stop." + engineName, function () {
                                            bean.one(videoTag, "timeupdate." + engineName, addPoster);
                                        });
                                    });
                                }

                                player.on("error." + engineName, function () {
                                    if (hls) {
                                        hls.destroy();
                                        hls = 0;
                                    }
                                });

                                common.prepend(common.find(".fp-player", root)[0], videoTag);

                            } else {
                                hls.destroy();
                                if ((player.video.src && video.src !== player.video.src) || video.index) {
                                    common.attr(videoTag, "autoplay", "autoplay");
                                }
                            }

                            // #28 obtain api.video props before ready
                            player.video = video;

                            hlsParams.forEach(function (key) {
                                var value = hlsUpdatedConf[key];

                                delete hlsClientConf[key];

                                switch (key) {
                                case "adaptOnStartOnly":
                                    if (value) {
                                        hlsUpdatedConf.startLevel = -1;
                                    }
                                    break;
                                case "autoLevelCapping":
                                    if (value === false) {
                                        value = -1;
                                    }
                                    hlsClientConf[key] = value;
                                    break;
                                case "recover":
                                    recover = hlsUpdatedConf.strict
                                        ? 0
                                        : value;
                                    break;
                                }
                            });

                            hlsClientConf.autoStartLoad = false;

                            hlsClientConf = extend(hlsClientConf,
                                flowplayer.hola_config);
                            hls = new Hls(hlsClientConf);
                            player.engine[engineName] = hls;

                            // will be overridden in MANIFEST_PARSED if
                            // hlsQualities are configured and valid
                            hls.startLevel = getStartLevelConf(hlsUpdatedConf);

                            Object.keys(HLSEVENTS).forEach(function (key) {
                                var etype = HLSEVENTS[key],
                                    listeners = hlsUpdatedConf.listeners,
                                    expose = listeners && listeners.indexOf(etype) > -1;

                                hls.on(etype, function (e, data) {
                                    var fperr,
                                        errobj = {},
                                        updatedVideo = player.video,
                                        src = updatedVideo.src;

                                    switch (key) {
                                    case "MEDIA_ATTACHED":
                                        hls.loadSource(src);
                                        break;

                                    case "MANIFEST_PARSED":
                                        if (hlsQualitiesSupport(conf)) {
                                            if (updatedVideo.hlsQualities !== false) {
                                                initQualitySelection(hlsQualitiesConf, hlsUpdatedConf, data);
                                            } else {
                                                qClean();
                                            }
                                        } else {
                                            delete player.quality;
                                        }
                                        hls.startLoad(hlsClientConf.startPosition);
                                        break;

                                    case "ERROR":
                                        if (data.fatal || hlsUpdatedConf.strict) {
                                            switch (data.type) {
                                            case Hls.ErrorTypes.NETWORK_ERROR:
                                                if (recover) {
                                                    hls.startLoad();
                                                    if (recover > 0) {
                                                        recover -= 1;
                                                    }
                                                } else if (data.frag && data.frag.url) {
                                                    errobj.url = data.frag.url;
                                                    fperr = 2;
                                                } else {
                                                    fperr = 4;
                                                }
                                                break;
                                            case Hls.ErrorTypes.MEDIA_ERROR:
                                                if (recover) {
                                                    hls.recoverMediaError();
                                                    if (recover > 0) {
                                                        recover -= 1;
                                                    }
                                                } else {
                                                    fperr = 3;
                                                }
                                                break;
                                            default:
                                                fperr = 5;
                                            }

                                            if (fperr !== undefined) {
                                                errobj.code = fperr;
                                                if (fperr > 2) {
                                                    errobj.video = extend(updatedVideo, {
                                                        src: src,
                                                        url: data.url || src
                                                    });
                                                }
                                                player.trigger("error", [player, errobj]);
                                            }
                                        }
                                        break;
                                    }

                                    // memory leak if all these are re-triggered by api #29
                                    if (expose) {
                                        player.trigger(e, [player, data]);
                                    }
                                });
                            });

                            if (hlsUpdatedConf.adaptOnStartOnly) {
                                bean.one(videoTag, "timeupdate." + engineName, function () {
                                    hls.loadLevel = hls.loadLevel;
                                });
                            }

                            hls.attachMedia(videoTag);

                            if (videoTag.paused && autoplay) {
                                videoTag.play();
                            }
                        },

                        resume: function () {
                            videoTag.play();
                        },

                        pause: function () {
                            videoTag.pause();
                        },

                        seek: function (time) {
                            videoTag.currentTime = time;
                        },

                        volume: function (level) {
                            if (videoTag) {
                                videoTag.volume = level;
                            }
                        },

                        speed: function (val) {
                            videoTag.playbackRate = val;
                            player.trigger('speed', [player, val]);
                        },

                        unload: function () {
                            if (hls) {
                                var listeners = "." + engineName;

                                hls.destroy();
                                hls = 0;
                                qClean();
                                player.off(listeners);
                                bean.off(root, listeners);
                                bean.off(videoTag, listeners);
                                common.removeNode(videoTag);
                                videoTag = 0;
                            }
                        }
                    };

                // pre 6.0.4: no boolean api.conf.poster and no poster with autoplay
                if (/^6\.0\.[0-3]$/.test(version) &&
                        !player.conf.splash && !player.conf.poster && !player.conf.autoplay) {
                    bc = common.css(root, 'backgroundColor');
                    // spaces in rgba arg mandatory for recognition
                    has_bg = common.css(root, 'backgroundImage') !== "none" ||
                            (bc && bc !== "rgba(0, 0, 0, 0)" && bc !== "transparent");
                    if (has_bg) {
                        player.conf.poster = true;
                    }
                }

                return engine;
            };

        if (Hls.isSupported() && version.indexOf("5.") !== 0) {
            // only load engine if it can be used
            engineImpl.engineName = engineName; // must be exposed
            engineImpl.holaEngine = true;
            engineImpl.canPlay = function (type, conf) {
                var b = support.browser,
                    wn = window.navigator,
                    IE11 = wn.userAgent.indexOf("Trident/7") > -1;

                if (conf[engineName] === false || conf.clip[engineName] === false) {
                    // engine disabled for player or clip
                    return false;
                }

                // merge hlsjs clip config at earliest opportunity
                // XXX pavlo: we load 'hlsjs' provider config, not 'holaHls', that's what customers provide
                hlsconf = extend({
                    smoothSwitching: true,
                    recover: 0
                }, flowplayer.conf.hlsjs, conf.hlsjs, conf.clip.hlsjs);

                if (isHlsType(type)) {
                    // allow all browsers for hlsjs debugging
                    if (hlsconf.debug) {
                        return true;
                    }
                    // https://bugzilla.mozilla.org/show_bug.cgi?id=1244294
                    if (hlsconf.anamorphic &&
                            wn.platform.indexOf("Win") === 0 && b.mozilla && b.version.indexOf("44.") === 0) {
                        return false;
                    }

                    // https://github.com/dailymotion/hls.js/issues/9
                    return IE11 || !b.safari;
                }
                return false;
            };

            // put on top of engine stack
            // so hlsjs is tested before html5 video hls and flash hls
            flowplayer.engines.unshift(engineImpl);

            flowplayer(function (api) {
                // to take precedence over VOD quality selector
                api.pluginQualitySelectorEnabled = hlsQualitiesSupport(api.conf) &&
                        engineImpl.canPlay("application/x-mpegurl", api.conf);
            });
        }

    };
    if (typeof module === 'object' && module.exports) {
        module.exports = extension.bind(undefined, require('hls.js/lib/index.js'));
    } else if (window.Hls && window.flowplayer) {
        extension(window.Hls, window.flowplayer);
    }
}());
