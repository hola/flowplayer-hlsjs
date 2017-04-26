/*jslint browser: true, for: true, node: true */
/*eslint indent: ["error", 4], no-empty: ["error", { "allowEmptyCatch": true }] */
/*eslint-disable quotes, no-console */
/*global window */

/*!

   hlsjs engine plugin for Flowplayer HTML5

   Copyright (c) 2015-2017, Flowplayer Drive Oy

   Released under the MIT License:
   http://www.opensource.org/licenses/mit-license.php

   Includes hls.js
   Copyright (c) 2017 Dailymotion (http://www.dailymotion.com)
   https://github.com/video-dev/hls.js/blob/master/LICENSE

   Requires Flowplayer HTML5 version 6.x
   revision: $GIT_ID$

*/
"use strict";
var E = module.exports;
var ls;
try { ls = window.localStorage; } catch(e){}
var provider_name = 'Hola Flowplayer HLS provider';
var engine_attached = false, engine_disabled = false;
var script_conf = (function script_conf_init(){
    var attrs = {register: 'register-percent', manual_init: 'manual-init'};
    var script = document.currentScript||
        document.querySelector('#hola_flowplayer_hls_provider');
    if (!script)
        return {};
    var rpercent = '{[=it.HOLA_REGISTER_PERCENT]}';
    if (rpercent.startsWith('{['))
    {
        if (!script.hasAttribute(attrs.register))
            return {};
        rpercent = +script.getAttribute(attrs.register);
    }
    if (isNaN(rpercent)||rpercent<0||rpercent>100)
    {
        console.error(provider_name+': invalid '+attrs.register+
            ' attribute, expected a value between 0 and 100 but '+
            script.getAttribute(attrs.register)+' found');
        return {disabled: true};
    }
    if (ls && ls.getItem('hola_provider_register_percent'))
    {
        rpercent = +ls.getItem('hola_provider_register_percent');
        console.info(provider_name+': '+attrs.register+' forced to '+rpercent+
            '% by localStorage configuration');
    }
    var embedded = '{[=it.HOLA_EMBEDDED_PROVIDER]}'==1;
    var autoinit = !embedded && !script.hasAttribute(attrs.manual_init);
    return {autoinit: autoinit,
        disabled: !rpercent||Math.random()*100>rpercent};
})();
var extension = function (Hls, flowplayer, hlsjsConfig) {
    var engineName = "holaHls",
        hlsconf,
        common = flowplayer.common,
        extend = flowplayer.extend,
        support = flowplayer.support,
        brwsr = support.browser,
        version = flowplayer.version,
        coreV6 = version.indexOf("6.") === 0,
        win = window,
        mse = win.MediaSource || win.WebKitMediaSource,
        performance = win.performance,

        isHlsType = function (typ) {
            return typ.toLowerCase().indexOf("mpegurl") > -1;
        },
        hlsQualitiesSupport = function (conf) {
            var hlsQualities = (conf.clip && conf.clip.hlsQualities) || conf.hlsQualities;

            return support.inlineVideo &&
                    (hlsQualities === true ||
                    (hlsQualities && hlsQualities.length));
        },

        engineImpl = function hlsjsEngine2(player, root) {
            var bean = flowplayer.bean,
                videoTag,
                hls,

                recover, // DEPRECATED
                recoverMediaErrorDate,
                swapAudioCodecDate,
                recoveryClass = "is-seeking",
                posterClass = "is-poster",
                doRecover = function (conf, etype, isNetworkError) {
                    if (conf.debug) {
                        console.log("recovery." + engineName, "<-", etype);
                    }
                    common.removeClass(root, "is-paused");
                    common.addClass(root, recoveryClass);
                    if (isNetworkError) {
                        hls.startLoad();
                    } else {
                        var now = performance.now();
                        if (!recoverMediaErrorDate || now - recoverMediaErrorDate > 3000) {
                            recoverMediaErrorDate = performance.now();
                            hls.recoverMediaError();
                        } else if (!swapAudioCodecDate || (now - swapAudioCodecDate) > 3000) {
                            swapAudioCodecDate = performance.now();
                            hls.swapAudioCodec();
                            hls.recoverMediaError();
                        }
                    }
                    // DEPRECATED
                    if (recover > 0) {
                        recover -= 1;
                    }
                    bean.one(videoTag, "seeked." + engineName, function () {
                        if (videoTag.paused) {
                            common.removeClass(root, posterClass);
                            player.poster = false;
                            videoTag.play();
                        }
                        common.removeClass(root, recoveryClass);
                    });
                },
                handleError = function (errorCode, src, url) {
                    var errobj = {code: errorCode};

                    if (errorCode > 2) {
                        errobj.video = extend(player.video, {
                            src: src,
                            url: url || src
                        });
                    }
                    return errobj;
                },

                // pre 6.0.4 poster detection
                bc,
                has_bg,

                addPoster = function () {
                    bean.one(videoTag, "timeupdate." + engineName, function () {
                        common.addClass(root, posterClass);
                        player.poster = true;
                    });
                },
                removePoster = function () {
                    if (coreV6 && player.poster) {
                        bean.one(videoTag, "timeupdate." + engineName, function () {
                            common.removeClass(root, posterClass);
                            player.poster = false;
                        });
                    }
                },

                maxLevel = 0,

                // v6 qsel
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
                    if (coreV6) {
                        delete player.hlsQualities;
                        removeAllQualityClasses();
                        common.find(".fp-quality-selector", root).forEach(common.removeNode);
                    }
                },
                qIndex = function () {
                    return player.hlsQualities[player.qualities.indexOf(player.quality) + 1];
                },

                // v7 qsel
                lastSelectedLevel = -1,

                // v7 and v6 qsel
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
                                qIndices.push(isNaN(Number(q))
                                    ? q.level
                                    : q);
                            });
                        }
                        levels.forEach(function (level) {
                            // do not check audioCodec,
                            // as e.g. HE_AAC is decoded as LC_AAC by hls.js on Android
                            if ((hlsQualitiesConf === true || qIndices.indexOf(levelIndex) > -1) &&
                                    (!level.videoCodec ||
                                    (level.videoCodec &&
                                    mse.isTypeSupported('video/mp4;codecs=' + level.videoCodec)))) {
                                hlsQualities.push(levelIndex);
                            }
                            levelIndex += 1;
                        });
                        if (hlsQualities.length < 2) {
                            return;
                        }
                    }

                    if (coreV6) {
                        player.qualities = [];
                    } else {
                        if (hlsQualitiesConf === "drive" ||
                                hlsQualitiesConf === true ||
                                qIndices.indexOf(-1) > -1) {
                            hlsQualities.unshift(-1);
                        }

                        player.video.qualities = [];
                    }

                    hlsQualities.forEach(function (idx) {
                        var level = levels[idx],
                            q = qIndices.length
                                ? hlsQualitiesConf[qIndices.indexOf(idx)]
                                : idx,
                            label = "Level " + (idx + 1);

                        if (idx < 0) {
                            label = q.label || "Auto";
                        } else if (q.label) {
                            label = q.label;
                        } else {
                            if (level.width && level.height) {
                                label = Math.min(level.width, level.height) + "p";
                            }
                            if (!coreV6 && hlsQualitiesConf !== "drive" && level.bitrate) {
                                label += " (" + Math.round(level.bitrate / 1000) + "k)";
                            }
                        }

                        if (coreV6) {
                            player.qualities.push(label);
                        } else {
                            player.video.qualities.push({value: idx, label: label});
                        }
                    });

                    if (!coreV6) {
                        if (lastSelectedLevel > -1 || hlsQualities.indexOf(-1) < 0) {
                            hls.startLevel = hlsQualities.indexOf(lastSelectedLevel) < 0
                                ? hlsQualities[0]
                                : lastSelectedLevel;
                            hls.loadLevel = hls.startLevel;
                            player.video.quality = hls.startLevel;
                        } else {
                            player.video.quality = hlsQualities.indexOf(lastSelectedLevel) < 0
                                ? hlsQualities[0]
                                : lastSelectedLevel;
                        }
                        lastSelectedLevel = player.video.quality;

                        return;
                    }

                    // v6
                    selector = common.createElement("ul", {
                        "class": "fp-quality-selector"
                    });
                    common.find(".fp-ui", root)[0].appendChild(selector);

                    hlsQualities.unshift(-1);
                    player.hlsQualities = hlsQualities;

                    if (!player.quality || player.qualities.indexOf(player.quality) < 0) {
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
                                volumechange: "volume",
                                error: "error"
                            },
                            HLSEVENTS = Hls.Events,
                            autoplay = !!video.autoplay || !!conf.autoplay,
                            loadingClass = "is-loading",
                            hlsQualitiesConf = video.hlsQualities || conf.hlsQualities,
                            hlsUpdatedConf = extend(hlsconf, conf.hlsjs, video.hlsjs),
                            hlsClientConf = extend({}, hlsUpdatedConf);

                        // allow disabling level selection for single clips
                        if (video.hlsQualities === false) {
                            hlsQualitiesConf = false;
                        }

                        if (!hls) {
                            videoTag = common.findDirect("video", root)[0]
                                    || common.find(".fp-player > video", root)[0];

                            if (videoTag) {
                                // destroy video tag
                                // otherwise <video autoplay> continues to play
                                common.find("source", videoTag).forEach(function (source) {
                                    source.removeAttribute("src");
                                });
                                videoTag.removeAttribute("src");
                                videoTag.load();
                                common.removeNode(videoTag);
                            }

                            videoTag = common.createElement("video", {
                                "class": "fp-engine " + engineName + "-engine",
                                "autoplay": autoplay
                                    ? "autoplay"
                                    : false,
                                "volume": player.volumeLevel, // core ready stanza too late
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

                                    var ct = videoTag.currentTime,
                                        seekable = videoTag.seekable,
                                        updatedVideo = player.video,
                                        seekOffset = updatedVideo.seekOffset,
                                        liveSyncPosition = player.dvr && hls.liveSyncPosition,
                                        buffered = videoTag.buffered,
                                        buffer = 0,
                                        buffend = 0,
                                        src = updatedVideo.src,
                                        i,
                                        quality = player.quality,
                                        selectorIndex,
                                        errorCode;

                                    switch (flow) {
                                    case "ready":
                                        arg = extend(updatedVideo, {
                                            duration: videoTag.duration,
                                            seekable: seekable.length && seekable.end(null),
                                            width: videoTag.videoWidth,
                                            height: videoTag.videoHeight,
                                            url: src
                                        });
                                        break;
                                    case "resume":
                                        removePoster();
                                        if (!hlsUpdatedConf.bufferWhilePaused) {
                                            hls.startLoad(ct);
                                        }
                                        break;
                                    case "seek":
                                        removePoster();
                                        if (!hlsUpdatedConf.bufferWhilePaused && videoTag.paused) {
                                            hls.stopLoad();
                                            videoTag.pause();
                                        }
                                        arg = ct;
                                        break;
                                    case "pause":
                                        if (!hlsUpdatedConf.bufferWhilePaused) {
                                            hls.stopLoad();
                                        }
                                        break;
                                    case "progress":
                                        if (player.dvr && liveSyncPosition) {
                                            updatedVideo.duration = liveSyncPosition;
                                            player.trigger('dvrwindow', [player, {
                                                start: seekOffset,
                                                end: liveSyncPosition
                                            }]);
                                            if (ct < seekOffset) {
                                                videoTag.currentTime = seekOffset;
                                            }
                                        }
                                        arg = ct;
                                        break;
                                    case "speed":
                                        arg = videoTag.playbackRate;
                                        break;
                                    case "volume":
                                        arg = videoTag.volume;
                                        break;
                                    case "buffer":
                                        try {
                                            buffer = buffered.length && buffered.end(null);
                                            if (ct && buffer) {
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
                                        arg = buffer;
                                        break;
                                    case "finish":
                                        if (hlsUpdatedConf.bufferWhilePaused && hls.autoLevelEnabled &&
                                                (updatedVideo.loop || conf.playlist.length < 2 || conf.advance === false)) {
                                            hls.nextLoadLevel = maxLevel;
                                        }
                                        break;
                                    case "error":
                                        errorCode = videoTag.error && videoTag.error.code;

                                        if ((hlsUpdatedConf.recoverMediaError && (errorCode === 3 || !errorCode)) ||
                                                (hlsUpdatedConf.recoverNetworkError && errorCode === 2) ||
                                                (hlsUpdatedConf.recover && (errorCode === 2 || errorCode === 3))) {
                                            e.preventDefault();
                                            doRecover(conf, flow, errorCode === 2);
                                            return;
                                        }

                                        arg = handleError(errorCode, src);
                                        break;
                                    }

                                    player.trigger(flow, [player, arg]);

                                    if (coreV6) {
                                        if (flow === "ready" && quality) {
                                            selectorIndex = quality === "abr"
                                                ? 0
                                                : player.qualities.indexOf(quality) + 1;
                                            common.addClass(common.find(".fp-quality-selector li", root)[selectorIndex],
                                                    qActive);
                                        }
                                    }
                                });
                            });

                            player.on("error." + engineName, function () {
                                if (hls) {
                                    player.engine.unload();
                                }
                            });

                            if (!hlsUpdatedConf.bufferWhilePaused) {
                                player.on("beforeseek." + engineName, function (_e, api, pos) {
                                    if (api.paused) {
                                        bean.one(videoTag, "seeked." + engineName, function () {
                                            videoTag.pause();
                                        });
                                        hls.startLoad(pos);
                                    }
                                });
                            }

                            if (!coreV6) {
                                player.on("quality." + engineName, function (_e, _api, q) {
                                    lastSelectedLevel = q;
                                    if (q == hls.manual_level)
                                    {
                                        return;
                                    }

                                    hls.manual_level = q;
                                    if (hls.hola_adaptive)
                                    {
                                        player.trigger("hola_quality_change");
                                    }
                                    else
                                    {
                                        hls.loadLevel = hls.manual_level;
                                    }
                                });

                            } else if (conf.poster) {
                                // v6 only
                                // engine too late, poster already removed
                                // abuse timeupdate to re-instate poster
                                player.on("stop." + engineName, addPoster);
                                // re-instate initial poster for live streams
                                if (player.live && !autoplay && !player.video.autoplay) {
                                    bean.one(videoTag, "seeked." + engineName, addPoster);
                                }
                            }

                            common.prepend(common.find(".fp-player", root)[0], videoTag);

                        } else {
                            hls.destroy();
                            if ((player.video.src && video.src !== player.video.src) || video.index) {
                                common.attr(videoTag, "autoplay", "autoplay");
                            }
                        }

                        // #28 obtain api.video props before ready
                        player.video = video;

                        // reset
                        maxLevel = 0;

                        Object.keys(hlsUpdatedConf).forEach(function (key) {
                            if (!Hls.DefaultConfig.hasOwnProperty(key)) {
                                delete hlsClientConf[key];
                            }

                            var value = hlsUpdatedConf[key];

                            switch (key) {
                            case "adaptOnStartOnly":
                                if (value) {
                                    hlsClientConf.startLevel = -1;
                                }
                                break;
                            case "autoLevelCapping":
                                if (value === false) {
                                    value = -1;
                                }
                                hlsClientConf[key] = value;
                                break;
                            case "startLevel":
                                switch (value) {
                                case "auto":
                                    value = -1;
                                    break;
                                case "firstLevel":
                                    value = undefined;
                                    break;
                                }
                                hlsClientConf[key] = value;
                                break;
                            case "recover": // DEPRECATED
                                hlsUpdatedConf.recoverMediaError = false;
                                hlsUpdatedConf.recoverNetworkError = false;
                                recover = value;
                                break;
                            case "strict":
                                if (value) {
                                    hlsUpdatedConf.recoverMediaError = false;
                                    hlsUpdatedConf.recoverNetworkError = false;
                                    recover = 0;
                                }
                                break;

                            }
                        });

                        hlsClientConf.autoStartLoad = false;
                        hlsClientConf = extend(hlsClientConf, hlsjsConfig);
                        hls = new Hls(hlsClientConf);
                        player.engine[engineName] = hls;
                        recoverMediaErrorDate = null;
                        swapAudioCodecDate = null;

                        Object.keys(HLSEVENTS).forEach(function (key) {
                            var etype = HLSEVENTS[key],
                                listeners = hlsUpdatedConf.listeners,
                                expose = listeners && listeners.indexOf(etype) > -1;

                            hls.on(etype, function (e, data) {
                                var fperr,
                                    errobj = {},
                                    ERRORTYPES = Hls.ErrorTypes,
                                    ERRORDETAILS = Hls.ErrorDetails,
                                    updatedVideo = player.video,
                                    src = updatedVideo.src;

                                switch (key) {
                                case "MEDIA_ATTACHED":
                                    hls.loadSource(src);
                                    break;

                                case "MANIFEST_PARSED":
                                    if (hlsQualitiesSupport(conf) &&
                                            !(!coreV6 && player.pluginQualitySelectorEnabled)) {
                                        if (hlsQualitiesConf) {
                                            initQualitySelection(hlsQualitiesConf, hlsUpdatedConf, data);
                                        } else {
                                            qClean();
                                        }
                                    } else if (coreV6) {
                                        delete player.quality;
                                    }
                                    if (autoplay && brwsr.safari) {
                                        // hack to avoid "heaving" in Safari
                                        // at least mostly in splash setups and playlist transitions
                                        bean.one(videoTag, "canplaythrough." + engineName, function () {
                                            common.addClass(root, loadingClass);
                                            bean.one(videoTag, "timeupdate." + engineName, function () {
                                                common.removeClass(root, loadingClass);
                                            });
                                        });
                                    }
                                    break;

                                case "FRAG_LOADED":
                                    if (hlsUpdatedConf.bufferWhilePaused && !player.live &&
                                            hls.autoLevelEnabled && hls.nextLoadLevel > maxLevel) {
                                        maxLevel = hls.nextLoadLevel;
                                    }
                                    break;
                                case "FRAG_PARSING_METADATA":
                                    if (coreV6) {
                                        return;
                                    }
                                    data.samples.forEach(function (sample) {
                                        var metadataHandler;

                                        metadataHandler = function () {
                                            if (videoTag.currentTime < sample.dts) {
                                                return;
                                            }
                                            bean.off(videoTag, 'timeupdate.' + engineName, metadataHandler);

                                            var raw = sample.unit || sample.data,
                                                Decoder = win.TextDecoder;

                                            if (Decoder && typeof Decoder === "function") {
                                                raw = new Decoder('utf-8').decode(raw);
                                            } else {
                                                raw = decodeURIComponent(encodeURIComponent(
                                                    String.fromCharCode.apply(null, raw)
                                                ));
                                            }
                                            player.trigger('metadata', [player, {
                                                key: raw.substr(10, 4),
                                                data: raw
                                            }]);
                                        };
                                        bean.on(videoTag, 'timeupdate.' + engineName, metadataHandler);
                                    });
                                    break;
                                case "LEVEL_UPDATED":
                                    if (player.dvr) {
                                        player.video.seekOffset = data.details.fragments[0].start + hls.config.nudgeOffset;
                                    }
                                    break;
                                case "BUFFER_APPENDED":
                                    common.removeClass(root, recoveryClass);
                                    break;
                                case "ERROR":
                                    if (data.fatal || hlsUpdatedConf.strict) {
                                        switch (data.type) {
                                        case ERRORTYPES.NETWORK_ERROR:
                                            if (hlsUpdatedConf.recoverNetworkError || recover) {
                                                doRecover(conf, data.type, true);
                                            } else if (data.frag && data.frag.url) {
                                                errobj.url = data.frag.url;
                                                fperr = 2;
                                            } else {
                                                fperr = 4;
                                            }
                                            break;
                                        case ERRORTYPES.MEDIA_ERROR:
                                            if (hlsUpdatedConf.recoverMediaError || recover) {
                                                doRecover(conf, data.type);
                                            } else {
                                                fperr = 3;
                                            }
                                            break;
                                        default:
                                            fperr = 5;
                                        }

                                        if (fperr !== undefined) {
                                            errobj = handleError(fperr, src, data.url);
                                            player.trigger("error", [player, errobj]);
                                        }
                                    } else if (data.details === ERRORDETAILS.FRAG_LOOP_LOADING_ERROR ||
                                            data.details === ERRORDETAILS.BUFFER_STALLED_ERROR) {
                                        common.addClass(root, recoveryClass);
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

                        if (!support.firstframe && autoplay && videoTag.paused) {
                            var playPromise = videoTag.play();
                            if (playPromise !== undefined) {
                                playPromise.catch(function () {
                                    player.unload();
                                    if (!coreV6) {
                                        player.message("Please click the play button", 3000);
                                    }
                                });
                            }
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
            if (engine_disabled)
                return false;
            var b = support.browser,
                wn = window.navigator,
                IE11 = wn.userAgent.indexOf("Trident/7") > -1;

            if (conf[engineName] === false || conf.clip[engineName] === false) {
                // engine disabled for player
                return false;
            }

            // merge hlsjs clip config at earliest opportunity
            // XXX pavlo: we load 'hlsjs' provider config, not 'holaHls', that's what customers provide
            hlsconf = extend({
                bufferWhilePaused: true,
                smoothSwitching: true,
                recoverMediaError: true
            }, flowplayer.conf.hlsjs, conf.hlsjs, conf.clip.hlsjs);

            // https://github.com/dailymotion/hls.js/issues/9
            return isHlsType(type) && (!brwsr.safari || hlsconf.safari);
        };

        // put on top of engine stack
        // so hlsjs is tested before html5 video hls and flash hls
        flowplayer.engines.unshift(engineImpl);

        if (coreV6) {
            flowplayer(function (api) {
                // to take precedence over VOD quality selector
                api.pluginQualitySelectorEnabled = hlsQualitiesSupport(api.conf) &&
                        engineImpl.canPlay("application/x-mpegurl", api.conf);
            });
        }
    }

};

E.attach = function(Hls, flowplayer, hlsjsConfig) {
    if (engine_attached) {
        engine_disabled = false;
    } else {
        extension(Hls||E.Hls||window.Hls,
            flowplayer||E.flowplayer||window.flowplayer, hlsjsConfig);
        engine_attached = true;
        engine_disabled = false;
    }
};

E.detach = function() {
    // we don't remove engine from list, just set it as disabled so it will
    // return false in canPlay()
    engine_disabled = true;
};

E.VERSION = '__VERSION__';

if (script_conf.disabled)
    E.attach = E.detach = function(){};
else if (script_conf.autoinit)
    E.attach();
