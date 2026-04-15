// =====================================================
// Chess.com Assistant Pro - Userscript Code
// =====================================================

// ==UserScript==
// @name         Chess.com Assistant Pro - string concatenation style - ES6
// @namespace    chess-assistant-pro
// @version      4.0
// @description  Chess.com assistant dengan sistem premove yang diperbaiki - string concatenation style
// @author       Enhanced & Fixed
// @license      MIT
// @match        https://www.chess.com/*
// @icon         https://www.chess.com/favicon.ico
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @resource     stockfishjs  https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/9.0.0/stockfish.js
// @connect      localhost
// @connect      api.npoint.io
// @connect      cdnjs.cloudflare.com
// @connect      unpkg.com
// @connect      jsdelivr.net
// @connect      *
// @connect      raw.githubusercontent.com
// @antifeature  none
// ==/UserScript==

(function () {
    "use strict";

    // =====================================================
    // Section 01: Enhanced Tampermonkey Polyfills (v2.0)
    // =====================================================
    let isTampermonkey = typeof GM_getValue === "function" && typeof GM_xmlhttpRequest === "function";

    if (!isTampermonkey) {
        window.GM_getValue = (key, defaultValue) => {
            try {
                const item = localStorage.getItem("tm_" + btoa(key));
                if (item === null) return defaultValue;
                let decoded;
                try {
                    decoded = atob(item);
                    return JSON.parse(decoded);
                } catch (e2) {
                    return decoded !== undefined ? decoded : defaultValue;
                }
            } catch (e) {
                return defaultValue;
            }
        };

        window.GM_setValue = (key, value) => {
            try {
                const str = typeof value === "string" ? value : JSON.stringify(value);
                localStorage.setItem("tm_" + btoa(key), btoa(str));
            } catch (e) { }
        };

        window.GM_getResourceText = (name) => {
            return "";
        };

        window.GM_registerMenuCommand = (name, fn) => {
            log("Registering menu command:", name);
            window["tmCommand_" + name.replace(/\s+/g, "_")] = fn;
        };

        window.GM_info = {
            script: {
                name: "Chess.com Assistant Pro",
                version: "4.0",
                namespace: "chess-assistant-pro"
            }
        };

        window.GM_xmlhttpRequest = (details) => {
            const xhr = new XMLHttpRequest();
            const timeout = details.timeout || 10000;
            const retries = details.retries || 0;
            let attempt = 0;

            function doRequest() {
                xhr.open(details.method || "GET", details.url, true);
                xhr.timeout = timeout;
                if (details.headers) {
                    Object.keys(details.headers).forEach((k) => {
                        xhr.setRequestHeader(k, details.headers[k]);
                    });
                }
                xhr.onload = () => {
                    if (details.onload) {
                        details.onload({
                            status: xhr.status,
                            responseText: xhr.responseText,
                            finalUrl: xhr.responseURL || details.url
                        });
                    }
                };
                xhr.onerror = (e) => {
                    if (attempt < retries) {
                        attempt++;
                        setTimeout(doRequest, 1000 * attempt);
                    } else if (details.onerror) {
                        details.onerror(e);
                    }
                };
                xhr.ontimeout = (e) => {
                    if (details.ontimeout) details.ontimeout(e);
                    else if (details.onerror) details.onerror(e);
                };
                xhr.send(details.data || null);
            }
            doRequest();
        };

        window.GM_addStyle = (css) => {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
            return style;
        };

        if (typeof unsafeWindow === "undefined") {
            try {
                window.unsafeWindow = window.wrappedJSObject || window;
            } catch (e) {
                window.unsafeWindow = window;
            }
        }
    }

    // =====================================================
    // Section 02: Multi-Source Stockfish Loader (v2.0)
    // =====================================================
    let EngineLoader = {
        sources: [
            { url: "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js", weight: 1 },
            { url: "https://unpkg.com/stockfish.js@10.0.2/stockfish.js", weight: 1 },
            { url: "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js", weight: 1 }
        ],
        stockfishSourceCode: "",
        currentSourceIndex: 0,
        loadWithFallback: function () {
            let self = this;
            return new Promise(function (resolve, reject) {
                function tryNextSource() {
                    if (self.currentSourceIndex >= self.sources.length) {
                        reject(new Error("All Stockfish sources failed"));
                        return;
                    }
                    let source = self.sources[self.currentSourceIndex++];
                    self.loadFromURL(source.url)
                        .then(function (code) {
                        self.stockfishSourceCode = code;
                        stockfishSourceCode = code;
                        log("Stockfish loaded from:", source.url, "Size:", code.length);
                        resolve(true);
                    })
                        .catch(function (e) {
                        warn("Source failed:", source.url, e);
                        tryNextSource();
                    });
                }
                tryNextSource();
            });
        },
        loadFromURL: function (url) {
            return new Promise(function (resolve, reject) {
                let xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.timeout = 15000;
                xhr.onload = function () {
                    if (xhr.status === 200 && xhr.responseText.length > 50000) {
                        resolve(xhr.responseText);
                    } else {
                        reject(new Error("Invalid response"));
                    }
                };
                xhr.onerror = function () { reject(new Error("Network error")); };
                xhr.ontimeout = function () { reject(new Error("Timeout")); };
                xhr.send();
            });
        },
        loadAsync: function (onProgress) {
            let self = this;
            return new Promise(function (resolve, reject) {
                if (self.stockfishSourceCode && self.stockfishSourceCode.length > 50000) {
                    resolve(true);
                    return;
                }
                try {
                    let resource = GM_getResourceText("stockfishjs");
                    if (resource && resource.length > 50000) {
                        self.stockfishSourceCode = resource;
                        stockfishSourceCode = resource;
                        resolve(true);
                        return;
                    }
                } catch (e) { }
                self.loadWithFallback().then(resolve).catch(reject);
            });
        }
    };

    // =====================================================
    // Section 33: Engine Execution Functions
    // =====================================================
    function runEngineNow() {
        let fen = getAccurateFen();
        if (!fen) {
            warn("Cannot get FEN");
            return;
        }
        State.isPremoveAnalysis = false;
        if (State.isThinking) {
            Engine.stop();
            setTimeout(function () { _doRun(fen); }, 100);
        } else {
            _doRun(fen);
        }
    }

    function _doRun(fen) {
        if (State.useOpeningBook && State.evaluationMode === "engine") {
            let history = getGameHistory();
            let bookMove = OpeningBook.getMove(fen, history);
            if (bookMove) {
                State.statusInfo = "Using opening book move: " + bookMove;
                State.isThinking = false;
                State.statusInfo = "Book Move";
                UI.updateStatusInfo();
                MoveExecutor.recordMove(bookMove);
                if (State.autoMovePiece) executeAction(bookMove, fen);
                return;
            }
        }
        Engine.go(fen, State.customDepth);
    }

    function autoRunCheck() {
        if (!State.autoRun || State.isThinking || !isPlayersTurn()) return;
        let fen = getAccurateFen();
        if (!fen || fen === State.lastAutoRunFen) return;
        State.lastAutoRunFen = fen;
        runEngineNow();
    }

    function analysisCheck() {
        if (!State.analysisMode || !Engine.analysis) return;
        let fen = getAccurateFen();
        if (!fen) return;
        if (fen === State._lastAnalysisFen) return;

        UI.clearAll();
        State._lastAnalysisFen = fen;
        State.analysisPVTurn = getCurrentTurn(fen);
        State.isAnalysisThinking = true;
        State._lastAnalysisDepth = 0;
        State._lastAnalysisBestPV = [];
        State._lastAnalysisBestMove = null;
        State.analysisPVLine = [];
        State.analysisStableCount = 0;
        State.analysisLastBestMove = "";
        State.analysisPrevEvalCp = null;
        State.analysisLastEvalCp = null;

        Engine.analysis.postMessage("stop");
        Engine.analysis.postMessage("position fen " + fen);
        Engine.analysis.postMessage("go depth " + State.customDepth);

        State.statusInfo = "Analyzing...";
        UI.updateStatusInfo();
        State.statusInfo = "Started analysis for FEN: " + fen.substring(0, 50) + "...";
    }

    // =====================================================
    // Section 33D: Premove Check (Fixed v4.0)
    // =====================================================
    function premoveCheck() {
        if (!State.premoveEnabled) return;

        let now = Date.now();
        if (now - State.premoveLastAnalysisTime < State.premoveThrottleMs) {
            return;
        }

        if (Engine._premoveEngineBusy) {
            State.statusInfo = "[PremoveCheck] Engine busy, skipping";
            return;
        }

        const fen = getAccurateFen();
        if (!fen) return;

        const fenHash = hashFen(fen);

        if (State.premoveExecutedForFen === fenHash) {
            State.statusInfo = "[PremoveCheck] Already executed for FEN";
            return;
        }

        if (Engine._premoveProcessedFens.has(fenHash)) {
            State.statusInfo = "[PremoveCheck] Already processed by engine";
            return;
        }

        const game = getGame();
        if (!game || isPlayersTurn(game)) {
            State.premoveExecutedForFen = null;
            return;
        }

        if (State.premoveAnalysisInProgress) {
            State.statusInfo = "[PremoveCheck] Analysis already in progress";
            return;
        }

        if (Engine._premoveLastFen === fenHash) {
            State.statusInfo = "[PremoveCheck] Same position as last analysis";
            return;
        }

        State.premoveAnalysisInProgress = true;
        State.premoveLastAnalysisTime = now;

        if (!Engine.premove) {
            State.statusInfo = "[PremoveCheck] Loading premove engine";
            let loaded = Engine.loadPremoveEngine();
            if (!loaded) {
                State.premoveAnalysisInProgress = false;
                return;
            }

            setTimeout(function () {
                _startPremoveAnalysis(fen, fenHash);
            }, 200);
        } else {
            _startPremoveAnalysis(fen, fenHash);
        }
        UI.updateStatusInfo();
    }

    function _startPremoveAnalysis(fen, fenHash) {
        State.statusInfo = `[PremoveCheck] Starting analysis for FEN: ${fenHash.substring(0, 30)}`;

        Engine._premoveEngineBusy = true;
        Engine._premoveLastFen = fenHash;
        Engine._premoveLastActivityTs = Date.now();

        Engine.premove.postMessage("stop");
        Engine.premove.postMessage("ucinewgame");

        setTimeout(function () {
            const freshFen = getAccurateFen();
            if (hashFen(freshFen) !== fenHash) {
                State.statusInfo = "[PremoveCheck] FEN changed during setup, aborting";
                Engine._premoveEngineBusy = false;
                State.premoveAnalysisInProgress = false;
                return;
            }

            Engine.premove.postMessage("position fen " + fen);
            Engine.premove.postMessage("go depth " + (State.premoveDepth || 15));
            Engine._premoveLastActivityTs = Date.now();

            if (Engine._premoveTimeoutId) {
                clearTimeout(Engine._premoveTimeoutId);
                Engine._premoveTimeoutId = null;
            }

            Engine._premoveTimeoutId = setTimeout(function () {
                State.statusInfo = "[PremoveCheck] Analysis timeout, resetting";
                Engine._premoveEngineBusy = false;
                State.premoveAnalysisInProgress = false;
                Engine._premoveLastActivityTs = Date.now();
                if (Engine.premove) {
                    Engine.premove.postMessage("stop");
                }
            }, CONFIG.PREMOVE.ENGINE_TIMEOUT);

        }, 50);

        State.statusInfo = "Smart premove analyzing...";
        UI.updateStatusInfo();
    }

    function autoMatchCheck() {
        if (!State.autoMatch) return;
        let modal = $(".game-result-component, .game-over-modal-shell-content, .daily-game-footer-game-over");
        if (!modal) return;
        AutoMatch.try();
    }

    // =====================================================
    // Section 34: User Interface Panel Construction
    // =====================================================
    function getPanelHTML() {
        let mode = State.evaluationMode;
        let modeText = mode === "engine" ? "ENGINE" : "HUMAN";
        let modeClass = mode === "engine" ? "on" : "off";
        let multiPvCount = 2;

        let topMovesRows = "";
        for (let i = 1; i <= multiPvCount; i++) {
            topMovesRows += '<div class="cap-move-row"><span class="cap-rank">' + i + '.</span><span id="topMove' + i + '" class="cap-move-text">...</span><span id="topMoveEval' + i + '" class="eval eval-equal">0.00</span></div>';
        }

        let eloOptions = "";
        let keys = Object.keys(ELO_LEVELS);
        for (let i = 0; i < keys.length; i++) {
            let k = keys[i];
            let v = ELO_LEVELS[k];
            let sel = State.humanLevel === k ? " selected" : "";
            eloOptions += "<option value=\"" + k + "\"" + sel + ">" + k.charAt(0).toUpperCase() + k.slice(1) + " (" + v.elo + ")</option>";
        }

        let resignMateOptions = "";
        for (let m = 1; m <= 5; m++) {
            let s = State.autoResignThresholdMate === m ? " selected" : "";
            resignMateOptions += "<option value=\"" + m + "\"" + s + ">M" + m + "</option>";
        }

        return '<div class="cap-panel">' +
            '<div class="cap-header cap-drag-handle">' +
            '<div class="cap-header-left">' +
            '<span class="cap-title">BINTANG TOBA</span>' +
            '<div class="cap-leds">' +
            '<div id="engine-status-led" class="cap-led green" title="Engine"></div>' +
            '<div id="GILIRAN-SAYA" class="cap-led blue" title="My Turn"></div>' +
            '<div id="GILIRAN-LAWAN" class="cap-led red" title="Opponent Turn"></div>' +
            '</div>' +
            '<span id="digital-clock" class="cap-clock">--:--:--</span>' +
            '</div>' +
            '<div class="cap-header-btns">' +
            '<button id="cap-minimize" title="Minimize">-</button>' +
            '<button id="cap-maximize" title="Restore">+</button>' +
            '<button id="cap-close" title="Close">x</button>' +
            '</div>' +
            '</div>' +
            '<div class="cap-tabs">' +
            '<div class="cap-tab active" data-tab="tab-engine">Engine</div>' +
            '<div class="cap-tab" data-tab="tab-premove">Premove</div>' +
            '<div class="cap-tab" data-tab="tab-control">Time</div>' +
            '<div class="cap-tab" data-tab="tab-display">Display</div>' +
            '<div class="cap-tab" data-tab="tab-opening">Book</div>' +
            '<div class="cap-tab" data-tab="tab-moves">Moves</div>' +
            '<div class="cap-tab" data-tab="tab-settings">More</div>' +
            '</div>' +
            '<div class="cap-content" id="cap-content-area">' +

            '<div id="tab-engine" class="cap-tab-content">' +
            '<div class="cap-group"><label>Engine Mode</label>' +
            '<button id="btn-eval-mode" class="cap-toggle ' + modeClass + '" data-value="' + mode + '">' + modeText + '</button></div>' +
            '<div id="human-group" class="cap-group" style="' + (mode === "human" ? "" : "display:none") + '">' +
            '<label>Human Level</label><select id="sel-human-level">' + eloOptions + '</select></div>' +
            '<div id="human-elo-group" class="cap-group" style="' + (mode === "human" ? "" : "display:none") + '">' +
            '<label>ELO: <strong id="elo-display">' + State.eloRating + '</strong></label>' +
            '<input type="range" id="sld-elo" min="300" max="3200" step="10" value="' + State.eloRating + '"></div>' +
            '<div class="cap-group"><label>Depth: <strong id="depth-display">' + State.customDepth + '</strong></label>' +
            '<input type="range" id="sld-depth" min="1" max="' + CONFIG.MAX_DEPTH + '" value="' + State.customDepth + '"></div>' +
            '<div class="cap-group"><label>Auto Depth by Opponent</label>' +
            '<button id="btn-auto-depth" class="cap-toggle ' + (State.autoDepthAdapt ? "on" : "off") + '">' + (State.autoDepthAdapt ? "ON" : "OFF") + '</button></div>' +
            '<div class="cap-row">' +
            '<div class="cap-group cap-half"><label>Auto Run</label><button id="btn-auto-run" class="cap-toggle ' + (State.autoRun ? "on" : "off") + '">' + (State.autoRun ? "ON" : "OFF") + '</button></div>' +
            '<div class="cap-group cap-half"><label>Auto Move</label><button id="btn-auto-move" class="cap-toggle ' + (State.autoMovePiece ? "on" : "off") + '">' + (State.autoMovePiece ? "ON" : "OFF") + '</button></div>' +
            '<div class="cap-group cap-half"><label>Auto Play</label><button id="btn-auto-match" class="cap-toggle ' + (State.autoMatch ? "on" : "off") + '">' + (State.autoMatch ? "ON" : "OFF") + '</button></div>' +
            '</div>' +
            '<div class="cap-group"><label>Analysis Mode</label><button id="btn-analysis" class="cap-toggle ' + (State.analysisMode ? "on" : "off") + '">' + (State.analysisMode ? "ON" : "OFF") + '</button></div>' +
            '<div id="analysis-colors-group" class="cap-group" style="' + (State.analysisMode ? "" : "display:none") + '">' +
            '<label>Auto Play Color</label><div class="cap-btn-row">' +
            '<button class="cap-color-btn ' + (State.autoAnalysisColor === "white" ? "active" : "") + '" data-color="white">White</button>' +
            '<button class="cap-color-btn ' + (State.autoAnalysisColor === "black" ? "active" : "") + '" data-color="black">Black</button>' +
            '<button class="cap-color-btn ' + (State.autoAnalysisColor === "none" ? "active" : "") + '" data-color="none">Off</button>' +
            '</div></div>' +
            '</div>' +

            '<div id="tab-premove" class="cap-tab-content" style="display:none">' +
            '<div class="cap-group"><label>Premove System</label>' +
            '<button id="btn-premove" class="cap-toggle ' + (State.premoveEnabled ? "on" : "off") + '">' + (State.premoveEnabled ? "ON" : "OFF") + '</button></div>' +
            '<div id="premove-settings" style="' + (State.premoveEnabled ? "" : "display:none") + '">' +
            '<div class="cap-group"><label>Premove Mode</label><select id="sel-premove-mode">' +
            '<option value="every"' + (State.premoveMode === "every" ? " selected" : "") + '>Every Move</option>' +
            '<option value="capture"' + (State.premoveMode === "capture" ? " selected" : "") + '>Captures Only</option>' +
            '<option value="filter"' + (State.premoveMode === "filter" ? " selected" : "") + '>Filtered Pieces</option></select></div>' +
            '<div class="cap-group"><label>Premove Expected</label><div id="premoveChanceDisplay" style="padding:8px;background:#313244;border:1px solid #45475a;border-radius:6px;font-family:monospace;font-size:11px;color:#cdd6f4;">-</div></div>' +
            '<div class="cap-group"><label>Premove Stats</label><div id="premoveStatsDisplay" style="padding:8px;background:#1e1e2e;border:1px solid #45475a;border-radius:6px;font-family:monospace;font-size:10px;color:#a6adc8;">A:0 OK:0 EX:0 BL:0 FL:0</div></div>' +
            '<div id="premove-piece-filters" class="cap-group" style="' + (State.premoveMode === "filter" ? "" : "display:none") + '">' +
            '<label>Allowed Pieces</label><div class="piece-filters">' +
            '<label class="chip"><input type="checkbox" data-piece="q"' + (State.premovePieces.q ? " checked" : "") + '><span>Q</span></label>' +
            '<label class="chip"><input type="checkbox" data-piece="r"' + (State.premovePieces.r ? " checked" : "") + '><span>R</span></label>' +
            '<label class="chip"><input type="checkbox" data-piece="b"' + (State.premovePieces.b ? " checked" : "") + '><span>B</span></label>' +
            '<label class="chip"><input type="checkbox" data-piece="n"' + (State.premovePieces.n ? " checked" : "") + '><span>N</span></label>' +
            '<label class="chip"><input type="checkbox" data-piece="p"' + (State.premovePieces.p ? " checked" : "") + '><span>P</span></label>' +
            '</div></div>' +

            '<div class="cap-group"><label>CCT Analysis (Checks, Captures, Threats)</label>' +
            '<button id="btn-cct-analysis" class="cap-toggle ' + (State.cctAnalysisEnabled ? "on" : "off") + '">' + (State.cctAnalysisEnabled ? "ON" : "OFF") + '</button></div>' +
            '<div id="cct-settings" class="cap-group" style="' + (State.cctAnalysisEnabled ? "" : "display:none") + '">' +
            '<label>CCT Components</label><div class="piece-filters">' +
            '<label class="chip"><input type="checkbox" id="cct-checks"' + (State.cctComponents.checks ? " checked" : "") + '><span>Checks</span></label>' +
            '<label class="chip"><input type="checkbox" id="cct-captures"' + (State.cctComponents.captures ? " checked" : "") + '><span>Captures</span></label>' +
            '<label class="chip"><input type="checkbox" id="cct-threats"' + (State.cctComponents.threats ? " checked" : "") + '><span>Threats</span></label>' +
            '</div>' +
            '<div style="margin-top:8px;font-size:10px;color:#6c7086;line-height:1.5">' +
            '• <strong>Checks:</strong> Detect safe check opportunities<br>' +
            '• <strong>Captures:</strong> Analyze material exchanges<br>' +
            '• <strong>Threats:</strong> Detect forks, pins, discoveries' +
            '</div></div>' +
            '<div class="cap-info-box"><p><strong>How it works:</strong></p><ul style="margin:5px 0;padding-left:16px;font-size:11px">' +
            '<li>Analyzes opponent likely move</li><li>Pre-calculates your best response</li>' +
            '<li>Executes instantly when opponent moves</li><li>CCT safety checks prevent blunders</li></ul></div>' +
            '</div></div>' +

            '<div id="tab-control" class="cap-tab-content" style="display:none">' +
            '<div class="cap-group"><label>Delay Mode</label>' +
            '<button id="btn-delay-mode" class="cap-toggle ' + (State.useSecondDelay ? "on" : "off") + '">' + (State.useSecondDelay ? "Fast Mode" : "Normal") + '</button></div>' +
            '<div id="delay-normal" style="' + (State.useSecondDelay ? "display:none" : "") + '">' +
            '<div class="cap-group"><label>Presets</label><div class="cap-btn-row" id="delay-presets-container">' +
            '<button class="cap-preset-btn" id="btn-preset-bullet" data-preset="bullet" title="Bullet: 0.5-1s">Bullet</button>' +
            '<button class="cap-preset-btn" id="btn-preset-blitz" data-preset="blitz" title="Blitz: 1-2s">Blitz</button>' +
            '<button class="cap-preset-btn" id="btn-preset-rapid" data-preset="rapid" title="Rapid: 2-4s">Rapid</button>' +
            '</div></div>' +
            '<div class="cap-row">' +
            '<div class="cap-group cap-half"><label>Min (s)</label><input type="number" id="inp-min-delay" step="0.1" min="0.1" max="30" value="' + State.minDelay + '"></div>' +
            '<div class="cap-group cap-half"><label>Max (s)</label><input type="number" id="inp-max-delay" step="0.1" min="0.1" max="60" value="' + State.maxDelay + '"></div>' +
            '</div></div>' +
            '<div id="delay-fast" style="' + (State.useSecondDelay ? "" : "display:none") + '"><div class="cap-row">' +
            '<div class="cap-group cap-half"><label>Min (s)</label><input type="number" id="inp-min-delay2" step="0.1" min="0.05" max="10" value="' + State.minDelayTwo + '"></div>' +
            '<div class="cap-group cap-half"><label>Max (s)</label><input type="number" id="inp-max-delay2" step="0.1" min="0.05" max="10" value="' + State.maxDelayTwo + '"></div>' +
            '</div></div>' +
            '<div class="cap-group"><label>Move Execution Mode</label><div class="cap-btn-row">' +
            '<button class="cap-color-btn ' + (State.moveExecutionMode === "click" ? "active" : "") + '" id="btn-mode-click" data-mode="click">CLICK</button>' +
            '<button class="cap-color-btn ' + (State.moveExecutionMode === "drag" ? "active" : "") + '" id="btn-mode-drag" data-mode="drag">DRAG (Bezier)</button>' +
            '</div></div>' +
            '<div class="cap-group"><label>Auto Resign</label>' +
            '<button id="btn-auto-resign" class="cap-toggle ' + (State.autoResignEnabled ? "on" : "off") + '">' + (State.autoResignEnabled ? "ON" : "OFF") + '</button></div>' +
            '<div id="auto-resign-group" class="cap-group" style="' + (State.autoResignEnabled ? "" : "display:none") + '">' +
            '<div class="cap-row"><div class="cap-group cap-half"><label>Mode</label><select id="sel-resign-mode">' +
            '<option value="mate"' + (State.resignMode === "mate" ? " selected" : "") + '>Mate in</option>' +
            '<option value="cp"' + (State.resignMode === "cp" ? " selected" : "") + '>Centipawn</option></select></div>' +
            '<div class="cap-group cap-half" id="resign-mate-box" style="' + (State.resignMode === "mate" ? "" : "display:none") + '">' +
            '<label>Mate in</label><select id="sel-resign-m">' + resignMateOptions + '</select></div>' +
            '<div class="cap-group cap-half" id="resign-cp-box" style="' + (State.resignMode === "cp" ? "" : "display:none") + '">' +
            '<label>CP threshold</label><input type="number" id="inp-resign-cp" min="100" max="5000" step="50" value="' + State.autoResignThresholdCp + '"></div></div></div>' +
            '<div class="cap-group"><label>Clock Sync</label>' +
            '<button id="btn-clock-sync" class="cap-toggle ' + (State.clockSync ? "on" : "off") + '">' + (State.clockSync ? "ON" : "OFF") + '</button></div>' +
            '<div id="clock-sync-group" class="cap-group" style="' + (State.clockSync ? "" : "display:none") + '">' +
            '<div style="font-size:10px;color:#a6adc8;margin-bottom:8px;padding:6px;background:#1e1e2e;border-radius:4px;">' +
            'Normal delay mengikuti pengaturan Delay Mode (Min/Max) di atas.' +
            '</div>' +
            '<div class="cap-row">' +
            '<div class="cap-group cap-half"><label>Quick if &lt; (s)</label>' +
            '<input type="number" id="inp-clock-low" min="1" max="300" step="1" value="' + State.clockSyncLowTimeQuickSec + '" title="Jika waktu tersisa di bawah ini (detik), pakai delay cepat"></div>' +
            '<div class="cap-group cap-half"><label>Quick Delay (ms)</label>' +
            '<input type="number" id="inp-clock-quick-delay" min="100" max="5000" step="100" value="' + (State.clockSyncQuickDelayMs || 300) + '" title="Delay cepat saat waktu tinggal sedikit (ms)"></div>' +
            '</div>' +
            '<div style="font-size:10px;color:#6c7086;margin-top:8px;padding:6px;background:#1e1e2e;border-radius:4px;">' +
            '💡 Jika waktu &lt; <span id="quick-threshold-display">' + State.clockSyncLowTimeQuickSec + '</span>s, delay otomatis = <span id="quick-delay-display">' + (State.clockSyncQuickDelayMs || 300) + '</span>ms' +
            '</div></div>' +
            '</div>' +

            '<div id="tab-display" class="cap-tab-content" style="display:none">' +
            '<div class="cap-row">' +
            '<div class="cap-group cap-third"><label>PV Arrows</label><button id="btn-pv-arrows" class="cap-toggle ' + (State.showPVArrows ? "on" : "off") + '">' + (State.showPVArrows ? "ON" : "OFF") + '</button></div>' +
            '<div class="cap-group cap-third"><label>Bestmove</label><button id="btn-bestmove-arrows" class="cap-toggle ' + (State.showBestmoveArrows ? "on" : "off") + '">' + (State.showBestmoveArrows ? "ON" : "OFF") + '</button></div>' +
            '<div class="cap-group cap-third"><label>Highlights</label><button id="btn-highlight" class="cap-toggle ' + (State.highlightEnabled ? "on" : "off") + '">' + (State.highlightEnabled ? "ON" : "OFF") + '</button></div>' +
            '</div>' +
            '<div class="cap-group"><label>PV Depth: <strong id="pv-depth-display">' + State.maxPVDepth + '</strong> moves</label>' +
            '<input type="range" id="sld-pv-depth" min="2" max="10" value="' + State.maxPVDepth + '"></div>' +
            '<div class="cap-group"><label>Arrow Color (Auto)</label><div class="cap-color-row">' +
            '<input type="color" id="inp-color1" value="' + State.highlightColor1 + '">' +
            '<div class="cap-presets" data-target="inp-color1">' +
            '<span class="cap-preset" data-c="#eb6150" style="background:#eb6150"></span>' +
            '<span class="cap-preset" data-c="#4287f5" style="background:#4287f5"></span>' +
            '<span class="cap-preset" data-c="#4caf50" style="background:#4caf50"></span>' +
            '<span class="cap-preset" data-c="#ff9800" style="background:#ff9800"></span>' +
            '</div></div></div>' +
            '<div class="cap-group"><label>Arrow Color (PV)</label><div class="cap-color-row">' +
            '<input type="color" id="inp-pv-color-active" value="' + (State.pvArrowColors[1] || "#4287f5") + '">' +
            '<div class="cap-presets cap-pv-presets" id="pv-color-presets">' +
            '<span class="cap-preset cap-pv-color active" data-pv-rank="1" style="background:' + (State.pvArrowColors[1] || "#4287f5") + '" title="PV #1"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="2" style="background:' + (State.pvArrowColors[2] || "#eb6150") + '" title="PV #2"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="3" style="background:' + (State.pvArrowColors[3] || "#4caf50") + '" title="PV #3"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="4" style="background:' + (State.pvArrowColors[4] || "#9c27b0") + '" title="PV #4"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="5" style="background:' + (State.pvArrowColors[5] || "#f38ba8") + '" title="PV #5"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="6" style="background:' + (State.pvArrowColors[6] || "#fab387") + '" title="PV #6"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="7" style="background:' + (State.pvArrowColors[7] || "#74c7ec") + '" title="PV #7"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="8" style="background:' + (State.pvArrowColors[8] || "#f5c2e7") + '" title="PV #8"></span>' +
            '<span class="cap-preset cap-pv-color" data-pv-rank="9" style="background:' + (State.pvArrowColors[9] || "#b4befe") + '" title="PV #9"></span>' +
            '</div></div></div>' +
            '<div class="cap-group"><label>Arrow Color (Bestmove)</label><div class="cap-color-row">' +
            '<input type="color" id="inp-bestmove-color-active" value="' + (State.bestmoveArrowColors[1] || "#eb6150") + '">' +
            '<div class="cap-presets cap-bm-presets" id="bm-color-presets">' +
            '<span class="cap-preset cap-bm-color active" data-bm-rank="1" style="background:' + (State.bestmoveArrowColors[1] || "#eb6150") + '" title="Bestmove #1"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="2" style="background:' + (State.bestmoveArrowColors[2] || "#89b4fa") + '" title="Bestmove #2"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="3" style="background:' + (State.bestmoveArrowColors[3] || "#a6e3a1") + '" title="Bestmove #3"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="4" style="background:' + (State.bestmoveArrowColors[4] || "#f38ba8") + '" title="Bestmove #4"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="5" style="background:' + (State.bestmoveArrowColors[5] || "#cba6f7") + '" title="Bestmove #5"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="6" style="background:' + (State.bestmoveArrowColors[6] || "#fab387") + '" title="Bestmove #6"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="7" style="background:' + (State.bestmoveArrowColors[7] || "#74c7ec") + '" title="Bestmove #7"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="8" style="background:' + (State.bestmoveArrowColors[8] || "#f5c2e7") + '" title="Bestmove #8"></span>' +
            '<span class="cap-preset cap-bm-color" data-bm-rank="9" style="background:' + (State.bestmoveArrowColors[9] || "#b4befe") + '" title="Bestmove #9"></span>' +
            '</div></div></div>' +
            '</div>' +

            '<div id="tab-opening" class="cap-tab-content" style="display:none">' +
            '<div class="cap-group"><label>Use Opening Book</label>' +
            '<button id="btn-book" class="cap-toggle ' + (State.useOpeningBook ? "on" : "off") + '">' + (State.useOpeningBook ? "ON" : "OFF") + '</button></div>' +
            '<div class="cap-group"><label>Notation Sequence (UCI)</label>' +
            '<textarea id="txt-notation-sequence" style="width:100%;height:80px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:6px;padding:8px;font-family:monospace;font-size:11px;resize:none" placeholder="e2e4 e7e5 g1f3 b8c6...">' + State.notationSequence + '</textarea></div>' +
            '<div class="cap-opening-box"><div class="cap-opening-label">Current Opening</div>' +
            '<div id="currentOpeningDisplay" class="cap-opening-name">Game Start</div></div>' +
            '</div>' +

            '<div id="tab-moves" class="cap-tab-content" style="display:none">' +
            '<div class="cap-top-moves">' +
            topMovesRows +
            '</div>' +
            '<div class="cap-acpl"><div class="cap-acpl-header"><span>ACPL: <strong id="acplTextDisplay">W 0.00 / B 0.00</strong></span>' +
            '<span>Moves: <span id="cplMoveCountWhiteDisplay">0</span>/<span id="cplMoveCountBlackDisplay">0</span></span></div>' +
            '<div class="cap-acpl-bars"><div class="cap-acpl-bar-row"><span class="cap-acpl-label">W</span><div class="cap-acpl-bar-bg"><div id="acplBarWhite" class="cap-acpl-bar white"></div></div></div>' +
            '<div class="cap-acpl-bar-row"><span class="cap-acpl-label">B</span><div class="cap-acpl-bar-bg"><div id="acplBarBlack" class="cap-acpl-bar black"></div></div></div></div></div>' +
            '<div class="cap-history"><div class="cap-history-header"><strong>Move History</strong>' +
            '<button id="btn-clear-history" class="cap-clear-btn">Clear</button></div>' +
            '<div class="cap-history-scroll"><table id="moveHistoryTable"><thead><tr><th>#</th><th>Move</th><th>Eval</th><th>D</th><th>Grade</th><th>Time</th></tr></thead>' +
            '<tbody id="moveHistoryTableBody"></tbody></table></div></div></div>' +

            '<div id="tab-settings" class="cap-tab-content" style="display:none">' +
            '<div class="cap-row">' +
            '<div class="cap-group cap-half"><button id="btn-reload-engine" class="cap-action-btn">Reload</button></div>' +
            '<div class="cap-group cap-half"><button id="btn-run-once" class="cap-action-btn green">Run</button></div>' +
            '<div class="cap-group cap-half"><button id="btn-stop-engine" class="cap-action-btn red">Stop</button></div>' +
            '</div>' +
            '<div class="setting-group"><h5>Principal Variation</h5><div class="divider"></div>' +
            '<div class="pv-display" id="pvDisplay">' + (State.principalVariation || "Waiting for analysis...") + '</div></div>' +
            '<div class="setting-group"><h5>Status</h5><div class="divider"></div>' +
            '<div class="setting-row"><span class="setting-label">Current Status</span>' +
            '<span class="setting-value" id="infoStatus">' + (State.statusInfo || "Ready") + '</span></div></div>' +
            '<div class="setting-group"><h5>Diagnostics</h5><div class="divider"></div>' +
            '<div class="setting-row"><span class="setting-label">Workers</span><span class="setting-value" id="diag-workers">M:- A:- P:-</span></div>' +
            '<div class="setting-row"><span class="setting-label">Caches</span><span class="setting-value" id="diag-caches">PF:0 PS:0 CCT:0 TH:0</span></div>' +
            '<div class="setting-row"><span class="setting-label">Runtime</span><span class="setting-value" id="diag-runtime">T:0 L:0</span></div></div>' +
            '<div class="setting-group"><h5>Smart Controls</h5><div class="divider"></div>' +
            '<div class="cap-row">' +
            '<div class="cap-group cap-half"><label>Main Consensus Move</label>' +
            '<button id="btn-main-consensus" class="cap-toggle ' + (State.useMainConsensus ? "on" : "off") + '">' + (State.useMainConsensus ? "ON" : "OFF") + '</button></div>' +
            '<div class="cap-group cap-half"><label>Analysis Blunder Guard</label>' +
            '<button id="btn-analysis-blunder-guard" class="cap-toggle ' + (State.analysisBlunderGuard ? "on" : "off") + '">' + (State.analysisBlunderGuard ? "ON" : "OFF") + '</button></div>' +
            '</div>' +
            '<div class="cap-group"><label>Stable Updates Required</label>' +
            '<input type="number" id="inp-analysis-stable" min="1" max="5" step="1" value="' + (State.analysisMinStableUpdates || 2) + '"></div>' +
            '<div class="setting-row"><span class="setting-label">Analysis Stability</span><span class="setting-value" id="analysis-stability-indicator">' + State.analysisStableCount + 'x</span></div>' +
            '<div class="setting-row"><span class="setting-label">Guard Status</span><span class="setting-value" id="analysis-guard-indicator">Ready</span></div>' +
            '</div>' +
            '</div></div>' +

            '<div class="cap-eval-footer">' +
            '<div class="cap-eval-bar-wrap" title="Engine evaluation">' +
            '<div id="evaluationFillAutoRun" class="cap-eval-fill"></div>' +
            '<span id="autoRunStatusText" class="cap-eval-label">OFF</span></div>' +
            '<div class="cap-eval-bar-wrap small" title="Analysis evaluation">' +
            '<div id="evaluationFillAnalysis" class="cap-eval-fill analysis"></div></div>' +
            '</div></div>';
    }

    // =====================================================
    // Section 35: Panel CSS Styling
    // =====================================================
    function getPanelCSS() {
        return "#chess-assist-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:" + CONFIG.PANEL_WIDTH + "px;background:#1e1e2e;border:1px solid #444;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.6);z-index:99999;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,sans-serif;color:#cdd6f4;font-size:12px;overflow:hidden;user-select:none}" +
            "#chess-assist-panel.minimized .cap-tabs,#chess-assist-panel.minimized .cap-content,#chess-assist-panel.minimized .cap-eval-footer{display:none!important}" +
            "#chess-assist-panel.closed{display:none!important}" +
            ".cap-panel{display:flex;flex-direction:column}" +
            ".cap-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#313244;cursor:grab;border-bottom:1px solid #45475a}" +
            ".cap-header:active{cursor:grabbing}" +
            ".cap-header-left{display:flex;align-items:center;gap:8px}" +
            ".cap-title{font-weight:700;font-size:13px;color:#a6e3a1;letter-spacing:0.5px}" +
            ".cap-leds{display:flex;gap:4px}" +
            ".cap-led{width:8px;height:8px;border-radius:50%;background:#45475a;transition:all .3s}" +
            ".cap-led.green.active{background:#a6e3a1;box-shadow:0 0 6px #a6e3a1}" +
            ".cap-led.blue.active{background:#89b4fa;box-shadow:0 0 6px #89b4fa}" +
            ".cap-led.red.active{background:#f38ba8;box-shadow:0 0 6px #f38ba8}" +
            ".cap-clock{font-family:'Courier New',monospace;font-size:11px;color:#6c7086}" +
            ".cap-header-btns{display:flex;gap:4px}" +
            ".cap-header-btns button{background:#45475a;border:none;color:#cdd6f4;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:13px;line-height:1;transition:background .2s}" +
            ".cap-header-btns button:hover{background:#585b70}" +
            ".cap-tabs{display:flex;background:#181825;border-bottom:1px solid #45475a;overflow-x:auto}" +
            ".cap-tab{flex:1;padding:8px 4px;text-align:center;font-size:10px;cursor:pointer;white-space:nowrap;background:#1e1e2e;transition:all .2s;border-right:1px solid #313244}" +
            ".cap-tab:last-child{border-right:none}" +
            ".cap-tab:hover{background:#313244}" +
            ".cap-tab.active{background:#a6e3a1;color:#1e1e2e;font-weight:700}" +
            ".cap-content{overflow-y:auto;height:360px;padding:12px;scrollbar-width:thin;scrollbar-color:#45475a #1e1e2e}" +
            ".cap-tab-content{animation:capFadeIn .2s ease}" +
            "@keyframes capFadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}" +
            ".cap-group{margin-bottom:12px;padding:10px;background:#313244;border-radius:8px}" +
            ".cap-group label{display:block;margin-bottom:6px;font-size:11px;color:#a6adc8}" +
            ".cap-row{display:flex;gap:8px}" +
            ".cap-half{flex:1}" +
            ".cap-third{flex:1}" +
            ".cap-toggle{width:100%;padding:7px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;transition:all .2s}" +
            ".cap-toggle.on{background:#a6e3a1;color:#1e1e2e}" +
            ".cap-toggle.off{background:#45475a;color:#6c7086}" +
            ".cap-toggle:hover{filter:brightness(1.1)}" +
            "select,input[type=\"number\"]{width:100%;padding:6px 8px;background:#45475a;border:1px solid #585b70;color:#cdd6f4;border-radius:6px;font-size:12px}" +
            "select:focus,input:focus{outline:none;border-color:#a6e3a1}" +
            /* slider + mixer compact */
            "input[type='range']{width:100%;-webkit-appearance:none;height:6px;background:linear-gradient(90deg,#3b3a38,#464442);border-radius:6px;outline:none}" +
            "input[type='range']::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:26px;background:linear-gradient(180deg,#d6d6d6,#9a9a9a);border-radius:4px;cursor:pointer;margin-top:-10px;box-shadow:inset 0 2px 2px rgba(255,255,255,.4),inset 0 -2px 2px rgba(0,0,0,.4),0 2px 6px rgba(0,0,0,.6);transition:all .2s;position:relative}" +
            "input[type='range']::-webkit-slider-thumb:before{content:'';position:absolute;left:50%;top:4px;transform:translateX(-50%);width:3px;height:18px;background:#333;border-radius:2px}" +
            "input[type='range']::-webkit-slider-thumb:hover{background:linear-gradient(180deg,#ffffff,#bcbcbc);transform:scale(1.05)}" +
            "input[type='range']::-moz-range-thumb{width:22px;height:26px;background:linear-gradient(180deg,#d6d6d6,#9a9a9a);border-radius:4px;border:none;cursor:pointer}" +

            "#sld-depth{-webkit-appearance:none;width:100%;height:7px;background:linear-gradient(90deg,#3b3a38,#464442);border-radius:6px;outline:none}" +
            "#sld-depth::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:26px;background:linear-gradient(180deg,#89b4fa,#5fa2ff);border-radius:4px;cursor:pointer;margin-top:-10px;box-shadow:inset 0 2px 2px rgba(255,255,255,.4),inset 0 -2px 2px rgba(0,0,0,.4),0 2px 6px rgba(0,0,0,.6);transition:all .2s;position:relative}" +
            "#sld-depth::-webkit-slider-thumb:before{content:'';position:absolute;left:50%;top:4px;transform:translateX(-50%);width:3px;height:18px;background:#333;border-radius:2px}" +
            "#sld-depth::-webkit-slider-thumb:hover{background:linear-gradient(180deg,#a6e3a1,#7edb87);transform:scale(1.05)}" +
            "#sld-depth::-moz-range-thumb{width:22px;height:26px;background:#89b4fa;border-radius:4px;border:none;cursor:pointer}" +

            ".mixer-btn{width:40px;height:40px;background:linear-gradient(180deg,#d6d6d6,#9a9a9a);border-radius:6px;box-shadow:inset 0 2px 2px rgba(255,255,255,.4),inset 0 -2px 2px rgba(0,0,0,.4),0 2px 4px rgba(0,0,0,.5);cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;justify-content:center;margin:4px}" +
            ".mixer-btn:hover{background:linear-gradient(180deg,#ffffff,#bcbcbc);transform:scale(1.05)}" +
            ".mixer-btn i{font-size:18px;color:#333}" +

            "input[type=\"color\"]{width:50px;height:30px;border:none;border-radius:6px;cursor:pointer;vertical-align:middle}" +
            ".cap-color-row{display:flex;align-items:center;gap:8px}" +
            ".cap-presets{display:flex;gap:4px}" +
            ".cap-preset{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:border-color .2s}" +
            ".cap-preset:hover{border-color:#fff}" +
            ".cap-pv-presets .cap-preset.active{border-color:#89b4fa;box-shadow:0 0 0 1px #89b4fa inset}" +
            ".cap-bm-presets .cap-preset.active{border-color:#a6e3a1;box-shadow:0 0 0 1px #a6e3a1 inset}" +
            ".cap-btn-row{display:flex;gap:6px}" +
            ".cap-color-btn{flex:1;padding:6px;border:none;border-radius:6px;background:#45475a;color:#a6adc8;cursor:pointer;font-size:11px;transition:all .2s}" +
            ".cap-color-btn.active{background:#a6e3a1;color:#1e1e2e;font-weight:600}" +
            ".cap-color-btn:hover{filter:brightness(1.1)}" +
            ".cap-preset-btn{flex:1;padding:8px 6px;border:2px solid #45475a;border-radius:6px;background:#313244;color:#a6adc8;cursor:pointer;font-size:11px;font-weight:600;transition:all .2s;white-space:nowrap}" +
            ".cap-preset-btn:hover{border-color:#a6e3a1;background:#45475a;filter:brightness(1.1)}" +
            ".cap-preset-btn.active{background:#a6e3a1;color:#1e1e2e;border-color:#a6e3a1;box-shadow:0 0 8px rgba(166,227,161,0.4)}" +
            ".cap-action-btn{width:100%;padding:10px;border:none;border-radius:6px;background:#45475a;color:#cdd6f4;font-weight:600;cursor:pointer;font-size:12px;transition:all .2s}" +
            ".cap-action-btn:hover{filter:brightness(1.2)}" +
            ".cap-action-btn.green{background:#a6e3a1;color:#1e1e2e}" +
            ".cap-action-btn.red{background:#f38ba8;color:#1e1e2e}" +
            ".setting-group{margin-bottom:12px;padding:10px;background:#313244;border-radius:8px}" +
            ".setting-group h5{margin:0 0 8px 0;font-size:12px;color:#a6adc8}" +
            ".pv-display{padding:8px;background:#181825;border:1px solid #45475a;border-radius:6px;font-family:monospace;font-size:10px;color:#cdd6f4;word-break:break-all}" +
            ".setting-row{display:flex;justify-content:space-between;align-items:center}" +
            ".setting-label{font-size:11px;color:#a6adc8}" +
            ".setting-value{font-weight:700;font-size:12px;color:#cdd6f4}" +
            ".divider{height:1px;background:#45475a;margin:8px 0}" +
            ".cap-opening-box{text-align:center;padding:20px;background:#313244;border-radius:8px;margin-bottom:12px}" +
            ".cap-opening-label{font-size:11px;color:#6c7086;margin-bottom:5px}" +
            ".cap-opening-name{font-size:18px;font-weight:700;color:#89b4fa}" +
            ".cap-top-moves{margin-bottom:12px}" +
            ".cap-move-row{display:flex;align-items:center;padding:8px 10px;background:#313244;border-radius:6px;margin-bottom:4px}" +
            ".cap-rank{width:30px;color:#a6e3a1;font-weight:700;font-size:11px}" +
            ".cap-move-text{flex:1;font-weight:700;font-family:monospace;font-size:13px}" +
            ".eval{text-align:right;font-weight:600;font-size:12px}" +
            ".eval-positive{color:#a6e3a1}" +
            ".eval-negative{color:#f38ba8}" +
            ".eval-equal{color:#f9e2af}" +
            ".eval-mate{color:#cba6f7}" +
            ".cap-acpl{margin-bottom:12px}" +
            ".cap-acpl-header{display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px;color:#a6adc8}" +
            ".cap-acpl-bars{display:flex;flex-direction:column;gap:4px}" +
            ".cap-acpl-bar-row{display:flex;align-items:center;gap:6px}" +
            ".cap-acpl-label{width:16px;font-size:10px;font-weight:700}" +
            ".cap-acpl-bar-bg{flex:1;height:14px;background:#45475a;border-radius:3px;overflow:hidden}" +
            ".cap-acpl-bar{height:100%;width:0%;transition:width .4s;border-radius:3px}" +
            ".cap-acpl-bar.white{background:#a6e3a1}" +
            ".cap-acpl-bar.black{background:#f38ba8}" +
            ".cap-history-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}" +
            ".cap-clear-btn{padding:4px 10px;background:#f38ba8;color:#1e1e2e;border:none;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600}" +
            ".cap-history-scroll{max-height:140px;overflow-y:auto;background:#313244;border-radius:6px}" +
            "#moveHistoryTable{width:100%;border-collapse:collapse;font-size:10px}" +
            "#moveHistoryTable th{background:#45475a;padding:5px 4px;text-align:center;position:sticky;top:0;z-index:1;color:#a6adc8}" +
            "#moveHistoryTable td{padding:4px;text-align:center;border-bottom:1px solid #45475a}" +
            ".cap-eval-footer{padding:8px 12px;background:#313244;border-top:1px solid #45475a}" +
            ".cap-eval-bar-wrap{position:relative;height:22px;background:#45475a;border-radius:5px;overflow:hidden;margin-bottom:4px}" +
            ".cap-eval-bar-wrap.small{height:8px;margin-bottom:0}" +
            ".cap-eval-fill{height:100%;width:50%;background:#a6e3a1;transition:all .4s;border-radius:5px}" +
            ".cap-eval-fill.analysis{background:#89b4fa}" +
            ".cap-eval-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px;font-weight:600;text-shadow:0 0 3px #000;white-space:nowrap}" +
            ".cap-info-box{padding:10px;background:#313244;border-radius:6px;font-size:11px;line-height:1.6;margin-bottom:8px}" +
            ".cap-info-box ul{margin:4px 0 0 16px;padding:0}" +
            ".piece-filters{display:flex;gap:6px;flex-wrap:wrap}" +
            ".chip{display:flex;align-items:center;gap:4px;padding:4px 8px;background:#45475a;border-radius:4px;cursor:pointer;font-size:11px}" +
            ".chip input{margin:0}" +
            ".cap-content::-webkit-scrollbar,.cap-history-scroll::-webkit-scrollbar{width:5px}" +
            ".cap-content::-webkit-scrollbar-track,.cap-history-scroll::-webkit-scrollbar-track{background:transparent}" +
            ".cap-content::-webkit-scrollbar-thumb,.cap-history-scroll::-webkit-scrollbar-thumb{background:#45475a;border-radius:3px}" +

            ".chess-assist-arrow{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999}" +
            ".chess-assist-arrow[data-analysis=\"true\"]{z-index:10001!important}" +
            ".chess-assist-pv-arrow{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9990}" +
            ".chess-assist-pv-arrow[data-analysis=\"true\"]{z-index:10090!important}" +
            ".chess-assist-bestmove-arrow{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}" +

            ".chess-assist-arrow,.chess-assist-pv-arrow,.chess-assist-bestmove-arrow{transition:opacity 0.2s ease}" +

            ".chess-assist-arrow rect{filter:drop-shadow(0 0 4px currentColor)}" +
            ".chess-assist-arrow[data-analysis=\"true\"] rect{filter:drop-shadow(0 0 6px currentColor)}" +

            "#premoveChanceDisplay.high-chance{color:#f38ba8;font-weight:bold;animation:pulse 1s infinite}" +
            "#premoveChanceDisplay.low-chance{color:#a6e3a1}" +
            "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}" +

            ".chess-assist-pv-arrow line{stroke-linecap:round}" +
            ".chess-assist-pv-arrow circle{opacity:0.9}" +
            ".chess-assist-pv-arrow text{font-family:'Segoe UI',sans-serif}" +
            ".cap-welcome-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:100200;display:flex;align-items:center;justify-content:center;padding:16px}" +
            ".cap-welcome-modal{width:min(560px,94vw);background:#1e1e2e;border:1px solid #45475a;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.6);padding:16px;color:#cdd6f4}" +
            ".cap-welcome-title{font-size:18px;font-weight:700;color:#a6e3a1;margin-bottom:8px}" +
            ".cap-welcome-subtitle{font-size:12px;color:#bac2de;line-height:1.5;margin-bottom:10px}" +
            ".cap-welcome-list{margin:0 0 10px 18px;padding:0;font-size:12px;line-height:1.6;color:#cdd6f4}" +
            ".cap-welcome-warning{background:#2a1d22;border:1px solid #5b3240;border-radius:8px;padding:10px;font-size:12px;line-height:1.5;color:#f2cdcd;margin-bottom:12px;text-align:center}" +
            ".cap-welcome-warning-line{height:2px;background:#f38ba8;border-radius:2px;margin:0 0 8px 0}" +
            ".cap-welcome-warning-title{display:block;font-weight:700;color:#f38ba8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px}" +
            ".cap-welcome-warning-body{display:block;color:#f2cdcd;line-height:1.55}" +
            ".cap-welcome-consent{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#cdd6f4;margin-bottom:12px}" +
            ".cap-welcome-consent input{margin-top:2px}" +
            ".cap-welcome-actions{display:flex;gap:8px;justify-content:flex-end}" +
            ".cap-welcome-btn{padding:8px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px}" +
            ".cap-welcome-btn.primary{background:#a6e3a1;color:#1e1e2e}" +
            ".cap-welcome-btn.primary:disabled{background:#6c7086;color:#313244;cursor:not-allowed}" +
            ".cap-welcome-btn.secondary{background:#45475a;color:#cdd6f4}" +
            "@media (max-width: 768px) {" +
            "#chess-assist-panel{width:90vw!important;height:auto;max-height:90vh;top:50%!important;left:50%!important;transform:translate(-50%,-50%)!important;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.8)}" +
            ".cap-content{height:300px!important;overflow-y:auto}" +
            ".cap-header{padding:6px 10px}" +
            ".cap-title{font-size:12px}" +
            ".cap-tabs{font-size:9px}" +
            ".cap-group{margin-bottom:8px;padding:8px}" +
            ".cap-preset-btn{font-size:10px;padding:6px 4px}" +
            "select,input[type=\"number\"]{font-size:11px;padding:5px 6px}" +
            "input[type=\"range\"]::-webkit-slider-thumb{width:12px;height:12px}" +
            "}" +
            "@media (max-width: 480px) {" +
            "#chess-assist-panel{width:95vw!important;max-height:88vh}" +
            ".cap-content{height:250px!important;font-size:11px}" +
            ".cap-header{padding:5px 8px}" +
            ".cap-title{font-size:11px}" +
            ".cap-tabs{font-size:8px;overflow-x:auto}" +
            ".cap-tab{padding:5px 2px}" +
            ".cap-group{margin-bottom:6px;padding:6px;font-size:10px}" +
            ".cap-group label{font-size:10px;margin-bottom:4px}" +
            ".cap-toggle{padding:5px 8px;font-size:10px}" +
            ".cap-preset-btn{font-size:9px;padding:4px 2px}" +
            ".cap-header-btns button{width:20px;height:20px;font-size:12px}" +
            "select,input[type=\"number\"],input[type=\"text\"]{font-size:10px;padding:4px 5px}" +
            ".cap-row{gap:4px}" +
            ".cap-move-text{font-size:11px}" +
            ".cap-move-row{padding:6px 8px}" +
            ".eval{font-size:10px}" +
            "#moveHistoryTable{font-size:9px}" +
            "#moveHistoryTable th,#moveHistoryTable td{padding:2px 2px}" +
            ".cap-history-scroll{max-height:120px}" +
            ".cap-eval-footer{padding:6px 8px}" +
            ".cap-eval-bar-wrap{height:18px}" +
            ".cap-preset{width:18px;height:18px}" +
            "input[type=\"color\"]{width:40px;height:25px}" +
            ".cap-color-btn{padding:4px;font-size:9px}" +
            ".piece-filters{gap:4px}" +
            ".chip{padding:2px 4px;font-size:9px}" +
            ".cap-opening-name{font-size:14px}" +
            ".cap-acpl-bar-row{gap:4px}" +
            ".cap-acpl-bar-bg{height:10px}" +
            "}" +
            "@media (max-width: 380px) {" +
            "#chess-assist-panel{width:98vw!important}" +
            ".cap-content{height:200px!important}" +
            ".cap-header-btns button{width:18px;height:18px;font-size:11px}" +
            ".cap-title{font-size:10px}" +
            ".cap-group{padding:4px}" +
            "select,input{font-size:9px}" +
            ".cap-toggle{font-size:9px;padding:4px 6px}" +
            "}" +
            "@media (orientation: landscape) and (max-height: 500px) {" +
            "#chess-assist-panel{height:90vh!important;max-height:90vh!important}" +
            ".cap-content{height:60vh!important;max-height:60vh!important}" +
            ".cap-history-scroll{max-height:100px}" +
            "}";

    }

    // =====================================================
    // Section 36: Panel DOM Creation and Insertion
    // =====================================================
    const NPOINT_URL = "https://api.npoint.io/96459c4dcdd88ee29d47";

    function syncSettingsFromNpoint() {
        log("Syncing settings from npoint...");

        GM_xmlhttpRequest({
            method: "GET",
            url: NPOINT_URL,
            timeout: 10000,

            onload: function (response) {
                try {
                    if (response.status !== 200) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const data = JSON.parse(response.responseText);

                    if (!data || typeof data !== "object" || Array.isArray(data)) {
                        throw new Error("Invalid config format");
                    }

                    let updatedCount = 0;
                    let skippedCount = 0;

                    for (const key in data) {

                        if (!Object.prototype.hasOwnProperty.call(State, key)) {
                            skippedCount++;
                            continue;
                        }

                        if (typeof State[key] !== typeof data[key]) {
                            log(`Type mismatch for "${key}" skipped`);
                            skippedCount++;
                            continue;
                        }

                        if (State[key] === data[key]) continue;

                        saveSetting(key, data[key]);
                        updatedCount++;
                    }

                    log(`Sync complete. Updated: ${updatedCount}, Skipped: ${skippedCount}`);
                    State.statusInfo = `Sync OK: ${updatedCount} updated`;

                } catch (e) {
                    err("Sync error:", e);
                    State.statusInfo = `Sync Error: ${e.message}`;
                } finally {
                    UI?.updateStatusInfo?.();
                    renderAll();
                }
            },

            onerror: function () {
                err("Network error");
                State.statusInfo = "Sync Failed: Network error";
                if (UI && typeof UI.updateStatusInfo === 'function') {
                    UI.updateStatusInfo();
                }
            },

            ontimeout: function () {
                err("Sync timeout");
                State.statusInfo = "Sync Failed: Timeout";
                if (UI && typeof UI.updateStatusInfo === 'function') {
                    UI.updateStatusInfo();
                }
            }
        });
    }

    function runHealthCheck() {
        const report = getDiagnosticsSnapshot();
        const runtime = report.runtime;
        const caches = report.caches;
        const workers = report.workers;

        log("[HealthCheck]", report);
        State.statusInfo = "Health check OK | Workers M=" + (workers.main ? 1 : 0) +
            " A=" + (workers.analysis ? 1 : 0) +
            " P=" + (workers.premove ? 1 : 0) +
            " | Caches PF=" + caches.predictedFenCache +
            " PS=" + caches.premoveSafetyCache +
            " CCT=" + caches.cctCache +
            " TH=" + caches.threatCache +
            " | Heals P=" + runtime.premoveHealCount +
            " M=" + runtime.mainHealCount +
            " A=" + runtime.analysisHealCount;
        if (UI && typeof UI.updateStatusInfo === "function") {
            UI.updateStatusInfo();
        }
    }

    function getDiagnosticsSnapshot() {
        const runtime = RuntimeGuard.getSnapshot();
        return {
            workers: {
                main: !!(Engine && Engine.main),
                analysis: !!(Engine && Engine.analysis),
                premove: !!(Engine && Engine.premove)
            },
            caches: {
                predictedFenCache: predictedFenCache.size,
                premoveSafetyCache: premoveSafetyCache.size,
                premoveProcessedFens: Engine && Engine._premoveProcessedFens ? Engine._premoveProcessedFens.size : 0,
                cctCache: CCTAnalyzer && CCTAnalyzer.cache ? CCTAnalyzer.cache.size : 0,
                threatCache: ThreatDetectionSystem && ThreatDetectionSystem.cache ? ThreatDetectionSystem.cache.size : 0
            },
            flags: {
                loopStarted: !!State.loopStarted,
                analysisMode: !!State.analysisMode,
                premoveEnabled: !!State.premoveEnabled,
                isThinking: !!State.isThinking,
                isAnalysisThinking: !!State.isAnalysisThinking
            },
            runtime: {
                premoveHealCount: runtime.premoveHealCount,
                mainHealCount: runtime.mainHealCount,
                analysisHealCount: runtime.analysisHealCount
            }
        };
    }

    GM_registerMenuCommand("Sync from npoint", syncSettingsFromNpoint);
    GM_registerMenuCommand("Run health check", runHealthCheck);

    function renderAll() {
        let panel = $("#chess-assist-panel");
        if (!panel) return;

        let contentArea = $("#cap-content-area");
        let scrollTop = contentArea ? contentArea.scrollTop : 0;
        let activeTab = $(".cap-tab.active")?.dataset.tab || "tab-engine";

        panel.innerHTML = getPanelHTML();

        setupMenuTabs();
        setupAllListeners();

        if (activeTab) {
            let tab = $("[data-tab='" + activeTab + "']");
            if (tab) tab.click();
        }
        if (scrollTop && $("#cap-content-area")) {
            $("#cap-content-area").scrollTop = scrollTop;
        }

        UI.updateTurnLEDs();
        if (UI && typeof UI.updateStatusInfo === 'function') {
            UI.updateStatusInfo();
        }
        UI.updateClock();
        UI.updatePremoveStatsDisplay();
        UI.updateAnalysisMonitorDisplay();
        UI.updateDiagnosticsDisplay();
        if (State.analysisMode) UI.updateAnalysisBar(State.currentEvaluation || 0);
        else UI.updateEvalBar(State.currentEvaluation || 0, null, State.customDepth);
    }

    function createPanel() {

        if (!document.querySelector("meta[name='viewport']")) {
            let viewportMeta = document.createElement("meta");
            viewportMeta.name = "viewport";
            viewportMeta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes";
            document.head.appendChild(viewportMeta);
        }

        let style = document.createElement("style");
        style.id = "chess-assist-styles";
        style.textContent = getPanelCSS();
        document.head.appendChild(style);

        let panel = document.createElement("div");
        panel.id = "chess-assist-panel";
        document.body.appendChild(panel);

        // INITIAL RENDER
        renderAll();

        setupDrag(panel);

        if (State.panelTop !== null && State.panelLeft !== null) {
            panel.style.top = State.panelTop + "px";
            panel.style.left = State.panelLeft + "px";
            panel.style.transform = "none";
        }
        applyPanelState(State.panelState);
    }

    function showWelcomeConsentModal(onAccept) {
        if (State.onboardingAccepted) {
            if (typeof onAccept === "function") onAccept();
            return;
        }

        let existing = $("#cap-welcome-overlay");
        if (existing) return;

        let overlay = document.createElement("div");
        overlay.id = "cap-welcome-overlay";
        overlay.className = "cap-welcome-overlay";
        let panel = $("#chess-assist-panel");
        if (panel) panel.style.display = "none";
        overlay.innerHTML =
            '<div class="cap-welcome-modal" role="dialog" aria-modal="true" aria-labelledby="cap-welcome-title">' +
            '<div id="cap-welcome-title" class="cap-welcome-title">Selamat Datang di BINTANG TOBA</div>' +
            '<div class="cap-welcome-subtitle">Tools ini dibuat untuk membantu latihan bermain catur dan memahami langkah lebih baik.</div>' +
            '<ul class="cap-welcome-list">' +
            '<li>Engine analysis dan saran langkah.</li>' +
            '<li>PV arrows, bestmove arrows, dan highlight.</li>' +
            '<li>Kontrol waktu, premove, dan mode analisis.</li>' +
            '</ul>' +
            '<div class="cap-welcome-warning"><span class="cap-welcome-warning-title">Peringatan</span><div class="cap-welcome-warning-line"></div><span class="cap-welcome-warning-body">Harap diperhatikan bahwa penggunaan aplikasi dapat melanggar aturan dan menyebabkan diskualifikasi atau larangan dari turnamen dan platform online. Pengembang aplikasi dan sistem terkait TIDAK akan dimintai pertanggung jawaban atas konsekuensi apa pun yang diakibatkan oleh penggunaannya. Kami sangat menyarankan untuk menggunakan aplikasi hanya dalam lingkungan yang terkendali secara etis.</span></div>' +
            '<label class="cap-welcome-consent"><input type="checkbox" id="cap-consent-check"><span>Saya telah membaca, memahami, dan menyetujui syarat penggunaan di atas.</span></label>' +
            '<div class="cap-welcome-actions">' +
            '<button id="cap-consent-decline" class="cap-welcome-btn secondary" type="button">Keluar</button>' +
            '<button id="cap-consent-accept" class="cap-welcome-btn primary" type="button" disabled>Setuju dan Lanjut</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        let checkbox = $("#cap-consent-check", overlay);
        let acceptBtn = $("#cap-consent-accept", overlay);
        let declineBtn = $("#cap-consent-decline", overlay);

        let onCheckChange = function () {
            acceptBtn.disabled = !checkbox.checked;
        };
        checkbox.addEventListener("change", onCheckChange);
        _eventListeners.push({ element: checkbox, type: "change", handler: onCheckChange });

        let onAcceptClick = function () {
            if (!checkbox.checked) return;
            saveSetting("onboardingAccepted", true);
            State.onboardingAccepted = true;
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (panel) panel.style.display = "";
            State.statusInfo = "Persetujuan diterima. Selamat berlatih.";
            UI.updateStatusInfo();
            if (typeof onAccept === "function") onAccept();
        };
        acceptBtn.addEventListener("click", onAcceptClick);
        _eventListeners.push({ element: acceptBtn, type: "click", handler: onAcceptClick });

        let onDeclineClick = function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            State.statusInfo = "Persetujuan diperlukan untuk melanjutkan.";
            UI.updateStatusInfo();
            if (panel) panel.style.display = "none";
            applyPanelState("closed");
        };
        declineBtn.addEventListener("click", onDeclineClick);
        _eventListeners.push({ element: declineBtn, type: "click", handler: onDeclineClick });
    }

    function setupDrag(panel) {
        let handle = $(".cap-drag-handle", panel);
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        function startDrag(clientX, clientY, target) {
            if (target && target.tagName === "BUTTON") return;
            dragging = true;
            let rect = panel.getBoundingClientRect();
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
            panel.style.transform = "none";
            panel.style.cursor = "grabbing";
            return true;
        }

        function moveDrag(clientX, clientY) {
            if (!dragging) return;
            let x = clamp(clientX - offsetX, 0, window.innerWidth - panel.offsetWidth);
            let y = clamp(clientY - offsetY, 0, window.innerHeight - 40);
            panel.style.left = x + "px";
            panel.style.top = y + "px";
        }

        function endDrag() {
            if (dragging) {
                dragging = false;
                panel.style.cursor = "grab";
                let rect = panel.getBoundingClientRect();
                saveSetting("panelTop", rect.top);
                saveSetting("panelLeft", rect.left);
            }
        }

        let mousedownHandler = function (e) {
            startDrag(e.clientX, e.clientY, e.target);
            e.preventDefault();
        };
        handle.addEventListener("mousedown", mousedownHandler);
        _eventListeners.push({ element: handle, type: "mousedown", handler: mousedownHandler });

        let mousemoveHandler = function (e) {
            moveDrag(e.clientX, e.clientY);
        };
        document.addEventListener("mousemove", mousemoveHandler);
        _eventListeners.push({ element: document, type: "mousemove", handler: mousemoveHandler });

        let mouseupHandler = function () {
            endDrag();
        };
        document.addEventListener("mouseup", mouseupHandler);
        _eventListeners.push({ element: document, type: "mouseup", handler: mouseupHandler });

        let touchstartHandler = function (e) {
            if (e.touches.length > 0) {
                startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
                e.preventDefault();
            }
        };
        handle.addEventListener("touchstart", touchstartHandler);
        _eventListeners.push({ element: handle, type: "touchstart", handler: touchstartHandler });

        let touchmoveHandler = function (e) {
            if (dragging && e.touches.length > 0) {
                moveDrag(e.touches[0].clientX, e.touches[0].clientY);
                e.preventDefault();
            }
        };
        document.addEventListener("touchmove", touchmoveHandler, false);
        _eventListeners.push({ element: document, type: "touchmove", handler: touchmoveHandler });

        let touchendHandler = function (e) {
            endDrag();
            e.preventDefault();
        };
        document.addEventListener("touchend", touchendHandler);
        _eventListeners.push({ element: document, type: "touchend", handler: touchendHandler });

        let touchmovePreventHandler = function (e) {
            if (dragging) e.preventDefault();
        };
        handle.addEventListener("touchmove", touchmovePreventHandler, false);
        _eventListeners.push({ element: handle, type: "touchmove", handler: touchmovePreventHandler });
    }

    function setupMenuTabs() {
        $$(".cap-tab").forEach(function (tab) {
            tab.addEventListener("click", function () {
                let panel = $("#chess-assist-panel");
                if (panel.classList.contains("minimized")) applyPanelState("maximized");
                $$(".cap-tab").forEach(function (t) {
                    t.classList.remove("active");
                });
                this.classList.add("active");
                let targetId = this.dataset.tab;
                $$(".cap-tab-content").forEach(function (p) {
                    p.style.display = "none";
                });
                let target = $("#" + targetId);
                if (target) target.style.display = "";
            });
        });
    }

    function syncToggleUI(btnId, isOn) {
        let btn = $("#" + btnId);
        if (!btn) return;
        btn.textContent = isOn ? "ON" : "OFF";
        btn.classList.toggle("on", isOn);
        btn.classList.toggle("off", !isOn);
    }

    function bindToggle(btnId, stateKey) {
        let btn = $("#" + btnId);
        if (!btn) return;
        btn.addEventListener("click", function () {
            let newVal = !State[stateKey];
            saveSetting(stateKey, newVal);
            syncToggleUI(btnId, newVal);

            if (stateKey === "showPVArrows" && !newVal) UI.clearPVArrows();
            if (stateKey === "showPVArrows" && newVal) {
                if (State.analysisMode && State.analysisPVLine.length > 0) {
                    UI.drawPVArrows(State.analysisPVLine, State.analysisPVTurn, true);
                } else if (State.mainPVLine.length > 0) {
                    UI.drawPVArrows(State.mainPVLine, State.mainPVTurn, false);
                }
            }
            if (stateKey === "showBestmoveArrows" && !newVal) UI.clearBestmoveArrows();
            if (stateKey === "showBestmoveArrows" && newVal) UI.drawBestmoveArrows();
            if (stateKey === "highlightEnabled" && !newVal) UI.clearHighlights();
            if ((stateKey === "autoRun" || stateKey === "autoMovePiece") && newVal) {
                if (State.analysisMode) {
                    saveSetting("analysisMode", false);
                    syncToggleUI("btn-analysis", false);
                    let grp = $("#analysis-colors-group");
                    if (grp) grp.style.display = "none";
                    if (Engine.analysis) {
                        Engine.analysis.terminate();
                        Engine.analysis = null;
                    }
                }
            }
            if (stateKey === "autoDepthAdapt" && newVal) applyAutoDepthFromOpponent();
        });
    }

    function bindUIEvent(selector, eventType, handler) {
        let el = $(selector);
        if (!el) return null;
        el.addEventListener(eventType, handler);
        return el;
    }

    function setupAllListeners() {
        bindUIEvent("#cap-minimize", "click", function () {
            applyPanelState("minimized");
        });
        bindUIEvent("#cap-maximize", "click", function () {
            applyPanelState("maximized");
        });
        bindUIEvent("#cap-close", "click", function () {
            applyPanelState("closed");
        });

        if (!_panelHotkeysBound) {
            _panelHotkeysBound = true;

            let panelHotkeysHandler = function (e) {

                if (e.key === "Escape") {
                    e.preventDefault();
                    let newState = State.panelState === "closed" ? "maximized" : "closed";
                    applyPanelState(newState);
                    return;
                }

                if (State.panelState === "closed") return;

                let targetTag = e.target.tagName;
                let isInputField = ["INPUT", "SELECT", "TEXTAREA"].includes(targetTag);
                let isEditable = e.target.isContentEditable;
                let isInEditableContainer = e.target.closest && e.target.closest("[contenteditable]");

                if (isInputField || isEditable || isInEditableContainer) return;

                if (!e.altKey) return;

                let depthMap = {
                    q: 1, w: 2, e: 3, r: 4, t: 5, y: 6, u: 7, i: 8, o: 9, p: 10,
                    a: 11, s: 12, d: 13, f: 14, g: 15, h: 16, j: 17, k: 18, l: 19,
                    z: 20, x: 21, c: 22, v: 23, b: 24, n: 25, m: 26
                };

                let key = e.key.toLowerCase();
                let newDepth = depthMap[key];

                if (newDepth) {
                    e.preventDefault();

                    saveSetting("customDepth", newDepth);

                    let depthSlider = $("#sld-depth");
                    let depthDisplay = $("#depth-display");

                    if (depthSlider) depthSlider.value = State.customDepth;
                    if (depthDisplay) depthDisplay.textContent = State.customDepth;

                    if (State.analysisMode) {
                        State._lastAnalysisFen = null;
                        analysisCheck();
                    } else {
                        runEngineNow();
                    }
                }
            };
            document.addEventListener("keydown", panelHotkeysHandler);
            _eventListeners.push({ element: document, type: "keydown", handler: panelHotkeysHandler });
        }

        let quickDelayInput = $("#inp-clock-quick-delay");
        if (quickDelayInput) {
            quickDelayInput.addEventListener("change", function () {
                let val = parseInt(this.value, 10);
                if (!isNaN(val) && val >= 100 && val <= 5000) {
                    saveSetting("clockSyncQuickDelayMs", val);
                    updateQuickDelayDisplay();
                }
            });
        }

        let lowTimeInput = $("#inp-clock-low");
        if (lowTimeInput) {
            lowTimeInput.addEventListener("change", function () {
                let v = parseInt(this.value, 10);
                if (!isNaN(v) && v >= 1) {
                    saveSetting("clockSyncLowTimeQuickSec", v);
                }
                updateQuickDelayDisplay();
            });
        }

        function updateQuickDelayDisplay() {
            let threshold = $("#inp-clock-low")?.value || State.clockSyncLowTimeQuickSec;
            let quickDelay = $("#inp-clock-quick-delay")?.value || State.clockSyncQuickDelayMs || 300;
            let disp1 = $("#quick-threshold-display");
            let disp2 = $("#quick-delay-display");
            if (disp1) disp1.textContent = threshold;
            if (disp2) disp2.textContent = quickDelay;
        }

        bindUIEvent("#btn-eval-mode", "click", function () {
            let newMode = State.evaluationMode === "engine" ? "human" : "engine";
            saveSetting("evaluationMode", newMode);
            this.dataset.value = newMode;
            if (newMode === "engine") {
                this.textContent = "ENGINE";
                this.classList.add("on");
                this.classList.remove("off");
                Engine.setFullStrength();
            } else {
                this.textContent = "HUMAN";
                this.classList.add("off");
                this.classList.remove("on");
                Engine.setElo(State.eloRating);
            }
            let hg = $("#human-group");
            let he = $("#human-elo-group");
            if (hg) hg.style.display = newMode === "human" ? "" : "none";
            if (he) he.style.display = newMode === "human" ? "" : "none";
        });

        bindUIEvent("#sel-human-level", "change", function () {
            saveSetting("humanLevel", this.value);
            let cfg = ELO_LEVELS[this.value];
            if (cfg) {
                saveSetting("eloRating", cfg.elo);
                let sld = $("#sld-elo");
                let disp = $("#elo-display");
                if (sld) sld.value = cfg.elo;
                if (disp) disp.textContent = cfg.elo;
                if (State.evaluationMode === "human") Engine.setElo(cfg.elo);
            }
        });

        bindUIEvent("#sld-elo", "input", function () {
            let v = parseInt(this.value);
            saveSetting("eloRating", v);
            $("#elo-display").textContent = v;
            if (State.evaluationMode === "human") Engine.setElo(v);
        });

        bindUIEvent("#sld-depth", "input", function () {
            saveSetting("customDepth", parseInt(this.value));
            $("#depth-display").textContent = State.customDepth;
        });

        bindUIEvent("#btn-auto-depth", "click", function () {
            if (State.autoDepthAdapt) {

                setTimeout(function () {
                    State.lastOpponentRating = null;
                    applyAutoDepthFromOpponent();
                }, 100);
            }
        });

        bindToggle("btn-auto-run", "autoRun");
        bindToggle("btn-auto-move", "autoMovePiece");
        bindToggle("btn-auto-match", "autoMatch");
        bindToggle("btn-highlight", "highlightEnabled");
        bindToggle("btn-book", "useOpeningBook");
        bindToggle("btn-auto-depth", "autoDepthAdapt");
        bindToggle("btn-pv-arrows", "showPVArrows");
        bindToggle("btn-bestmove-arrows", "showBestmoveArrows");
        bindToggle("btn-main-consensus", "useMainConsensus");
        bindToggle("btn-analysis-blunder-guard", "analysisBlunderGuard");

        let stableInput = $("#inp-analysis-stable");
        if (stableInput) {
            stableInput.addEventListener("change", function () {
                let v = parseInt(this.value, 10);
                if (!isNaN(v)) {
                    saveSetting("analysisMinStableUpdates", clamp(v, 1, 5));
                    this.value = State.analysisMinStableUpdates;
                }
            });
        }

        let pvDepthSlider = $("#sld-pv-depth");
        if (pvDepthSlider) {
            pvDepthSlider.addEventListener("input", function () {
                let v = parseInt(this.value);
                saveSetting("maxPVDepth", v);
                let disp = $("#pv-depth-display");
                if (disp) disp.textContent = v;
                if (State.showPVArrows) {
                    if (State.analysisMode && State.analysisPVLine.length > 0) {
                        UI.clearPVArrows();
                        UI.drawPVArrows(State.analysisPVLine, State.analysisPVTurn, true);
                    } else if (State.mainPVLine.length > 0) {
                        UI.clearPVArrows();
                        UI.drawPVArrows(State.mainPVLine, State.mainPVTurn, false);
                    }
                }
            });
        }

        let cctBtn = $("#btn-cct-analysis");
        if (cctBtn) {
            cctBtn.addEventListener("click", function () {
                let newVal = !State.cctAnalysisEnabled;
                saveSetting("cctAnalysisEnabled", newVal);
                syncToggleUI("btn-cct-analysis", newVal);
                let settings = $("#cct-settings");
                if (settings) settings.style.display = newVal ? "" : "none";
            });
        }

        ['cct-checks', 'cct-captures', 'cct-threats'].forEach(function (id) {
            let chk = $("#" + id);
            if (chk) {
                chk.addEventListener("change", function () {
                    let component = id.replace('cct-', '');
                    State.cctComponents[component] = this.checked;
                    saveSetting("cctComponents", State.cctComponents);
                });
            }
        });

        bindUIEvent("#btn-analysis", "click", function () {
            let newVal = !State.analysisMode;
            saveSetting("analysisMode", newVal);
            syncToggleUI("btn-analysis", newVal);

            let grp = $("#analysis-colors-group");
            if (grp) grp.style.display = newVal ? "" : "none";

            if (newVal) {
                State.analysisGuardStateText = "Monitoring";
                State._preAnalysisState = {
                    autoRun: State.autoRun,
                    autoMovePiece: State.autoMovePiece,
                    autoMatch: State.autoMatch,
                    highlightEnabled: State.highlightEnabled,
                    showPVArrows: State.showPVArrows
                };
                Engine.stop();
                cancelPendingMove();

                if (!State.premoveEnabled) {
                    saveSetting("highlightEnabled", true);
                    syncToggleUI("btn-highlight", true);
                    saveSetting("showPVArrows", true);
                    syncToggleUI("btn-pv-arrows", true);
                }

                saveSetting("autoRun", false);
                syncToggleUI("btn-auto-run", false);
                saveSetting("autoMovePiece", false);
                syncToggleUI("btn-auto-move", false);
                saveSetting("autoMatch", false);
                syncToggleUI("btn-auto-match", false);

                UI.clearAll();
                Engine.loadAnalysisEngine();
                State._lastAnalysisFen = null;
                analysisCheck();
                UI.updateAnalysisMonitorDisplay();

            } else {
                let prev = State._preAnalysisState || {};
                saveSetting("highlightEnabled", prev.highlightEnabled !== undefined ? prev.highlightEnabled : true);
                syncToggleUI("btn-highlight", State.highlightEnabled);
                saveSetting("showPVArrows", prev.showPVArrows !== undefined ? prev.showPVArrows : false);
                syncToggleUI("btn-pv-arrows", State.showPVArrows);
                if (Engine.analysis) {
                    Engine.analysis.terminate();
                    Engine.analysis = null;
                }
                State.analysisPVLine = [];
                State.analysisPVTurn = "w";
                State.analysisStableCount = 0;
                State.analysisLastBestMove = "";
                State.analysisPrevEvalCp = null;
                State.analysisLastEvalCp = null;
                State.analysisGuardStateText = "Ready";
                UI.clearAll();
                State._lastAnalysisFen = null;
                UI.updateAnalysisMonitorDisplay();
            }
        });

        $$(".cap-color-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                let color = this.dataset.color;
                saveSetting("autoAnalysisColor", color);
                $$(".cap-color-btn").forEach(function (b) {
                    b.classList.toggle("active", b.dataset.color === color);
                });
                if (State.analysisMode && Engine.analysis) {
                    State._lastAnalysisFen = null;
                    analysisCheck();
                }
            });
        });

        let premoveBtn = $("#btn-premove");
        if (premoveBtn) {
            premoveBtn.addEventListener("click", function () {
                let newVal = !State.premoveEnabled;
                saveSetting("premoveEnabled", newVal);
                syncToggleUI("btn-premove", newVal);
                let settings = $("#premove-settings");
                if (settings) settings.style.display = newVal ? "" : "none";

                if (newVal) {
                    if (State.analysisMode) {
                        State.statusInfo = "Premove disabled in Analysis Mode";
                        UI.updateStatusInfo();
                        return;
                    }

                    State._prePremoveState = {
                        highlightEnabled: State.highlightEnabled,
                        showPVArrows: State.showPVArrows
                    };
                    saveSetting("highlightEnabled", false);
                    syncToggleUI("btn-highlight", false);
                    saveSetting("showPVArrows", false);
                    syncToggleUI("btn-pv-arrows", false);
                    UI.clearPVArrows();
                    UI.clearHighlights();
                } else {
                    let prev = State._prePremoveState || {};
                    saveSetting("highlightEnabled", prev.highlightEnabled !== undefined ? prev.highlightEnabled : true);
                    syncToggleUI("btn-highlight", State.highlightEnabled);
                    saveSetting("showPVArrows", prev.showPVArrows !== undefined ? prev.showPVArrows : false);
                    syncToggleUI("btn-pv-arrows", State.showPVArrows);
                }
            });
        }

        let premoveModeSelect = $("#sel-premove-mode");
        if (premoveModeSelect && !premoveModeSelect._bound) {
            premoveModeSelect._bound = true;
            premoveModeSelect.addEventListener("change", function () {
                saveSetting("premoveMode", this.value);
                let filters = $("#premove-piece-filters");
                if (filters) filters.style.display = this.value === "filter" ? "" : "none";
                if (this.value !== "every" && this.value !== "capture" && this.value !== "filter") {
                    warn("Unknown premoveMode:", this.value);
                }
            });
        }

        $$("#premove-piece-filters input[type=\"checkbox\"]").forEach(function (chk) {
            if (chk._bound) return;
            chk._bound = true;
            chk.addEventListener("change", function () {
                let p = this.dataset.piece;
                if (!/^[qrbnp]$/.test(p)) {
                    warn("Unknown piece filter key:", p);
                    return;
                }
                State.premovePieces[p] = this.checked ? 1 : 0;
                saveSetting("premovePieces", State.premovePieces);
            });
        });

        $("#btn-delay-mode").addEventListener("click", function () {
            let newVal = !State.useSecondDelay;
            saveSetting("useSecondDelay", newVal);
            this.textContent = newVal ? "Fast Mode" : "Normal";
            this.classList.toggle("on", newVal);
            this.classList.toggle("off", !newVal);
            $("#delay-normal").style.display = newVal ? "none" : "";
            $("#delay-fast").style.display = newVal ? "" : "none";
        });

        let delayPresets = {
            "bullet": { min: 0.5, max: 1.0 },
            "blitz": { min: 1.0, max: 2.0 },
            "rapid": { min: 2.0, max: 4.0 }
        };

        $$(".cap-preset-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                let preset = this.dataset.preset;
                if (delayPresets[preset]) {
                    let config = delayPresets[preset];

                    saveSetting("minDelay", config.min);
                    saveSetting("maxDelay", config.max);

                    let minInput = $("#inp-min-delay");
                    let maxInput = $("#inp-max-delay");
                    if (minInput) minInput.value = config.min;
                    if (maxInput) maxInput.value = config.max;

                    $$(".cap-preset-btn").forEach(function (b) {
                        b.classList.remove("active");
                    });
                    this.classList.add("active");

                    State.statusInfo = "Preset: " + preset.charAt(0).toUpperCase() + preset.slice(1) + " (" + config.min + "s - " + config.max + "s)";
                    UI.updateStatusInfo();
                }
            });
        });

        $$("[id^='btn-mode-']").forEach(function (btn) {
            btn.addEventListener("click", function () {
                let mode = this.dataset.mode;
                State.moveExecutionMode = mode;
                saveSetting("moveExecutionMode", mode);

                $("#btn-mode-click").classList.toggle("active", mode === "click");
                $("#btn-mode-drag").classList.toggle("active", mode === "drag");

                State.statusInfo = "Move Mode: " + mode.toUpperCase() + (mode === "drag" ? " (Bezier)" : " (Simple)");
                UI.updateStatusInfo();
            });
        });

        let delayInputs = {
            "inp-min-delay": "minDelay",
            "inp-max-delay": "maxDelay",
            "inp-min-delay2": "minDelayTwo",
            "inp-max-delay2": "maxDelayTwo"
        };
        Object.keys(delayInputs).forEach(function (id) {
            let el = $("#" + id);
            if (el) {
                el.addEventListener("change", function () {
                    let v = parseFloat(this.value);
                    if (!isNaN(v) && v > 0) saveSetting(delayInputs[id], v);
                });
            }
        });

        $("#inp-color1").addEventListener("input", function () {
            saveSetting("highlightColor1", this.value);
        });
        let pvActiveRank = 1;
        let pvActiveInput = $("#inp-pv-color-active");
        if (pvActiveInput) {
            pvActiveInput.addEventListener("input", function () {
                let colors = Object.assign({}, State.pvArrowColors || {});
                colors[pvActiveRank] = this.value;
                saveSetting("pvArrowColors", colors);
                let swatch = $(".cap-pv-color[data-pv-rank='" + pvActiveRank + "']");
                if (swatch) swatch.style.background = this.value;
                if (State.showPVArrows) {
                    if (State.analysisMode && State.analysisPVLine.length > 0) {
                        UI.clearPVArrows();
                        UI.drawPVArrows(State.analysisPVLine, State.analysisPVTurn, true);
                    } else if (State.mainPVLine.length > 0) {
                        UI.clearPVArrows();
                        UI.drawPVArrows(State.mainPVLine, State.mainPVTurn, false);
                    }
                }
            });
        }

        $$(".cap-pv-color").forEach(function (swatch) {
            swatch.addEventListener("click", function () {
                let rank = parseInt(this.dataset.pvRank, 10);
                if (!rank || rank < 1 || rank > 9) return;
                pvActiveRank = rank;
                $$(".cap-pv-color").forEach(function (el) {
                    el.classList.toggle("active", el.dataset.pvRank === String(rank));
                });
                if (pvActiveInput) {
                    let colors = State.pvArrowColors || {};
                    pvActiveInput.value = colors[rank] || colors[String(rank)] || "#4287f5";
                }
            });
        });

        let bmActiveRank = 1;
        let bmActiveInput = $("#inp-bestmove-color-active");
        if (bmActiveInput) {
            bmActiveInput.addEventListener("input", function () {
                let colors = Object.assign({}, State.bestmoveArrowColors || {});
                colors[bmActiveRank] = this.value;
                saveSetting("bestmoveArrowColors", colors);
                if (bmActiveRank === 1) {
                    // Keep backward compatibility with older single-color setting.
                    saveSetting("bestmoveArrowColor", this.value);
                }
                let swatch = $(".cap-bm-color[data-bm-rank='" + bmActiveRank + "']");
                if (swatch) swatch.style.background = this.value;
                if (State.showBestmoveArrows && !State.analysisMode) {
                    UI.drawBestmoveArrows();
                }
            });
        }

        $$(".cap-bm-color").forEach(function (swatch) {
            swatch.addEventListener("click", function () {
                let rank = parseInt(this.dataset.bmRank, 10);
                if (!rank || rank < 1 || rank > 9) return;
                bmActiveRank = rank;
                $$(".cap-bm-color").forEach(function (el) {
                    el.classList.toggle("active", el.dataset.bmRank === String(rank));
                });
                if (bmActiveInput) {
                    let colors = State.bestmoveArrowColors || {};
                    bmActiveInput.value = colors[rank] || colors[String(rank)] || "#eb6150";
                }
            });
        });

        $$(".cap-preset").forEach(function (p) {
            p.addEventListener("click", function () {
                if (!this.dataset.c) return;
                let parent = this.closest(".cap-presets");
                if (!parent || !parent.dataset || !parent.dataset.target) return;
                let targetId = parent.dataset.target;
                let input = $("#" + targetId);
                if (input) {
                    input.value = this.dataset.c;
                    input.dispatchEvent(new Event("input"));
                }
            });
        });

        bindUIEvent("#btn-reload-engine", "click", function () {
            State.statusInfo = "🔄 Reloading all engines...";
            UI.updateStatusInfo();

            this.disabled = true;
            this.textContent = "⏳";
            this.style.opacity = "0.7";

            Engine.reloadAllEngines().then(function (success) {
                let btn = $("#btn-reload-engine");
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = "Reload";
                    btn.style.opacity = "1";
                }

                if (success) {
                    State.statusInfo = "✅ All engines reloaded!";
                    UI.updateStatusInfo();

                    if (State.analysisMode) {
                        State._lastAnalysisFen = null;
                        analysisCheck();
                    }
                } else {
                    State.statusInfo = "❌ Engine reload failed";
                    UI.updateStatusInfo();
                }
            });
        });

        bindUIEvent("#btn-run-once", "click", function () {
            if (State.analysisMode) {
                State._lastAnalysisFen = null;
                analysisCheck();
            } else {
                runEngineNow();
            }
        });

        bindUIEvent("#btn-stop-engine", "click", function () {
            Engine.stop();
            if (State.analysisMode && Engine.analysis) {
                Engine.analysis.postMessage("stop");
            }
            UI.clearAll();
        });

        bindUIEvent("#btn-clear-history", "click", function () {
            MoveHistory.clear();
        });

        bindUIEvent("#btn-auto-resign", "click", function () {
            let newVal = !State.autoResignEnabled;
            saveSetting("autoResignEnabled", newVal);
            syncToggleUI("btn-auto-resign", newVal);
            $("#auto-resign-group").style.display = newVal ? "" : "none";
        });
        bindUIEvent("#sel-resign-mode", "change", function () {
            saveSetting("resignMode", this.value);
            $("#resign-mate-box").style.display = this.value === "mate" ? "" : "none";
            $("#resign-cp-box").style.display = this.value === "cp" ? "" : "none";
        });
        bindUIEvent("#sel-resign-m", "change", function () {
            let v = parseInt(this.value);
            if (!isNaN(v)) saveSetting("autoResignThresholdMate", v);
        });
        bindUIEvent("#inp-resign-cp", "change", function () {
            let v = parseInt(this.value);
            if (!isNaN(v)) saveSetting("autoResignThresholdCp", v);
        });

        bindUIEvent("#btn-clock-sync", "click", function () {
            let newVal = !State.clockSync;
            saveSetting("clockSync", newVal);
            syncToggleUI("btn-clock-sync", newVal);
            $("#clock-sync-group").style.display = newVal ? "" : "none";
        });
        bindUIEvent("#txt-notation-sequence", "input", function () {
            saveSetting("notationSequence", this.value.trim());
        });
    }

    function loadStockfishManually() {
        return EngineLoader.loadAsync();
    }

    // =====================================================
    // Section 03: DOM Utility Functions
    // =====================================================
    function $(sel, root) {
        return (root || document).querySelector(sel);
    }

    function $$(sel, root) {
        return Array.from((root || document).querySelectorAll(sel));
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            scheduleManagedTimeout(resolve, ms);
        });
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    // =====================================================
    // Section 04: Debug and Error Logging
    // =====================================================
    const DEBUG = true;

    function log() {
        if (!DEBUG) return;
        console.log.apply(console, ["[ChessAssistant]"].concat([...arguments]));
    }

    function warn() {
        if (!DEBUG) return;
        console.warn.apply(console, ["[ChessAssistant]"].concat([...arguments]));
    }

    function err() {
        console.error.apply(console, ["[ChessAssistant]"].concat([...arguments]));
    }

    // =====================================================
    // Section 05: Local Error Handler
    // =====================================================
    (function attachLocalErrorHandler() {
        window.addEventListener("error", function (e) {
            if (!e || !e.filename) return;
            if (!e.filename.includes("user") && !e.filename.includes("tamper")) return;
            err(e.error || e.message);
        });
    })();

    // =====================================================
    // Section 06: Stealth Configuration (v3.0)
    // =====================================================
    let CONFIG = {
        MAX_HISTORY_SIZE: 50,
        MAX_ACPL_DISPLAY: 50,
        MATE_VALUE: 50000,
        MAX_BAR_CAP: 2000,
        DEFAULT_DEPTH: 15,
        MAX_DEPTH: 30,
        PANEL_WIDTH: 340,
        UPDATE_INTERVAL: 150,
        FEN_POLL_INTERVAL: 300,
        MAX_CACHE_SIZE: 500,
        STEALTH: {
            RANDOMIZE_DELAYS: true,
            JITTER_RANGE: 0.15,
            MOVE_TIME_VARIANCE: 0.25,
            HUMAN_PAUSE_PROBABILITY: 0.1,
            MAX_CONSISTENT_MOVES: 8,
            BLUNDER_INJECTION_RATE: 0.05,
            THINK_TIME_MIN: 800,
            THINK_TIME_MAX: 3500,
        },
        EVASION: {
            CLEAR_CONSOLE_LOGS: true,
            MASK_GLOBAL_VARIABLES: true,
            RANDOMIZE_CLASS_NAMES: false,
            DISABLE_RIGHT_CLICK: false,
            PREVENT_DEVTOOLS_DETECTION: true,
        },
        PREMOVE: {
            MAX_EXECUTED_FENS: 100,
            ENGINE_TIMEOUT: 8000,
            EXECUTION_TIMEOUT: 5000,
            RETRY_DELAY: 100,
            MAX_RETRIES: 2
        },
        HUMAN: {
            // Internal guardrails for fallback move selection in human mode.
            CRITICAL_CP_THRESHOLD: -120,
            CRITICAL_MATE_PLY: 8,
            CRITICAL_KING_ATTACKERS: 1,
            DEBUG_DECISION: false,
            // Per-level tuning so fallback behavior feels more natural per strength.
            LEVEL_TUNING: {
                beginner: { errorMult: 1.20, blunderMult: 1.35, criticalErrorMult: 0.75, criticalBlunderMult: 0.45, safetyRiskCap: 70 },
                casual: { errorMult: 1.10, blunderMult: 1.20, criticalErrorMult: 0.70, criticalBlunderMult: 0.35, safetyRiskCap: 65 },
                intermediate: { errorMult: 1.00, blunderMult: 1.00, criticalErrorMult: 0.55, criticalBlunderMult: 0.20, safetyRiskCap: 60 },
                advanced: { errorMult: 0.80, blunderMult: 0.70, criticalErrorMult: 0.45, criticalBlunderMult: 0.12, safetyRiskCap: 55 },
                expert: { errorMult: 0.65, blunderMult: 0.55, criticalErrorMult: 0.35, criticalBlunderMult: 0.08, safetyRiskCap: 50 }
            }
        }
    };

    let ELO_LEVELS = {
        beginner: { elo: 800, moveTime: { min: 1, max: 5 }, errorRate: 0.30, blunderRate: 0.15 },
        casual: { elo: 1200, moveTime: { min: 2, max: 8 }, errorRate: 0.20, blunderRate: 0.10 },
        intermediate: { elo: 1600, moveTime: { min: 3, max: 12 }, errorRate: 0.15, blunderRate: 0.05 },
        advanced: { elo: 2000, moveTime: { min: 5, max: 15 }, errorRate: 0.10, blunderRate: 0.03 },
        expert: { elo: 2400, moveTime: { min: 8, max: 20 }, errorRate: 0.05, blunderRate: 0.01 }
    };

    let PIECE_CHAR = {
        "br": "r",
        "bn": "n",
        "bb": "b",
        "bq": "q",
        "bk": "k",
        "bp": "p",
        "wr": "R",
        "wn": "N",
        "wb": "B",
        "wq": "Q",
        "wk": "K",
        "wp": "P"
    };

    let PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

    let PV_COLORS = {
        white: ["#15ff00ff", "#00a7f5ff", "#0b8600ff", "#8f0288ff", "#e709acff"],
        black: ["#ee0043ff", "#fc6000ff", "#290268ff", "#a3021dff", "#802323ff"]
    };

    let OPENING_BOOK = {
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": {
            "e2e4": 4, "d2d4": 3, "c2c4": 2, "g1f3": 2,
            "b2b3": 1, "g2g3": 1, "f2f4": 1, "b1c3": 1, "e2e3": 1
        },
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": {
            "c7c5": 3, "e7e5": 3, "e7e6": 2, "c7c6": 2,
            "d7d6": 1, "g7g6": 1, "d7d5": 1, "g8f6": 1, "b7b6": 1, "b8c6": 1
        },
        "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": {
            "g1f3": 3, "f1c4": 2, "f1b5": 2, "b1c3": 2,
            "d2d4": 1, "f2f4": 1, "g1e2": 1, "c2c3": 1, "b2b4": 1
        },
        "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": {
            "d2d4": 3, "g1f3": 2, "c2c4": 1, "b1c3": 1, "f1d3": 1
        },
        "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": {
            "d2d4": 3, "g1f3": 1, "b1c3": 1, "c2c4": 1, "f1c4": 1
        },
        "rnbqkbnr/ppp1pppp/3p4/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": {
            "d2d4": 2, "g1f3": 2, "b1c3": 1, "f1c4": 1, "c2c4": 1
        },
        "rnbqkbnr/ppp1pppp/6p1/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": {
            "d2d4": 2, "g1f3": 2, "b1c3": 1, "f1c4": 1, "c2c4": 1
        },
        "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6": {
            "e4d5": 2, "d2d4": 1, "g1f3": 1, "b1c3": 1
        },
        "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": {
            "e4e5": 2, "b1c3": 2, "g1f3": 2, "d2d4": 2
        },
        "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": {
            "d7d5": 3, "g8f6": 3, "c7c5": 2, "e7e6": 2,
            "f7f5": 1, "d7d6": 1, "g7g6": 1, "b7b5": 1
        },
        "rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": {
            "b1c3": 2, "g1f3": 2, "c4d5": 2, "e2e3": 1, "g2g3": 1
        },
        "rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": {
            "g1f3": 2, "b1c3": 2, "e2e3": 1, "g2g3": 1
        },
        "rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -": {
            "b1c3": 2, "g1f3": 2, "e2e4": 2, "f2f3": 1, "g2g3": 1
        },
        "rnbqkb1r/pppppp1p/5np1/8/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq -": {
            "d7d5": 3, "c7c5": 2, "g7g6": 1, "b8c6": 1
        },
        "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3": {
            "e7e5": 3, "c7c5": 2, "g8f6": 2, "e7e6": 2,
            "g7g6": 1, "b7b6": 1, "d7d5": 1
        },
        "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -": {
            "d7d5": 3, "g8f6": 3, "c7c5": 2, "g7g6": 2,
            "d7d6": 1, "b7b6": 1
        },
        "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": {
            "d7d6": 2, "e7e6": 2, "b8c6": 2, "g7g6": 2,
            "a7a6": 1, "e7e5": 1, "g8f6": 1
        },
        "rnbqkb1r/1p3ppp/p2ppn2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": {
            "f1e2": 2, "f1c4": 2, "g1f3": 1, "a2a4": 2, "h2h3": 1
        },
        "rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -": {
            "f1e3": 2, "f1c4": 2, "g2g3": 2, "h2h4": 1, "c1e3": 1
        },
        "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/R1BQK2R w KQkq -": {
            "e1g1": 2, "d2d3": 2, "b5c6": 2, "d2d4": 1
        },
        "r1bq1rk1/2p1bppp/p1n2n2/1p1pp3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - -": {
            "e4d5": 3, "a2a4": 2, "h2h3": 1, "b1d2": 1
        },
        "rnbqk1nr/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq -": {
            "e4e5": 2, "a2a3": 2, "c1d2": 2, "g1f3": 1
        },
        "rnbqkb1r/ppp2ppp/4pn2/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR w KQkq -": {
            "e4e5": 2, "c1g5": 2, "g1f3": 2, "f1d3": 1
        },
        "rn1qkbnr/pp2pppp/2p5/5b2/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -": {
            "g1f3": 2, "f2f3": 2, "c2c4": 2, "f1d3": 1
        },
        "rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq -": {
            "c8f5": 2, "e7e6": 2, "c6c5": 1, "g8h6": 1, "b8d7": 1
        },
        "rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq -": {
            "e2e4": 2, "e2e3": 2, "g1f3": 2, "b1c3": 2
        },
        "rnbqkb1r/ppp2ppp/5n2/3p2B1/3P4/2N5/PP2PPPP/R2QKBNR b KQkq -": {
            "f8e7": 2, "b8d7": 2, "h7h6": 2, "c7c6": 1
        },
        "rnbq1rk1/ppp2pbp/3p1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQK2R w KQ -": {
            "d4e5": 3, "c1e3": 2, "c1g5": 1, "f1e1": 1
        },
        "rnbqk2r/ppp1ppbp/3p2p1/8/2PPP3/2N2P2/PP4PP/R1BQKBNR b KQkq -": {
            "e8g8": 2, "b8c6": 2, "c7c6": 1, "c7c5": 1, "e7e5": 1
        },
        "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR b KQkq -": {
            "e8g8": 2, "d7d5": 2, "c7c5": 2, "b7b6": 1
        },
        "rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2NQ4/PP2PPPP/R1B1KBNR b KQkq -": {
            "e8g8": 2, "d7d5": 2, "c7c5": 2, "g7g6": 1
        },
        "rnbqk2r/p1pp1ppp/bp2pn2/8/2PP4/1P3NP1/P3PP1P/R1B1KBNR b KQkq -": {
            "f8b4": 2, "c8b7": 2, "d7d5": 2, "h7h6": 1
        },
        "rnbq1rk1/ppp1ppbp/3p1np1/5p2/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w - -": {
            "b1c3": 2, "d4d5": 2, "c4c5": 2, "d2d3": 1
        },
        "rnbq1rk1/pp4pp/2p1pn2/3p1p2/2PP4/5NP1/PP2PPBP/RNBQ1RK1 w - -": {
            "b1d2": 2, "d4e5": 2, "c4d5": 2, "d1c2": 1
        },
        "r1bq1rk1/pp1pppbp/2n2np1/2p5/2PP4/2N2NP1/PP2PPBP/R1BQ1RK1 b - -": {
            "c5d4": 2, "d7d5": 2, "c6d4": 2, "e7e6": 1
        },
        "r2qk2r/ppp1bppp/4b3/3n4/3Q4/2N3P1/PP2PPBP/R1B2RK1 b kq -": {
            "b8c6": 2, "d5c3": 2, "d8d4": 2, "e8g8": 1
        },
        "rn1qkb1r/pp3ppp/2p1pn2/3p1b2/8/3P1NP1/PPPNPPBP/R1BQ1RK1 b kq -": {
            "h7h6": 2, "a7a5": 2, "b8d7": 2, "f8d6": 1
        },
        "r1bq1rk1/pppnbppp/4pn2/3p4/2PP4/5NP1/PPQ1PPBP/R1BR2K1 b - -": {
            "c7c5": 2, "b7b6": 2, "c7c6": 2, "a7a6": 1
        },
        "r2q1rk1/1pp1bppp/p1n1pn2/8/P1pP4/2N2NP1/1PQ1PPBP/R1BR2K1 b - -": {
            "b7b5": 2, "b7b6": 2, "a6a5": 2, "h7h6": 1
        }
    };

    const OPENING_NAMES = {
        // 1. e4 Openings
        "e2e4": "King's Pawn Opening",
        "e7e5": "Open Game",
        "c7c5": "Sicilian Defense",
        "e7e6": "French Defense",
        "c7c6": "Caro-Kann Defense",
        "d7d6": "Pirc Defense",
        "d7d5": "Scandinavian Defense",
        "g8f6": "Alekhine's Defense",
        "f7f5": "Dutch Defense",
        "g7g6": "Modern Defense",
        "b8c6": "Nimzowitsch Defense",

        // 1. e4 e5 Specific Variations
        "f1b5": "Ruy López Opening",
        "f1c4": "Italian Game",
        "f2f4": "King's Gambit",
        "g1f3": "Scotch Game",
        "b1c3": "Vienna Game",
        "d2d4": "Center Game",
        "c2c3": "Ponziani Opening",
        "f1d3": "Bishop's Opening",

        // 1. d4 Openings
        "d2d4": "Queen's Pawn Game",
        "d7d5": "Closed Game",
        "c7c6": "Slav Defense",
        "g8f6": "Indian Defense",
        "c7c5": "Benoni Defense",
        "f7f5": "Dutch Defense",
        "g7g6": "King's Indian Defense",
        "b8c6": "Chigorin Defense",
        "e7e5": "Englund Gambit",

        // 1. d4 d5 2. c4 Openings
        "c2c4": "Queen's Gambit",
        "e7e6": "Queen's Gambit Declined",
        "d5c4": "Queen's Gambit Accepted",

        // Indian Defenses (after 1.d4 Nf6)
        "b1c3": "Nimzo-Indian Defense",
        "e2e3": "Bogo-Indian Defense",
        "g2g3": "Catalan Opening",
        "c1g5": "Trompowsky Attack",
        "c1f4": "London System",
        "d7d5": "Grünfeld Defense",
        "e7e6": "Queen's Indian Defense",
        "b7b5": "Benko Gambit",
        "c7c5": "Benoni Defense: Modern Variation",

        // Other Flank Openings (1.Nf3, 1.c4, etc.)
        "g1f3": "Réti Opening",
        "c2c4": "English Opening",
        "f2f4": "Bird's Opening",
        "g2g3": "King's Indian Attack",
        "b2b3": "Nimzowitsch-Larsen Attack",
        "b2b4": "Polish Opening",
        "g2g4": "Grob Opening",

        // Long-form notation entries
        "1.e4 d6 2.d4 Nf6": "Pirc Defense",
        "1.e4 d6 2.d4 Nf6 3.Nc3 g6": "Pirc Defense",
        "1.e4 e5 2.f4": "King's Gambit",
        "1.e4 Nf6": "Alekhine's Defense",
        "1.e4 e6": "French Defense",
        "1.e4 c6": "Caro-Kann Defense",
        "1.e4 d5": "Scandinavian Defense",
        "1.e4 c5": "Sicilian Defense",
        "1.e4 e5 2.Nf3 Nc6 3.Bc4": "Italian Game",
        "1.e4 e5 2.Nf3 Nc6 3.Bb5": "Ruy López Opening",

        "1.d4 d5 2.c4": "Queen's Gambit",
        "1.d4 Nf6 2.c4 e6 3.Nc3": "Nimzo-Indian Defense",
        "1.d4 Nf6 2.c4 e6 3.Nf3": "Queen's Indian Defense",
        "1.d4 Nf6 2.c4 g6 3.Nc3": "King's Indian Defense",
        "1.d4 Nf6 2.c4 g6 3.Nc3 d5": "Grünfeld Defense",
        "1.d4 Nf6 2.c4 e6 3.g3": "Catalan Opening",
        "1.d4 Nf6 2.c4 e6 3.Nf3 Bb4+": "Bogo-Indian Defense",
        "1.d4 Nf6 2.c4 c5 3.d5": "Benoni Defense: Modern Variation",
        "1.d4 Nf6 2.Bg5": "Trompowsky Attack",
        "1.d4 Nf6 2.c4 c5 3.d5 b5": "Benko Gambit",
        "1.d4 d5 2.Bf4": "London System",
        "1.d4 f5": "Dutch Defense",

        "1.Nf3": "Réti Opening",
        "1.c4": "English Opening",
        "1.f4": "Bird's Opening",
        "1.g3": "King's Indian Attack",
        "1.b3": "Nimzowitsch-Larsen Attack",
        "1.b4": "Polish Opening",
        "1.g4": "Grob Opening"
    };

    // =====================================================
    // Section 07: Application State Variables (Fixed v4.0)
    // =====================================================

    let State = {
        autoMovePiece: GM_getValue("autoMovePiece", false),
        moveExecutionMode: GM_getValue("moveExecutionMode", "click"),
        autoRun: GM_getValue("autoRun", false),
        autoMatch: GM_getValue("autoMatch", false),
        minDelay: GM_getValue("minDelay", 0.5),
        maxDelay: GM_getValue("maxDelay", 3.0),
        useSecondDelay: GM_getValue("useSecondDelay", false),
        minDelayTwo: GM_getValue("minDelayTwo", 0.1),
        maxDelayTwo: GM_getValue("maxDelayTwo", 0.5),
        eloRating: GM_getValue("eloRating", 1600),
        customDepth: GM_getValue("customDepth", CONFIG.DEFAULT_DEPTH),
        evaluationMode: GM_getValue("evaluationMode", "engine"),
        panelTop: GM_getValue("panelTop", null),
        panelLeft: GM_getValue("panelLeft", null),
        panelState: GM_getValue("panelState", "maximized"),
        onboardingAccepted: GM_getValue("onboardingAccepted", false),
        highlightColor1: GM_getValue("highlightColor1", "#eb6150"),
        highlightColor2: GM_getValue("highlightColor2", "#4287f5"),
        analysisMode: GM_getValue("analysisMode", false),
        highlightEnabled: GM_getValue("highlightEnabled", false),
        autoAnalysisColor: GM_getValue("autoAnalysisColor", "none"),
        useMainConsensus: GM_getValue("useMainConsensus", true),
        analysisBlunderGuard: GM_getValue("analysisBlunderGuard", true),
        analysisMinStableUpdates: GM_getValue("analysisMinStableUpdates", 2),
        showMultipleMoves: GM_getValue("showMultipleMoves", false),
        numberOfMovesToShow: GM_getValue("numberOfMovesToShow", 5),
        clockSyncQuickDelayMs: GM_getValue("clockSyncQuickDelayMs", 300),

        premoveEnabled: GM_getValue("premoveEnabled", false),
        premoveMode: GM_getValue("premoveMode", "capture"),
        premovePieces: GM_getValue("premovePieces", { q: 1, r: 1, b: 1, n: 1, p: 1 }),
        premoveDepth: GM_getValue("premoveDepth", 5),
        premoveRiskPenaltyFactor: GM_getValue("premoveRiskPenaltyFactor", 0.5),
        premoveMinConfidence: GM_getValue("premoveMinConfidence", 5),
        premoveDelayMs: GM_getValue("premoveDelayMs", 300),

        premoveExecutedForFen: null,
        premoveAnalysisInProgress: false,
        premoveLastAnalysisTime: 0,
        premoveThrottleMs: 500,
        premoveRetryCount: 0,

        isPremoveAnalysis: false,
        lastNewGameLogTs: 0,
        moveNumber: 1,
        incrementSeconds: 0,
        humanLevel: GM_getValue("humanLevel", "intermediate"),
        useOpeningBook: GM_getValue("useOpeningBook", true),
        openingBook: {},
        showPVArrows: GM_getValue("showPVArrows", false),
        pvArrowColors: GM_getValue("pvArrowColors", {
            1: "#4287f5",
            2: "#eb6150",
            3: "#4caf50",
            4: "#9c27b0",
            5: "#f38ba8",
            6: "#fab387",
            7: "#74c7ec",
            8: "#f5c2e7",
            9: "#b4befe"
        }),
        showBestmoveArrows: GM_getValue("showBestmoveArrows", false),
        bestmoveArrowColor: GM_getValue("bestmoveArrowColor", "#f9e2af"),
        bestmoveArrowColors: GM_getValue("bestmoveArrowColors", {
            1: "#eb6150",
            2: "#89b4fa",
            3: "#a6e3a1",
            4: "#f38ba8",
            5: "#cba6f7",
            6: "#fab387",
            7: "#74c7ec",
            8: "#f5c2e7",
            9: "#b4befe"
        }),
        maxPVDepth: GM_getValue("maxPVDepth", 2),
        autoDepthAdapt: GM_getValue("autoDepthAdapt", false),
        lastOpponentRating: null,

        mainPVLine: [],
        mainPVTurn: "w",
        lastRenderedMainPV: "",
        lastMainPVDrawTime: 0,

        analysisPVLine: [],
        analysisPVTurn: "w",
        lastRenderedAnalysisPV: "",
        lastAnalysisPVDrawTime: 0,

        lastRenderedPV: "",
        lastPVDrawTime: 0,

        _lastMainFen: null,
        _lastAnalysisFen: null,
        _lastPremoveFen: null,
        _lastAnalysisDepth: 0,
        _lastAnalysisBestPV: [],
        _lastAnalysisBestMove: null,

        _prePremoveState: null,
        _preAnalysisState: null,

        _lastScoreInfo: null,
        _lastPremoveScoreInfo: null,

        isThinking: false,
        canGo: true,
        autoRunTimer: null,
        autoRunWasEnabled: false,
        loopStarted: false,
        clockIntervalId: null,
        updateIntervalId: null,
        gameOverIntervalId: null,
        fenPollIntervalId: null,
        autoMatchIntervalId: null,
        gameEnded: false,
        lastAnalyzedFen: null,
        lastAutoRunFen: null,
        lastPremoveAnalyzedFen: null,
        currentEvaluation: 0,
        evalBarSmoothedCp: 0,
        evalBarInitialized: false,
        lastEvalDeltaCp: 0,
        _lastEvalRawCp: null,
        previousEvaluation: 0,
        currentPVTurn: "w",
        analysisStableCount: 0,
        analysisLastBestMove: "",
        analysisLastEvalCp: null,
        analysisPrevEvalCp: null,
        analysisGuardStateText: "Ready",
        mainBestHistory: [],

        totalCplWhite: 0,
        cplMoveCountWhite: 0,
        acplWhite: "0.00",
        totalCplBlack: 0,
        cplMoveCountBlack: 0,
        acplBlack: "0.00",
        acplInitialized: false,

        topMoves: [],
        topMoveInfos: {},
        topMovesFen: "",
        lastTopMove1: "...",
        lastEvalText1: "0.00",
        lastMoveGrade: "Book",
        lastEvalClass1: "eval-equal",
        principalVariation: "",
        statusInfo: "",
        isAnalysisThinking: false,
        currentDelayMs: 0,
        lastError: "",

        autoResignEnabled: GM_getValue("autoResignEnabled", false),
        resignMode: GM_getValue("resignMode", "mate"),
        autoResignThresholdMate: GM_getValue("autoResignThresholdMate", 3),
        autoResignThresholdCp: GM_getValue("autoResignThresholdCp", 1000),

        clockSync: GM_getValue("clockSync", false),
        clockSyncMinDelay: GM_getValue("clockSyncMinDelay", 1.5),
        clockSyncMaxDelay: GM_getValue("clockSyncMaxDelay", 5.0),
        clockSyncLowTimeQuickSec: GM_getValue("clockSyncLowTimeQuickSec", 20),

        cctAnalysisEnabled: GM_getValue("cctAnalysisEnabled", true),
        cctComponents: GM_getValue("cctComponents", { checks: true, captures: true, threats: true }),

        moveStartTime: 0,
        notationSequence: GM_getValue("notationSequence", ""),
        premoveStats: {
            attempted: 0,
            allowed: 0,
            executed: 0,
            blocked: 0,
            failed: 0
        },
    };

    const PERSISTED_SETTING_DEFAULTS = {
        autoMovePiece: false,
        moveExecutionMode: "click",
        autoRun: false,
        autoMatch: false,
        minDelay: 0.5,
        maxDelay: 3.0,
        useSecondDelay: false,
        minDelayTwo: 0.1,
        maxDelayTwo: 0.5,
        eloRating: 1600,
        customDepth: CONFIG.DEFAULT_DEPTH,
        evaluationMode: "engine",
        panelTop: null,
        panelLeft: null,
        panelState: "maximized",
        onboardingAccepted: false,
        highlightColor1: "#eb6150",
        highlightColor2: "#4287f5",
        analysisMode: false,
        highlightEnabled: false,
        autoAnalysisColor: "none",
        useMainConsensus: true,
        analysisBlunderGuard: true,
        analysisMinStableUpdates: 2,
        analysisGuardStateText: "Ready",
        showMultipleMoves: false,
        numberOfMovesToShow: 5,
        clockSyncQuickDelayMs: 300,
        premoveEnabled: false,
        premoveMode: "capture",
        premovePieces: { q: 1, r: 1, b: 1, n: 1, p: 1 },
        premoveDepth: 5,
        premoveRiskPenaltyFactor: 0.5,
        premoveMinConfidence: 5,
        premoveDelayMs: 300,
        humanLevel: "intermediate",
        useOpeningBook: true,
        showPVArrows: false,
        pvArrowColors: {
            1: "#4287f5",
            2: "#eb6150",
            3: "#4caf50",
            4: "#9c27b0",
            5: "#f38ba8",
            6: "#fab387",
            7: "#74c7ec",
            8: "#f5c2e7",
            9: "#b4befe"
        },
        showBestmoveArrows: false,
        bestmoveArrowColor: "#f9e2af",
        bestmoveArrowColors: {
            1: "#eb6150",
            2: "#89b4fa",
            3: "#a6e3a1",
            4: "#f38ba8",
            5: "#cba6f7",
            6: "#fab387",
            7: "#74c7ec",
            8: "#f5c2e7",
            9: "#b4befe"
        },
        maxPVDepth: 2,
        autoDepthAdapt: false,
        autoResignEnabled: false,
        resignMode: "mate",
        autoResignThresholdMate: 3,
        autoResignThresholdCp: 1000,
        clockSync: false,
        clockSyncMinDelay: 1.5,
        clockSyncMaxDelay: 5.0,
        clockSyncLowTimeQuickSec: 20,
        cctAnalysisEnabled: true,
        cctComponents: { checks: true, captures: true, threats: true },
        notationSequence: ""
    };

    const SETTING_NUMBER_LIMITS = {
        minDelay: [0.05, 60],
        maxDelay: [0.05, 60],
        minDelayTwo: [0.05, 10],
        maxDelayTwo: [0.05, 10],
        eloRating: [300, 3200],
        customDepth: [1, CONFIG.MAX_DEPTH],
        analysisMinStableUpdates: [1, 5],
        numberOfMovesToShow: [2, 10],
        clockSyncQuickDelayMs: [100, 5000],
        premoveDepth: [1, CONFIG.MAX_DEPTH],
        premoveRiskPenaltyFactor: [0, 2],
        premoveMinConfidence: [1, 95],
        premoveDelayMs: [50, 2000],
        maxPVDepth: [2, 10],
        autoResignThresholdMate: [1, 10],
        autoResignThresholdCp: [100, 5000],
        clockSyncMinDelay: [0.1, 30],
        clockSyncMaxDelay: [0.1, 60],
        clockSyncLowTimeQuickSec: [1, 300],
        panelTop: [0, 10000],
        panelLeft: [0, 10000]
    };

    function sanitizeSettingValue(key, rawValue) {
        const defaultValue = PERSISTED_SETTING_DEFAULTS[key];
        if (defaultValue === undefined) return rawValue;

        if (key === "panelTop" || key === "panelLeft") {
            if (rawValue === null || rawValue === undefined || rawValue === "") return null;
        }

        if (key === "premovePieces") {
            const base = { q: 1, r: 1, b: 1, n: 1, p: 1 };
            const src = (rawValue && typeof rawValue === "object") ? rawValue : base;
            return {
                q: src.q ? 1 : 0,
                r: src.r ? 1 : 0,
                b: src.b ? 1 : 0,
                n: src.n ? 1 : 0,
                p: src.p ? 1 : 0
            };
        }

        if (key === "cctComponents") {
            const base = { checks: true, captures: true, threats: true };
            const src = (rawValue && typeof rawValue === "object") ? rawValue : base;
            return {
                checks: !!src.checks,
                captures: !!src.captures,
                threats: !!src.threats
            };
        }

        if (key === "pvArrowColors") {
            const base = {
                1: "#4287f5",
                2: "#eb6150",
                3: "#4caf50",
                4: "#9c27b0",
                5: "#f38ba8",
                6: "#fab387",
                7: "#74c7ec",
                8: "#f5c2e7",
                9: "#b4befe"
            };
            const src = (rawValue && typeof rawValue === "object") ? rawValue : base;
            const out = {};
            for (let i = 1; i <= 9; i++) {
                const raw = src[i] || src[String(i)] || base[i];
                out[i] = /^#[0-9a-fA-F]{6}$/.test(String(raw)) ? String(raw) : base[i];
            }
            return out;
        }

        if (key === "bestmoveArrowColors") {
            const base = {
                1: "#eb6150",
                2: "#89b4fa",
                3: "#a6e3a1",
                4: "#f38ba8",
                5: "#cba6f7",
                6: "#fab387",
                7: "#74c7ec",
                8: "#f5c2e7",
                9: "#b4befe"
            };
            const src = (rawValue && typeof rawValue === "object") ? rawValue : base;
            const out = {};
            for (let i = 1; i <= 9; i++) {
                const raw = src[i] || src[String(i)] || base[i];
                out[i] = /^#[0-9a-fA-F]{6}$/.test(String(raw)) ? String(raw) : base[i];
            }
            return out;
        }

        if (key === "moveExecutionMode") {
            return rawValue === "drag" ? "drag" : "click";
        }

        if (key === "evaluationMode") {
            return rawValue === "human" ? "human" : "engine";
        }

        if (key === "panelState") {
            return ["maximized", "minimized", "closed"].includes(rawValue) ? rawValue : "maximized";
        }

        if (key === "autoAnalysisColor") {
            return ["white", "black", "none"].includes(rawValue) ? rawValue : "none";
        }

        if (key === "premoveMode") {
            return ["every", "capture", "filter"].includes(rawValue) ? rawValue : "capture";
        }

        if (key === "humanLevel") {
            return ELO_LEVELS[rawValue] ? rawValue : "intermediate";
        }

        if (key === "resignMode") {
            return rawValue === "cp" ? "cp" : "mate";
        }

        if (key === "highlightColor1" || key === "highlightColor2" || key === "bestmoveArrowColor") {
            return /^#[0-9a-fA-F]{6}$/.test(String(rawValue)) ? String(rawValue) : defaultValue;
        }

        if (typeof defaultValue === "boolean") {
            return !!rawValue;
        }

        if (typeof defaultValue === "number") {
            const n = Number(rawValue);
            if (!Number.isFinite(n)) return defaultValue;
            const limits = SETTING_NUMBER_LIMITS[key];
            if (!limits) return n;
            return clamp(n, limits[0], limits[1]);
        }

        if (typeof defaultValue === "string") {
            return String(rawValue || "");
        }

        return rawValue;
    }

    function normalizeLoadedSettings() {
        Object.keys(PERSISTED_SETTING_DEFAULTS).forEach(function (key) {
            const sanitized = sanitizeSettingValue(key, State[key]);
            if (JSON.stringify(sanitized) !== JSON.stringify(State[key])) {
                State[key] = sanitized;
                GM_setValue(key, sanitized);
            }
        });

        if (State.clockSyncMinDelay > State.clockSyncMaxDelay) {
            const temp = State.clockSyncMinDelay;
            State.clockSyncMinDelay = State.clockSyncMaxDelay;
            State.clockSyncMaxDelay = temp;
            GM_setValue("clockSyncMinDelay", State.clockSyncMinDelay);
            GM_setValue("clockSyncMaxDelay", State.clockSyncMaxDelay);
        }

        if (State.minDelay > State.maxDelay) {
            const temp = State.minDelay;
            State.minDelay = State.maxDelay;
            State.maxDelay = temp;
            GM_setValue("minDelay", State.minDelay);
            GM_setValue("maxDelay", State.maxDelay);
        }

        if (State.minDelayTwo > State.maxDelayTwo) {
            const temp = State.minDelayTwo;
            State.minDelayTwo = State.maxDelayTwo;
            State.maxDelayTwo = temp;
            GM_setValue("minDelayTwo", State.minDelayTwo);
            GM_setValue("maxDelayTwo", State.maxDelayTwo);
        }
    }

    normalizeLoadedSettings();

// =====================================================
// Section 08: Cache Variables
// =====================================================
let predictedFenCache = new Map();
let premoveSafetyCache = new Map();
let cachedGame = null;
let cachedGameTimestamp = 0;
let GAME_CACHE_TTL = 100;
let lastFenProcessedMain = "";
let lastFenProcessedPremove = "";
let lastPremoveFen = "";
let lastPremoveUci = "";
let premoveInFlight = false;
let pendingMoveTimeoutId = null;
let _resignObserver = null;
let _resignTimeout = null;
let _resignTriggerCount = 0;
let _resignTriggerNeeded = 3;
let ATTACK_CACHE = Object.create(null);
let stockfishSourceCode = "";
let _allLoopsActive = true;
let _premoveCacheClearInterval = null;
let _panelHotkeysBound = false;

// Store event listener references for cleanup
let _eventListeners = [];
let _loopTimeoutIds = new Set();

function scheduleManagedTimeout(fn, delay) {
    let id = null;
    id = setTimeout(function () {
        _loopTimeoutIds.delete(id);
        fn();
    }, delay);
    _loopTimeoutIds.add(id);
    return id;
}

function clearManagedTimeouts() {
    _loopTimeoutIds.forEach(function (id) {
        clearTimeout(id);
    });
    _loopTimeoutIds.clear();
}

// Cleanup function for event listeners
function cleanupEventListeners() {
    if (_eventListeners && _eventListeners.length > 0) {
        _eventListeners.forEach(function (listener) {
            try {
                listener.element.removeEventListener(listener.type, listener.handler, listener.options || false);
            } catch (e) {
                // Ignore cleanup errors
            }
        });
        _eventListeners = [];
    }
}

let RuntimeGuard = {
    loopPerf: Object.create(null),
    lastPerfLogTs: 0,
    lastCacheAlertTs: 0,
    lastSoakLogTs: 0,
    premoveStuckSince: 0,
    mainStuckSince: 0,
    analysisStuckSince: 0,
    premoveHealCount: 0,
    mainHealCount: 0,
    analysisHealCount: 0,

    _nowMs: function () {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
            return performance.now();
        }
        return Date.now();
    },

    trackLoop: function (name, startTs) {
        const elapsed = this._nowMs() - startTs;
        let stat = this.loopPerf[name];
        if (!stat) {
            stat = { count: 0, total: 0, max: 0 };
            this.loopPerf[name] = stat;
        }

        stat.count++;
        stat.total += elapsed;
        if (elapsed > stat.max) stat.max = elapsed;

        if (elapsed > 120) {
            warn("[Perf] Slow loop:", name, Math.round(elapsed) + "ms");
        }

        const now = Date.now();
        if (stat.count % 120 === 0 && now - this.lastPerfLogTs > 30000) {
            const avg = stat.total / Math.max(1, stat.count);
            log("[Perf]", name, "avg=" + avg.toFixed(1) + "ms", "max=" + stat.max.toFixed(1) + "ms", "runs=" + stat.count);
            this.lastPerfLogTs = now;
        }
    },

    checkCachePressure: function () {
        const issues = [];

        if (predictedFenCache.size > 40) {
            issues.push("predictedFenCache=" + predictedFenCache.size);
            trimCaches();
        }
        if (premoveSafetyCache.size > 40) {
            issues.push("premoveSafetyCache=" + premoveSafetyCache.size);
            trimCaches();
        }
        if (Engine && Engine._premoveProcessedFens && Engine._premoveProcessedFens.size > 25) {
            issues.push("premoveProcessed=" + Engine._premoveProcessedFens.size);
            const keep = 12;
            const arr = Array.from(Engine._premoveProcessedFens);
            Engine._premoveProcessedFens = new Set(arr.slice(-keep));
        }
        if (CCTAnalyzer && CCTAnalyzer.cache && CCTAnalyzer.cache.size > 260) {
            issues.push("cctCache=" + CCTAnalyzer.cache.size);
            CCTAnalyzer.clearCache();
        }
        if (ThreatDetectionSystem && ThreatDetectionSystem.cache && ThreatDetectionSystem.cache.size > 260) {
            issues.push("threatCache=" + ThreatDetectionSystem.cache.size);
            ThreatDetectionSystem.clearCache();
        }

        if (issues.length > 0) {
            const now = Date.now();
            if (now - this.lastCacheAlertTs > 10000) {
                warn("[Watchdog] Cache pressure:", issues.join(", "));
                this.lastCacheAlertTs = now;
            }
        }
    },

    checkPremoveWatchdog: function () {
        if (!State.premoveEnabled || State.analysisMode) {
            this.premoveStuckSince = 0;
            return;
        }

        const active = !!(Engine._premoveEngineBusy || Engine._premoveProcessing || State.premoveAnalysisInProgress);
        if (!active) {
            this.premoveStuckSince = 0;
            return;
        }

        const now = Date.now();
        const lastActivity = Engine._premoveLastActivityTs || 0;
        if (!lastActivity) {
            Engine._premoveLastActivityTs = now;
            return;
        }

        const timeoutMs = (CONFIG.PREMOVE.ENGINE_TIMEOUT || 8000) + 3000;
        if (now - lastActivity < timeoutMs) {
            this.premoveStuckSince = 0;
            return;
        }

        if (!this.premoveStuckSince) {
            this.premoveStuckSince = now;
            return;
        }

        if (now - this.premoveStuckSince < 1500) {
            return;
        }

        this.premoveHealCount++;
        warn("[Watchdog] Premove stuck detected. Healing worker...");
        if (Engine && typeof Engine.selfHealPremove === "function") {
            Engine.selfHealPremove("watchdog-timeout");
        }
        this.premoveStuckSince = 0;
    },

    checkEngineWatchdog: function () {
        const now = Date.now();

        const mainActive = !!(Engine && Engine.main && Engine._ready && State.isThinking && !State.analysisMode);
        if (!mainActive) {
            this.mainStuckSince = 0;
        } else {
            const mainLast = Engine._mainLastActivityTs || 0;
            if (mainLast && now - mainLast > 12000) {
                if (!this.mainStuckSince) {
                    this.mainStuckSince = now;
                } else if (now - this.mainStuckSince > 1500) {
                    this.mainHealCount++;
                    warn("[Watchdog] Main engine stuck detected. Healing worker...");
                    if (typeof Engine.selfHealMain === "function") {
                        Engine.selfHealMain("watchdog-timeout");
                    }
                    this.mainStuckSince = 0;
                }
            } else {
                this.mainStuckSince = 0;
            }
        }

        const analysisActive = !!(Engine && Engine.analysis && State.analysisMode && State.isAnalysisThinking);
        if (!analysisActive) {
            this.analysisStuckSince = 0;
        } else {
            const analysisLast = Engine._analysisLastActivityTs || 0;
            if (analysisLast && now - analysisLast > 12000) {
                if (!this.analysisStuckSince) {
                    this.analysisStuckSince = now;
                } else if (now - this.analysisStuckSince > 1500) {
                    this.analysisHealCount++;
                    warn("[Watchdog] Analysis engine stuck detected. Healing worker...");
                    if (typeof Engine.selfHealAnalysis === "function") {
                        Engine.selfHealAnalysis("watchdog-timeout");
                    }
                    this.analysisStuckSince = 0;
                }
            } else {
                this.analysisStuckSince = 0;
            }
        }
    },

    logSoakSummary: function () {
        const now = Date.now();
        if (now - this.lastSoakLogTs < 60000) return;

        this.lastSoakLogTs = now;
        const loops = Object.keys(this.loopPerf).map((k) => {
            const p = this.loopPerf[k];
            const avg = p && p.count ? (p.total / p.count).toFixed(1) : "0.0";
            return k + ":" + avg + "ms";
        }).join(" | ");

        log(
            "[Soak]",
            "caches PF=" + predictedFenCache.size +
            " PS=" + premoveSafetyCache.size +
            " CCT=" + (CCTAnalyzer && CCTAnalyzer.cache ? CCTAnalyzer.cache.size : 0) +
            " TH=" + (ThreatDetectionSystem && ThreatDetectionSystem.cache ? ThreatDetectionSystem.cache.size : 0),
            "heals P=" + this.premoveHealCount +
            " M=" + this.mainHealCount +
            " A=" + this.analysisHealCount,
            loops
        );
    },

    getSnapshot: function () {
        return {
            loops: this.loopPerf,
            premoveHealCount: this.premoveHealCount,
            mainHealCount: this.mainHealCount,
            analysisHealCount: this.analysisHealCount
        };
    }
};

// =====================================================
// Section 09: Advanced Smart Premove (v4.0, Fully Fixed)
// =====================================================
const SmartPremove = {

    lastSafeMoves: [],
    moveHistory: [],
    executedFens: new Set(),

    executionLock: false,
    processingLock: false,

    lastExecutionTime: 0,
    consecutiveErrors: 0,
    patternBreakCounter: 0,

    MAX_EXECUTED_FENS: 15,
    MAX_HISTORY: 20,
    MAX_CONSECUTIVE_ERRORS: 3,
    MIN_EXECUTION_INTERVAL: 200,
    ERROR_COOLDOWN: 5000,

    RISK_MULTIPLIERS: {
        SAFE_THRESHOLD: 10,
        BLOCK_THRESHOLD: 15,
        PIECE_HANGING: 10,
        BAD_TRADE: 5,
        RISK_LEVEL_DIVISOR: 5
    },

    PATTERN_DETECTION: {
        MIN_MOVES: 5,
        VARIANCE_THRESHOLD: 0.1,
        ACCURACY_THRESHOLD: 0.95,
        VARIANCE_WEIGHT: 40,
        ACCURACY_WEIGHT: 60
    },

    AGGRESSION_CONFIG: {

        every: {
            minConfidence: 8,
            riskTolerance: 70,
            tacticalBonus: 22,
            allowSpeculative: true
        },

        capture: {
            minConfidence: 35,
            riskTolerance: 15,
            tacticalBonus: 8,
            allowSpeculative: false
        },

        filter: {
            minConfidence: 25,
            riskTolerance: 30,
            tacticalBonus: 12,
            allowSpeculative: true
        }
    },

    resetExecutionTracking() {
        this.executedFens.clear();
        this.executionLock = false;
        this.processingLock = false;
        this.consecutiveErrors = 0;
        this.patternBreakCounter = 0;
        this.moveHistory = [];
        this.lastSafeMoves = [];
        this.lastExecutionTime = 0;
    },

    isInErrorCooldown() {
        if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            const timeSinceLastError = Date.now() - this.lastExecutionTime;
            if (timeSinceLastError < this.ERROR_COOLDOWN) {
                return true;
            }
            this.consecutiveErrors = 0;
        }
        return false;
    },

    detectPattern() {
        if (this.moveHistory.length < this.PATTERN_DETECTION.MIN_MOVES) {
            return null;
        }

        const last = this.moveHistory.slice(-this.PATTERN_DETECTION.MIN_MOVES);
        const variance = this._timeVariance(last);
        const accuracy = this._engineAccuracy(last);

        const isTooConsistent =
              variance < this.PATTERN_DETECTION.VARIANCE_THRESHOLD &&
              accuracy > this.PATTERN_DETECTION.ACCURACY_THRESHOLD;

        const riskLevel = Math.min(
            100,
            variance * this.PATTERN_DETECTION.VARIANCE_WEIGHT +
            accuracy * this.PATTERN_DETECTION.ACCURACY_WEIGHT
        );

        return {
            isTooConsistent,
            riskLevel,
            variance,
            accuracy,
            moveCount: last.length
        };
    },

    _timeVariance(moves) {
        if (!moves || moves.length === 0) return 0;

        const times = moves.map(m => m.timeSpent);
        const mean = times.reduce((a, b) => a + b, 0) / times.length;

        if (mean === 0) return 0;

        const variance = times.reduce((s, t) => s + (t - mean) ** 2, 0) / times.length;
        return Math.sqrt(variance) / mean;
    },

    _engineAccuracy(moves) {
        if (!moves || moves.length === 0) return 0;
        const engineMoves = moves.filter(m => m.wasEngineMove).length;
        return engineMoves / moves.length;
    },

    analyzeTacticalMotifs(fen, uci, ourColor) {
        if (!fen || !uci || uci.length < 4) {
            return { score: 0, isBlunder: false, isBrilliant: false, details: [] };
        }

        if (!ourColor || (ourColor !== "w" && ourColor !== "b")) {
            return { score: 0, isBlunder: false, isBrilliant: false, details: [] };
        }

        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);

        const newFen = makeSimpleMove(fen, from, to);
        if (!newFen) {
            return { score: 0, isBlunder: false, isBrilliant: false, details: [] };
        }

        const motifs = {
            score: 0,
            isBlunder: false,
            isBrilliant: false,
            details: []
        };

        const oppColor = ourColor === "w" ? "b" : "w";

        const oppKing = findKing(newFen, oppColor);
        if (oppKing && isSquareAttackedBy(newFen, oppKing, ourColor)) {
            if (isCheckmate(newFen, oppColor)) {
                motifs.score += 1000;
                motifs.isBrilliant = true;
                motifs.details.push("Checkmate");
            } else {
                motifs.score += 8;
                motifs.details.push("Check");
            }
        }

        const hanging = this._findHangingPieces(newFen, oppColor);
        if (hanging.length > 0) {
            const value = hanging.reduce((s, p) => s + (PIECE_VALUES[p.type] || 0), 0);
            motifs.score += value;
            motifs.details.push(`Hanging pieces (${value})`);
        }

        return motifs;
    },

    _findHangingPieces(fen, color) {
        if (!fen || !color) return [];

        const pieces = getAllPieces(fen, color);
        const opp = color === "w" ? "b" : "w";
        const result = [];

        for (const p of pieces) {
            if (p.type === "k") continue;

            const attackers = getAttackersOfSquare(fen, p.square, opp);
            const defenders = getAttackersOfSquare(fen, p.square, color);

            if (!attackers.length) continue;

            const minAtk = Math.min(...attackers.map(a => PIECE_VALUES[a.piece] || 99));
            const val = PIECE_VALUES[p.type] || 0;

            if (!defenders.length || minAtk < val) {
                result.push(p);
            }
        }

        return result;
    },

    analyzeSafety(fen, uci, ourColor, config) {
        if (!fen || !uci || uci.length < 4) {
            return { safe: false, riskScore: 999, warnings: ["Invalid input"] };
        }

        if (!ourColor || (ourColor !== "w" && ourColor !== "b")) {
            return { safe: false, riskScore: 999, warnings: ["Invalid color"] };
        }

        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);

        const newFen = makeSimpleMove(fen, from, to);
        if (!newFen) {
            return { safe: false, riskScore: 999, warnings: ["Invalid move"] };
        }

        const oppColor = ourColor === "w" ? "b" : "w";
        const piece = pieceFromFenChar(fenCharAtSquare(fen, from));

        if (!piece) {
            return { safe: false, riskScore: 999, warnings: ["No piece found"] };
        }

        let riskScore = 0;
        const warnings = [];

        const attackers = getAttackersOfSquare(newFen, to, oppColor);
        const defenders = getAttackersOfSquare(newFen, to, ourColor);

        if (attackers.length > 0) {
            const pieceVal = PIECE_VALUES[piece.type] || 0;
            const minAtk = Math.min(...attackers.map(a => PIECE_VALUES[a.piece] || 99));

            if (!defenders.length) {

                riskScore += pieceVal * this.RISK_MULTIPLIERS.PIECE_HANGING;
                warnings.push("Piece will hang");
            } else if (minAtk < pieceVal) {

                riskScore += (pieceVal - minAtk) * this.RISK_MULTIPLIERS.BAD_TRADE;
                warnings.push("Unfavorable trade");
            }
        }

        const king = findKing(newFen, ourColor);
        if (king && isSquareAttackedBy(newFen, king, oppColor)) {
            return {
                safe: false,
                riskScore: 1000,
                warnings: ["King exposed to check"],
                riskLevel: 100
            };
        }

        const safeThreshold = config.riskTolerance * this.RISK_MULTIPLIERS.SAFE_THRESHOLD;
        const safe = riskScore <= safeThreshold;

        return {
            safe,
            riskScore,
            warnings,
            riskLevel: Math.min(100, riskScore / this.RISK_MULTIPLIERS.RISK_LEVEL_DIVISOR)
        };
    },

    calculateConfidence(scoreInfo, tactical, safety, config) {
        let score = 50;

        if (scoreInfo) {
            if (scoreInfo.type === "mate") {

                score += scoreInfo.value < 0 ? 40 : -30;
            } else {
                const evalCp = scoreInfo.value / 100;

                if (evalCp > 3) score += 25;
                else if (evalCp > 1) score += 15;
                else if (evalCp > -0.5) score += 5;
                else score -= 10;
            }
        }

        if (tactical.score > 0) {
            score += Math.min(config.tacticalBonus, tactical.score);
        }

        if (tactical.isBrilliant) {
            score += 10;
        }

        if (safety.riskScore > 0) {
            score -= Math.min(30, safety.riskScore / 10);
        }

        return Math.max(5, Math.min(95, score));
    },

    shouldPremove(fen, uci, pvMoves, scoreInfo) {

        if (this.executionLock || this.processingLock) {
            return { allowed: false, reason: "System locked" };
        }

        if (this.isInErrorCooldown()) {
            return { allowed: false, reason: "Error cooldown active" };
        }

        const ourColor = getPlayingAs();
        if (!ourColor) {
            return { allowed: false, reason: "Unknown color" };
        }

        const fenHash = hashFen(fen);
        if (this.executedFens.has(fenHash)) {
            return { allowed: false, reason: "Position already executed" };
        }

        const config = this.AGGRESSION_CONFIG[State.premoveMode] || this.AGGRESSION_CONFIG.every;
        const isEveryMode = State.premoveMode === "every";

        const tactical = this.analyzeTacticalMotifs(fen, uci, ourColor);

        const safety = this.analyzeSafety(fen, uci, ourColor, config);

        const riskToleranceBoost = isEveryMode ? 1.8 : 1;
        const riskBlockThreshold = config.riskTolerance * this.RISK_MULTIPLIERS.BLOCK_THRESHOLD * riskToleranceBoost;
        if (!safety.safe && safety.riskScore > riskBlockThreshold) {
            return {
                allowed: false,
                reason: "Too risky",
                riskScore: safety.riskScore,
                threshold: riskBlockThreshold
            };
        }

        let confidence = this.calculateConfidence(scoreInfo, tactical, safety, config);
        if (isEveryMode) {
            // Make every-move mode intentionally more aggressive.
            confidence = Math.min(98, confidence + 12);
        }

        if (confidence < config.minConfidence) {
            return {
                allowed: false,
                reason: "Low confidence",
                confidence,
                required: config.minConfidence
            };
        }

        const pattern = this.detectPattern();
        if (pattern && pattern.isTooConsistent && !isEveryMode) {

            const randomThreshold = 70 + Math.random() * 20;
            if (confidence < randomThreshold && !tactical.isBrilliant) {
                this.patternBreakCounter++;
                return {
                    allowed: false,
                    reason: "Pattern break (humanization)",
                    pattern
                };
            }
        }

        if (!tactical.isBrilliant) {
            const roll = Math.random() * 100;
            const rollBuffer = isEveryMode ? 18 : 0;
            if (roll > confidence + rollBuffer) {
                return {
                    allowed: false,
                    reason: "Probability roll failed (humanization)",
                    confidence,
                    roll: Math.round(roll)
                };
            }
        }

        return {
            allowed: true,
            confidence,
            tactical,
            safety,
            pattern
        };
    },

    async execute(fen, uci, decision) {

        if (!decision || !decision.allowed) {
            return false;
        }

        const now = Date.now();

        if (now - this.lastExecutionTime < this.MIN_EXECUTION_INTERVAL) {
            return false;
        }

        if (this.executionLock) {
            return false;
        }
        this.executionLock = true;
        this.processingLock = true;

        try {

            const fenHash = hashFen(fen);
            if (this.executedFens.has(fenHash)) {
                return false;
            }

            this.executedFens.add(fenHash);

            if (this.executedFens.size > this.MAX_EXECUTED_FENS) {
                const arr = [...this.executedFens];
                const keepCount = Math.floor(this.MAX_EXECUTED_FENS * 0.7);
                this.executedFens = new Set(arr.slice(-keepCount));
            }

            const delay = this._humanDelay(State.premoveDelayMs || 250);
            await sleep(delay);

            const from = uci.slice(0, 2);
            const to = uci.slice(2, 4);
            const promotion = uci.length > 4 ? uci.slice(4) : null;

            const ok = await MoveExecutor._clickMove(from, to, promotion);

            if (ok) {

                this.consecutiveErrors = 0;

                this.moveHistory.push({
                    move: uci,
                    timeSpent: delay,
                    wasEngineMove: true,
                    timestamp: Date.now(),
                    confidence: decision.confidence
                });

                if (this.moveHistory.length > this.MAX_HISTORY) {
                    this.moveHistory = this.moveHistory.slice(-this.MAX_HISTORY);
                }

                this.lastSafeMoves.push({
                    fen,
                    uci,
                    timestamp: Date.now()
                });

                if (this.lastSafeMoves.length > 10) {
                    this.lastSafeMoves.shift();
                }
            } else {

                this.consecutiveErrors++;
            }

            return ok;

        } catch (e) {
            console.error("SmartPremove execution error:", e);
            this.consecutiveErrors++;
            return false;

        } finally {

            this.executionLock = false;
            this.processingLock = false;
            this.lastExecutionTime = Date.now();
        }
    },

    _humanDelay(base) {

        const jitter = 1 + (Math.random() * 0.4 - 0.2);
        const delay = base * jitter;

        return Math.min(1000, Math.max(50, delay));
    },

    getStats() {
        const pattern = this.detectPattern();

        return {
            executedPositions: this.executedFens.size,
            moveHistory: this.moveHistory.length,
            consecutiveErrors: this.consecutiveErrors,
            patternBreaks: this.patternBreakCounter,
            isLocked: this.executionLock || this.processingLock,
            inCooldown: this.isInErrorCooldown(),
            pattern: pattern,
            lastExecutionTime: this.lastExecutionTime,
            recentMoves: this.moveHistory.slice(-5)
        };
    }

};

// =====================================================
// Section 10: Board and Game State Functions
// =====================================================
function getBoardElement() {
    return $("wc-chess-board") || $("chess-board") || $(".board");
}

function getGameController() {
    let board = getBoardElement();
    if (!board) return null;
    if (board.game) return board.game;
    if (board._game) return board._game;
    try {
        let ctrl = unsafeWindow && unsafeWindow.chesscom && unsafeWindow.chesscom.game;
        if (ctrl) return ctrl;
    } catch (e) { }
    return null;
}

function getGameHistory() {
    let gc = getGameController();
    if (!gc) return [];
    try {
        // Chess.com standard log
        let log = (typeof gc.getLog === "function") ? gc.getLog() : (gc.log || []);
        if (Array.isArray(log)) {
            return log.map(m => m.uci || m.move?.uci).filter(m => !!m);
        }
    } catch (e) {
        warn("Error getting history:", e);
    }
    return [];
}

function getGame() {
    let now = Date.now();
    if (cachedGame && (now - cachedGameTimestamp) < GAME_CACHE_TTL) {
        try {
            if (typeof cachedGame.getFEN === "function") {
                cachedGame.getFEN();
                return cachedGame;
            }
        } catch (e) {
            cachedGame = null;
        }
    }
    cachedGame = getGameController();
    cachedGameTimestamp = now;
    return cachedGame;
}

function normalizeSide(val) {
    if (val === 1 || val === "w" || val === "white") return "w";
    if (val === 2 || val === "b" || val === "black") return "b";
    return null;
}

function getPlayingAs(game) {
    let g = game || getGameController();
    if (!g) return null;
    try {
        if (typeof g.getPlayingAs === "function") return normalizeSide(g.getPlayingAs());
    } catch (e) { }
    return null;
}

function getPlayingAsColor() {
    let side = getPlayingAs();
    return side === "b" ? "black" : "white";
}

function isPlayersTurn(game) {
    let g = game || getGame();
    if (!g) return false;
    try {
        let turn, playingAs;
        if (typeof g.getTurn === "function") turn = g.getTurn();
        if (typeof g.getPlayingAs === "function") playingAs = g.getPlayingAs();
        let normTurn = normalizeSide(turn);
        let normPlaying = normalizeSide(playingAs);
        if (normTurn !== null && normPlaying !== null) return normTurn === normPlaying;
    } catch (e) { }
    return false;
}

function isBoardFlipped() {
    let board = getBoardElement();
    if (!board) return false;
    return board.classList.contains("flipped") || board.getAttribute("data-flipped") === "true";
}

function getAccurateFen() {
    let game = getGameController();
    if (game) {
        try {
            if (typeof game.getFEN === "function") return game.getFEN();
            if (typeof game.fen === "function") return game.fen();
            if (game.fen && typeof game.fen === "string") return game.fen;
        } catch (e) { }
    }
    return buildFenFromDOM();
}

function hashFen(fen) {
    if (!fen || typeof fen !== "string") return "";
    return fen.split(' ').slice(0, 6).join(' ');
}

function normalizeFen(fen) {
    if (!fen) return "";
    let parts = fen.split(" ");
    return parts.slice(0, 4).join(" ");
}

function getCurrentTurn(fen) {
    if (!fen) return "w";
    let parts = fen.split(" ");
    return parts.length > 1 ? parts[1] : "w";
}

function updateMoveNumber(fen) {
    if (!fen) return;
    let parts = fen.split(" ");
    if (parts.length >= 6) {
        State.moveNumber = parseInt(parts[5], 10) || 1;
    }
}

function saveSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(State, key)) return;
    const sanitized = sanitizeSettingValue(key, value);
    State[key] = sanitized;
    GM_setValue(key, sanitized);
}

// =====================================================
// Section 11: FEN Construction from DOM
// =====================================================
function buildFenFromDOM() {
    let board = getBoardElement();
    if (!board) return null;
    let grid = [];
    let r, c;
    for (r = 0; r < 8; r++) {
        grid[r] = [];
        for (c = 0; c < 8; c++) {
            grid[r][c] = null;
        }
    }
    let pieces = $$(".piece", board);
    if (pieces.length === 0) return null;

    pieces.forEach(function (piece) {
        let classes = piece.className.split(/\s+/);
        let pieceType = null;
        let squareStr = null;
        for (let i = 0; i < classes.length; i++) {
            if (PIECE_CHAR[classes[i]]) pieceType = PIECE_CHAR[classes[i]];
            if (/^square-\d{2,}$/.test(classes[i])) squareStr = classes[i].replace("square-", "");
        }
        if (pieceType && squareStr) {
            let file = parseInt(squareStr.charAt(0)) - 1;
            let rank = parseInt(squareStr.charAt(1)) - 1;
            if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
                grid[7 - rank][file] = pieceType;
            }
        }
    });

    let fenRows = [];
    for (r = 0; r < 8; r++) {
        let row = "";
        let empty = 0;
        for (c = 0; c < 8; c++) {
            if (grid[r][c]) {
                if (empty > 0) {
                    row += empty;
                    empty = 0;
                }
                row += grid[r][c];
            } else {
                empty++;
            }
        }
        if (empty > 0) row += empty;
        fenRows.push(row);
    }

    let turn = "w";
    let moveList = $$(".move-node, .move, [data-ply]");
    if (moveList.length > 0) turn = moveList.length % 2 === 0 ? "w" : "b";

    let castling = "";
    if (grid[7][4] === "K" && grid[7][7] === "R") castling += "K";
    if (grid[7][4] === "K" && grid[7][0] === "R") castling += "Q";
    if (grid[0][4] === "k" && grid[0][7] === "r") castling += "k";
    if (grid[0][4] === "k" && grid[0][0] === "r") castling += "q";
    if (!castling) castling = "-";

    return fenRows.join("/") + " " + turn + " " + castling + " - 0 1";
}

// =====================================================
// Section 12: FEN and Piece Manipulation
// =====================================================
function fenCharAtSquare(fen, square) {
    if (!fen || !square) return null;
    let placement = fen.split(" ")[0];
    let ranks = placement.split("/");
    let file = "abcdefgh".indexOf(square[0]);
    let rankNum = parseInt(square[1], 10);
    if (file < 0 || rankNum < 1 || rankNum > 8 || ranks.length !== 8) return null;
    let row = 8 - rankNum;
    let rowStr = ranks[row];
    let col = 0;
    for (let i = 0; i < rowStr.length; i++) {
        let ch = rowStr[i];
        if (/\d/.test(ch)) {
            col += parseInt(ch, 10);
            if (col > file) return null;
        } else {
            if (col === file) return ch;
            col++;
        }
    }
    return null;
}

function pieceFromFenChar(ch) {
    if (!ch) return null;
    let isUpper = ch === ch.toUpperCase();
    return {
        color: isUpper ? "w" : "b",
        type: ch.toLowerCase()
    };
}

function findKing(fen, color) {
    let placement = fen.split(" ")[0];
    let ranks = placement.split("/");
    let kingChar = color === "w" ? "K" : "k";
    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
        let rank = 8 - rankIdx;
        let file = 0;
        for (let i = 0; i < ranks[rankIdx].length; i++) {
            let ch = ranks[rankIdx][i];
            if (/\d/.test(ch)) {
                file += parseInt(ch, 10);
            } else {
                if (ch === kingChar) return "abcdefgh"[file] + rank;
                file++;
            }
        }
    }
    return null;
}

function isEnPassantCapture(fen, from, to, ourColor) {
    let parts = fen.split(" ");
    let ep = parts[3];
    let fromPiece = pieceFromFenChar(fenCharAtSquare(fen, from));
    if (!fromPiece || fromPiece.color !== ourColor || fromPiece.type !== "p") return false;
    return ep && ep !== "-" && to === ep && from[0] !== to[0];
}

function makeSimpleMove(fen, from, to, promotion) {
    if (!fen || !from || !to) return fen;
    try {
        let parts = fen.split(" ");
        let ranks = parts[0].split("/");
        let fromFile = from.charCodeAt(0) - 97;
        let fromRank = 8 - parseInt(from[1], 10);
        let toFile = to.charCodeAt(0) - 97;
        let toRank = 8 - parseInt(to[1], 10);

        if (fromFile < 0 || fromFile > 7 || toFile < 0 || toFile > 7 ||
            fromRank < 0 || fromRank > 7 || toRank < 0 || toRank > 7) return fen;

        let expand = function (r) {
            return r.replace(/\d/g, function (d) {
                return ".".repeat(+d);
            });
        };
        let compress = function (r) {
            return r.replace(/\.{1,8}/g, function (m) {
                return "" + m.length;
            });
        };

        let board = ranks.map(function (r) {
            return expand(r).split("");
        });
        let piece = board[fromRank][fromFile];
        if (!piece || piece === ".") return fen;

        let isPawn = piece.toLowerCase() === "p";
        let isKing = piece.toLowerCase() === "k";
        let isCapture = board[toRank][toFile] !== ".";

        if (isPawn && parts[3] && parts[3] !== "-" && to === parts[3]) {
            let epRank = piece === "P" ? toRank + 1 : toRank - 1;
            if (epRank >= 0 && epRank < 8) {
                board[epRank][toFile] = ".";
                isCapture = true;
            }
        }

        board[fromRank][fromFile] = ".";

        if (isPawn && (toRank === 0 || toRank === 7)) {
            let promoChar = promotion || "q";
            board[toRank][toFile] = piece === piece.toUpperCase() ? promoChar.toUpperCase() : promoChar.toLowerCase();
        } else {
            board[toRank][toFile] = piece;
        }

        if (isKing && Math.abs(fromFile - toFile) === 2) {
            let rookFromFile = toFile > fromFile ? 7 : 0;
            let rookToFile = toFile > fromFile ? toFile - 1 : toFile + 1;
            board[toRank][rookToFile] = board[toRank][rookFromFile];
            board[toRank][rookFromFile] = ".";
        }

        parts[0] = board.map(function (r) {
            return compress(r.join(""));
        }).join("/");

        let currentSide = parts[1] || "w";
        parts[1] = currentSide === "w" ? "b" : "w";

        let castling = parts[2] || "-";
        if (castling !== "-") {
            if (isKing) {
                if (piece === 'K') castling = castling.replace(/[KQ]/g, '');
                else castling = castling.replace(/[kq]/g, '');
            }
            if (from === 'a1' || to === 'a1') castling = castling.replace('Q', '');
            if (from === 'h1' || to === 'h1') castling = castling.replace('K', '');
            if (from === 'a8' || to === 'a8') castling = castling.replace('q', '');
            if (from === 'h8' || to === 'h8') castling = castling.replace('k', '');
            if (castling === '') castling = '-';
        }
        parts[2] = castling;

        if (isPawn && Math.abs(fromRank - toRank) === 2) {
            let epRankNum = 8 - ((fromRank + toRank) / 2);
            parts[3] = "abcdefgh"[fromFile] + epRankNum;
        } else {
            parts[3] = "-";
        }

        let halfmove = parseInt(parts[4] || "0", 10);
        if (isPawn || isCapture) halfmove = 0;
        else halfmove++;
        parts[4] = "" + halfmove;

        if (parts[1] === "w") {
            parts[5] = "" + (parseInt(parts[5] || "1", 10) + 1);
        }

        return parts.join(" ");
    } catch (e) {
        return fen;
    }
}

function getPredictedFen(fen, pvMoves) {
    if (!pvMoves || pvMoves.length === 0) return fen;
    let predictedFen = fen;
    let oppMove = pvMoves[0];
    if (oppMove && oppMove.length >= 4) {
        let oppFrom = oppMove.substring(0, 2);
        let oppTo = oppMove.substring(2, 4);
        let oppPromo = oppMove.length > 4 ? oppMove[4] : null;
        predictedFen = makeSimpleMove(predictedFen, oppFrom, oppTo, oppPromo);
    }
    return predictedFen;
}

// =====================================================
// Section 13: Attack and Threat Detection
// =====================================================
function getAttackersOfSquare(fen, targetSquare, attackerColor) {
    let attackers = [];
    let tFile = "abcdefgh".indexOf(targetSquare[0]);
    let tRank = parseInt(targetSquare[1], 10);
    if (tFile < 0 || tRank < 1 || tRank > 8) return attackers;

    let checkSquare = function (file, rank, pieceTypes) {
        if (file < 0 || file > 7 || rank < 1 || rank > 8) return;
        let sq = "abcdefgh"[file] + rank;
        let ch = fenCharAtSquare(fen, sq);
        let p = pieceFromFenChar(ch);
        if (p && p.color === attackerColor && pieceTypes.includes(p.type)) {
            attackers.push({ square: sq, piece: p.type });
        }
    };

    let pawnDir = attackerColor === "w" ? 1 : -1;
    checkSquare(tFile - 1, tRank - pawnDir, ["p"]);
    checkSquare(tFile + 1, tRank - pawnDir, ["p"]);

    let knightMoves = [
        [2, 1],
        [2, -1],
        [-2, 1],
        [-2, -1],
        [1, 2],
        [1, -2],
        [-1, 2],
        [-1, -2]
    ];
    knightMoves.forEach(function (m) {
        checkSquare(tFile + m[0], tRank + m[1], ["n"]);
    });

    for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
            if (df === 0 && dr === 0) continue;
            checkSquare(tFile + df, tRank + dr, ["k"]);
        }
    }

    let directions = [
        { dx: 1, dy: 0, pieces: ["r", "q"] }, { dx: -1, dy: 0, pieces: ["r", "q"] },
        { dx: 0, dy: 1, pieces: ["r", "q"] }, { dx: 0, dy: -1, pieces: ["r", "q"] },
        { dx: 1, dy: 1, pieces: ["b", "q"] }, { dx: 1, dy: -1, pieces: ["b", "q"] },
        { dx: -1, dy: 1, pieces: ["b", "q"] }, { dx: -1, dy: -1, pieces: ["b", "q"] }
    ];

    directions.forEach(function (dir) {
        let f = tFile + dir.dx;
        let r = tRank + dir.dy;
        while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
            let sq = "abcdefgh"[f] + r;
            let ch = fenCharAtSquare(fen, sq);
            if (ch) {
                let p = pieceFromFenChar(ch);
                if (p && p.color === attackerColor && dir.pieces.includes(p.type)) {
                    attackers.push({ square: sq, piece: p.type });
                }
                break;
            }
            f += dir.dx;
            r += dir.dy;
        }
    });

    return attackers;
}

function isSquareAttackedBy(fen, square, attackerColor) {
    return getAttackersOfSquare(fen, square, attackerColor).length > 0;
}

function isCheckmate(fen, colorInCheck) {
    let kingPos = findKing(fen, colorInCheck);
    if (!kingPos) return false;
    let oppColor = colorInCheck === "w" ? "b" : "w";
    if (!isSquareAttackedBy(fen, kingPos, oppColor)) return false;

    let kf = "abcdefgh".indexOf(kingPos[0]);
    let kr = parseInt(kingPos[1]);

    for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
            if (df === 0 && dr === 0) continue;
            let nf = kf + df,
                nr = kr + dr;
            if (nf < 0 || nf > 7 || nr < 1 || nr > 8) continue;

            let sq = "abcdefgh"[nf] + nr;
            let ch = fenCharAtSquare(fen, sq);
            let piece = pieceFromFenChar(ch);

            if (piece && piece.color === colorInCheck) continue;

            let testFen = makeSimpleMove(fen, kingPos, sq);
            let newKingPos = sq;

            if (!isSquareAttackedBy(testFen, newKingPos, oppColor)) {
                return false;
            }
        }
    }
    return true;
}

function movesGivesCheck(fen, uci, ourColor) {
    let from = uci.substring(0, 2);
    let to = uci.substring(2, 4);
    let promo = uci.length > 4 ? uci[4] : null;
    let newFen = makeSimpleMove(fen, from, to, promo);
    let oppColor = ourColor === "w" ? "b" : "w";
    let oppKingPos = findKing(newFen, oppColor);
    if (!oppKingPos) return false;
    return isSquareAttackedBy(newFen, oppKingPos, ourColor);
}

// =====================================================
// Section 14: Premove Safety Check
// =====================================================

const PremoveSafety = {

    cache: new Map(),
    CACHE_DURATION: 1000,

    RISK: {
        CRITICAL: 100,
        VERY_HIGH: 80,
        HIGH: 60,
        MEDIUM: 40,
        LOW: 20,
        SAFE: 0
    },

    PIECE_RISK: {
        q: 10,
        r: 8,
        b: 5,
        n: 5,
        p: 3
    },

    check(fen, uci, ourColor) {

        if (!fen || !uci || uci.length < 4) {
            return this._createResult(false, "Invalid move", this.RISK.CRITICAL, null);
        }

        const cacheKey = `${fen}|${uci}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.result;
        }

        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const oppColor = ourColor === "w" ? "b" : "w";

        const movingCh = fenCharAtSquare(fen, from);
        const movingPiece = pieceFromFenChar(movingCh);

        if (!movingPiece || movingPiece.color !== ourColor) {
            return this._createResult(false, "Not our piece", this.RISK.CRITICAL, null);
        }

        const newFen = makeSimpleMove(fen, from, to);
        if (!newFen) {
            return this._createResult(false, "Invalid move", this.RISK.CRITICAL, null);
        }

        const ourKingPos = findKing(newFen, ourColor);
        if (ourKingPos && isSquareAttackedBy(newFen, ourKingPos, oppColor)) {
            return this._createResult(false, "Exposes king to check", this.RISK.CRITICAL, null);
        }

        const oppKingPos = findKing(newFen, oppColor);
        const givesCheck = oppKingPos && isSquareAttackedBy(newFen, oppKingPos, ourColor);

        if (givesCheck && isCheckmate(newFen, oppColor)) {
            return this._createResult(true, "Checkmate!", this.RISK.SAFE, null);
        }

        const cct = State.cctAnalysisEnabled
            ? analyzeCCT(fen, uci, ourColor)
            : null;

        const analysis = this._analyzeSafety(fen, newFen, from, to, movingPiece, ourColor, oppColor, givesCheck, cct);

        const result = this._createResult(
            analysis.safe,
            analysis.reasons.join(", ") || (analysis.safe ? "Safe" : "Risky"),
            analysis.riskLevel,
            cct
        );

        this.cache.set(cacheKey, {
            result: result,
            timestamp: Date.now()
        });

        if (this.cache.size > 100) {
            const entries = [...this.cache.entries()];
            const cutoff = Date.now() - this.CACHE_DURATION;
            entries.forEach(([key, value]) => {
                if (value.timestamp < cutoff) {
                    this.cache.delete(key);
                }
            });
        }

        return result;
    },

    _analyzeSafety(fen, newFen, from, to, movingPiece, ourColor, oppColor, givesCheck, cct) {
        let riskLevel = 0;
        const reasons = [];
        const destCh = fenCharAtSquare(fen, to);
        const destPiece = pieceFromFenChar(destCh);

        if (cct && cct.givesCheck) {
            if (cct.checkIsSafe) {
                reasons.push("✓ Safe check");
                riskLevel -= 15;
            } else {
                reasons.push("⚠ Check (may be recaptured)");
                riskLevel -= 5;
            }
        }

        if (cct && cct.captureAnalysis) {
            const netGain = cct.captureAnalysis.netMaterialGain;

            if (netGain < 0) {
                const lossPenalty = givesCheck ? 8 : 12;
                reasons.push(`✗ Loses material: ${netGain}`);
                riskLevel += Math.abs(netGain) * lossPenalty;
            } else if (netGain > 0) {
                reasons.push(`✓ Wins material: +${netGain}`);
                riskLevel -= netGain * 3;
            }

            if (cct.captureAnalysis.ourPieceHanging && !destPiece) {
                if (!givesCheck) {
                    const pieceValue = PIECE_VALUES[movingPiece.type] || 0;
                    riskLevel += 25 + (pieceValue * 5);
                    reasons.push(`✗ Piece hanging (${movingPiece.type})`);
                } else {
                    reasons.push("⚠ Piece exposed but gives check");
                    riskLevel += 10;
                }
            }
        }

        if (cct && cct.threats) {

            if (cct.threats.created && cct.threats.created.length > 0) {
                const majorThreats = cct.threats.created.filter(t => t.severity === 'high');
                if (majorThreats.length > 0) {
                    reasons.push(`✓ Creates ${majorThreats.length} major threat(s)`);
                    riskLevel -= 8 * Math.min(majorThreats.length, 2);
                }
            }

            if (cct.threats.weFallInto && cct.threats.weFallInto.length > 0) {
                const highThreats = cct.threats.weFallInto.filter(t => t.severity === 'high');
                const mediumThreats = cct.threats.weFallInto.filter(t => t.severity === 'medium');

                if (highThreats.length > 0) {
                    if (!givesCheck) {
                        reasons.push(`✗ Falls into ${highThreats.length} HIGH threat(s)`);
                        riskLevel += 50 * highThreats.length;
                    } else {
                        reasons.push(`⚠ HIGH threats but gives check`);
                        riskLevel += 20 * highThreats.length;
                    }
                }

                if (mediumThreats.length > 0 && !givesCheck) {
                    reasons.push(`⚠ Falls into ${mediumThreats.length} medium threat(s)`);
                    riskLevel += 20 * mediumThreats.length;
                }
            }
        }

        if (movingPiece.type === "k") {
            if (isSquareAttackedBy(fen, to, oppColor)) {
                reasons.push("✗ CRITICAL: King into check");
                riskLevel = this.RISK.CRITICAL;
            }
        }

        if (movingPiece.type !== "k") {
            const ourKingPos = findKing(fen, ourColor);
            if (ourKingPos && isPiecePinned(fen, from, ourKingPos, ourColor, oppColor)) {
                reasons.push("✗ Piece is PINNED to king");
                riskLevel += 70;

                if (!givesCheck) {
                    reasons.push("✗ CRITICAL: Illegal move");
                    riskLevel = this.RISK.CRITICAL;
                }
            }
        }

        if (movingPiece.type === "q") {
            const queenRisk = this._analyzeQueenRisk(newFen, to, oppColor, ourColor, destPiece, givesCheck, cct);
            riskLevel += queenRisk.risk;
            reasons.push(...queenRisk.reasons);
        }

        if (movingPiece.type === "r") {
            const rookRisk = this._analyzeRookRisk(newFen, to, oppColor, ourColor, destPiece, givesCheck, cct);
            riskLevel += rookRisk.risk;
            reasons.push(...rookRisk.reasons);
        }

        if (movingPiece.type === "p") {
            const pawnBonus = this._analyzePawnAdvancement(to, ourColor, cct);
            riskLevel += pawnBonus.risk;
            reasons.push(...pawnBonus.reasons);
        }

        if (!destPiece && !givesCheck) {
            const hangingRisk = this._analyzeHangingPiece(newFen, to, oppColor, ourColor, movingPiece, cct);
            riskLevel += hangingRisk.risk;
            reasons.push(...hangingRisk.reasons);
        }

        riskLevel = Math.max(-25, Math.min(100, riskLevel));
        const safe = riskLevel < 30;

        return {
            safe,
            riskLevel: Math.max(0, riskLevel),
            reasons
        };
    },

    _analyzeQueenRisk(newFen, to, oppColor, ourColor, destPiece, givesCheck, cct) {
        let risk = 0;
        const reasons = [];

        const attackers = getAttackersOfSquare(newFen, to, oppColor);
        const defenders = getAttackersOfSquare(newFen, to, ourColor);

        if (attackers.length > 0 && !destPiece) {

            if (cct && cct.threats && cct.threats.weFallInto) {
                const queenTrapped = cct.threats.weFallInto.some(t => t.type === 'queen_trapped');
                if (queenTrapped) {
                    if (!givesCheck) {
                        reasons.push("✗ QUEEN TRAP!");
                        risk = 95;
                    } else {
                        reasons.push("⚠ Queen may be trapped but gives check");
                        risk += 40;
                    }
                    return { risk, reasons };
                }
            }

            if (!givesCheck) {
                const exchangePenalty = defenders.length === 0 ? 60 : 45;
                risk += exchangePenalty + (attackers.length * 15);

                const hasCounterplay = cct && cct.threats && cct.threats.created && cct.threats.created.length > 0;
                if (!hasCounterplay) {
                    reasons.push("✗ Undefended QUEEN - HIGH RISK!");
                } else {
                    reasons.push("⚠ Undefended queen but has counterplay");
                }
            } else if (defenders.length === 0) {
                risk += 35;
                reasons.push("⚠ Queen undefended but gives check");
            } else {
                risk += 20;
                reasons.push("⚠ Queen exposed but defended & checks");
            }

            if (attackers.some(a => a.piece === 'r')) {
                risk += 25;
                reasons.push("⚠ Queen exposed to enemy rook");
            }
        }

        return { risk, reasons };
    },

    _analyzeRookRisk(newFen, to, oppColor, ourColor, destPiece, givesCheck, cct) {
        let risk = 0;
        const reasons = [];

        const attackers = getAttackersOfSquare(newFen, to, oppColor);
        const defenders = getAttackersOfSquare(newFen, to, ourColor);

        if (attackers.length > 0) {
            const captureValue = destPiece ? PIECE_VALUES[destPiece.type] : 0;

            if (cct && cct.captureAnalysis && cct.captureAnalysis.exchangeResult < 0) {
                if (!givesCheck) {
                    risk += 50;
                    reasons.push("✗ Bad exchange for rook");
                } else {
                    risk += 25;
                    reasons.push("⚠ Rook exchange but gives check");
                }
            }

            if (defenders.length === 0) {
                risk += 40;
                reasons.push(`✗ Rook UNDEFENDED (${attackers.length} attackers)`);
            } else if (captureValue < 5) {
                const hasCounterplay = cct && cct.threats && cct.threats.created && cct.threats.created.length > 0;
                if (!hasCounterplay && !givesCheck) {
                    risk += 40;
                    reasons.push("✗ Rook exposed without compensation");
                }
            }
        }

        return { risk, reasons };
    },

    _analyzePawnAdvancement(to, ourColor, cct) {
        let risk = 0;
        const reasons = [];

        const promoRank = ourColor === "w" ? 8 : 1;
        const currentRank = parseInt(to[1]);
        const distanceToPromo = Math.abs(currentRank - promoRank);

        if (currentRank === promoRank) {
            reasons.push("✓ Promotes!");
            risk -= 20;
            return { risk, reasons };
        }

        if (distanceToPromo <= 2) {
            if (cct && cct.threats && cct.threats.created) {
                const hasPromoThreat = cct.threats.created.some(t => t.type === 'promotion_threat');
                if (hasPromoThreat) {
                    reasons.push("✓ Promotion threat");
                    risk -= 15;
                }
            }
        }

        return { risk, reasons };
    },

    _analyzeHangingPiece(newFen, to, oppColor, ourColor, movingPiece, cct) {
        let risk = 0;
        const reasons = [];

        const attackers = getAttackersOfSquare(newFen, to, oppColor);
        const defenders = getAttackersOfSquare(newFen, to, ourColor);

        if (attackers.length > 0) {
            if (defenders.length === 0) {
                const pieceCoefficient = this.PIECE_RISK[movingPiece.type] || 5;
                risk += 20 + (attackers.length * pieceCoefficient);

                const hasCounterplay = cct && cct.threats && cct.threats.created && cct.threats.created.length > 0;
                if (!hasCounterplay) {
                    reasons.push(`✗ Undefended ${movingPiece.type.toUpperCase()} - HIGH RISK!`);
                } else {
                    reasons.push(`⚠ Undefended ${movingPiece.type.toUpperCase()} but has counterplay`);
                }
            } else if (defenders.length === 1 && attackers.length >= 2) {
                risk += 20;
                reasons.push("⚠ Piece may be captured in exchange");
            }
        }

        return { risk, reasons };
    },

    _createResult(safe, reason, riskLevel, cct) {
        return {
            safe: safe,
            reason: reason,
            riskLevel: Math.max(0, Math.min(100, riskLevel)),
            cct: cct
        };
    },

    clearCache() {
        this.cache.clear();
    }

};

function checkPremoveSafety(fen, uci, ourColor) {
    return PremoveSafety.check(fen, uci, ourColor);
}

// =====================================================
// Section 15: Checks, Captures, and Threats Analysis
// =====================================================

const CCTAnalyzer = {

    cache: new Map(),
    CACHE_DURATION: 1000,

    analyze(fen, uci, ourColor) {

        if (!fen || !uci || uci.length < 4 || !ourColor) {
            return this._createEmptyResult();
        }

        const cacheKey = `${fen}|${uci}|${ourColor}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
            return cached.result;
        }

        const from = uci.substring(0, 2);
        const to = uci.substring(2, 4);
        const oppColor = ourColor === "w" ? "b" : "w";

        const movingCh = fenCharAtSquare(fen, from);
        const movingPiece = pieceFromFenChar(movingCh);

        if (!movingPiece || movingPiece.color !== ourColor) {
            return this._createEmptyResult();
        }

        const capturedCh = fenCharAtSquare(fen, to);
        const capturedPiece = pieceFromFenChar(capturedCh);

        const newFen = makeSimpleMove(fen, from, to);
        if (!newFen) {
            return this._createEmptyResult();
        }

        const result = {
            givesCheck: false,
            checkIsSafe: false,
            captureAnalysis: null,
            threats: { created: [], weFallInto: [], prevented: [] }
        };

        const oppKingPos = findKing(newFen, oppColor);
        if (oppKingPos) {
            result.givesCheck = isSquareAttackedBy(newFen, oppKingPos, ourColor);
            if (result.givesCheck) {
                result.checkIsSafe = this._isSafeCheck(fen, newFen, from, to, movingPiece, oppColor);
            }
        }

        result.captureAnalysis = this._analyzeCaptures(
            fen, newFen, from, to, movingPiece, capturedPiece, oppColor
        );

        result.threats = this._analyzeThreats(
            fen, newFen, from, to, movingPiece, capturedPiece, ourColor, oppColor
        );

        this.cache.set(cacheKey, {
            result: result,
            timestamp: Date.now()
        });

        if (this.cache.size > 300) {
            const cutoff = Date.now() - this.CACHE_DURATION;
            for (const [k, v] of this.cache.entries()) {
                if (v.timestamp < cutoff) {
                    this.cache.delete(k);
                }
            }

            if (this.cache.size > 250) {
                const overflow = this.cache.size - 250;
                const keys = Array.from(this.cache.keys()).slice(0, overflow);
                keys.forEach((k) => this.cache.delete(k));
            }
        }

        return result;
    },

    _isSafeCheck(oldFen, newFen, from, to, movingPiece, oppColor) {
        const attackers = getAttackersOfSquare(newFen, to, oppColor);

        if (attackers.length === 0) return true;

        const ourValue = PIECE_VALUES[movingPiece.type] || 0;

        let minAttackerValue = Infinity;
        attackers.forEach(a => {
            const v = PIECE_VALUES[a.piece] || 0;
            if (v < minAttackerValue) {
                minAttackerValue = v;
            }
        });

        return minAttackerValue >= ourValue;
    },

    _analyzeCaptures(oldFen, newFen, from, to, movingPiece, capturedPiece, oppColor) {
        const result = {
            isCapture: !!capturedPiece,
            capturedValue: capturedPiece ? (PIECE_VALUES[capturedPiece.type] || 0) : 0,
            ourPieceHanging: false,
            exchangeResult: 0,
            netMaterialGain: 0
        };

        const ourPieceValue = PIECE_VALUES[movingPiece.type] || 0;

        const newAttackers = getAttackersOfSquare(newFen, to, oppColor);
        const newDefenders = getAttackersOfSquare(newFen, to, movingPiece.color);

        if (newAttackers.length > 0) {

            result.ourPieceHanging = newDefenders.length === 0;

            const attackerValues = newAttackers.map(a => PIECE_VALUES[a.piece] || 0);
            const lowestAttacker = Math.min(...attackerValues);

            if (result.isCapture) {

                if (result.ourPieceHanging) {

                    result.netMaterialGain = result.capturedValue - ourPieceValue;
                } else {

                    if (lowestAttacker < ourPieceValue) {

                        result.netMaterialGain = result.capturedValue - ourPieceValue;
                    } else {

                        result.netMaterialGain = result.capturedValue - (newDefenders.length > 0 ? 0 : ourPieceValue);
                    }
                }
            } else {

                if (result.ourPieceHanging) {
                    result.netMaterialGain = -ourPieceValue;
                }
            }
        } else {

            result.netMaterialGain = result.capturedValue;
        }

        result.exchangeResult = result.netMaterialGain;
        return result;
    },

    _analyzeThreats(oldFen, newFen, from, to, movingPiece, capturedPiece, ourColor, oppColor) {
        const threats = {
            created: [],
            weFallInto: [],
            prevented: []
        };

        const forks = this._detectForks(newFen, to, movingPiece.type, ourColor, oppColor);
        threats.created.push(...forks);

        const discovered = this._detectDiscoveredAttack(oldFen, newFen, from, to, ourColor, oppColor);
        if (discovered) {
            threats.created.push(discovered);
        }

        const pin = this._detectPinPotential(newFen, to, movingPiece.type, ourColor, oppColor);
        if (pin) {
            threats.created.push(pin);
        }

        if (movingPiece.type === 'p') {
            const promoThreat = this._detectPromotionThreat(to, ourColor);
            if (promoThreat) {
                threats.created.push(promoThreat);
            }
        }

        const backRank = this._detectBackRankThreat(newFen, movingPiece.type, ourColor, oppColor);
        if (backRank) {
            threats.created.push(backRank);
        }

        const oppForks = this._detectOpponentForks(newFen, ourColor, oppColor);
        threats.weFallInto.push(...oppForks);

        if (movingPiece.type === 'q') {
            const queenTrap = this._detectQueenTrap(newFen, to, ourColor, oppColor);
            if (queenTrap) {
                threats.weFallInto.push(queenTrap);
            }
        }

        const leftBehind = this._detectLeftBehind(oldFen, newFen, from, ourColor, oppColor);
        threats.weFallInto.push(...leftBehind);

        const oppPins = this._detectOpponentPins(newFen, ourColor, oppColor);
        threats.weFallInto.push(...oppPins);

        const prevented = this._detectPreventedThreats(oldFen, newFen, from, to, ourColor, oppColor);
        threats.prevented.push(...prevented);

        return threats;
    },

    _detectForks(fen, square, pieceType, ourColor, oppColor) {
        const forks = [];

        const attacked = this._getAttackedPieces(fen, square, ourColor, oppColor);

        if (attacked.length >= 2) {

            const totalValue = attacked.reduce((sum, p) => sum + (PIECE_VALUES[p.type] || 0), 0);

            const hasKing = attacked.some(p => p.type === 'k');
            const hasQueen = attacked.some(p => p.type === 'q');

            const severity = hasKing ? 'high' : (hasQueen || totalValue >= 8) ? 'high' : 'medium';

            forks.push({
                type: 'fork',
                severity: severity,
                targets: attacked.map(p => p.square),
                value: totalValue,
                description: `Fork attacking ${attacked.length} pieces (value: ${totalValue})`
            });
        }

        return forks;
    },

    _detectDiscoveredAttack(oldFen, newFen, from, to, ourColor, oppColor) {

        const longRangePieces = getAllPieces(oldFen, ourColor).filter(p =>
            p.type === 'q' || p.type === 'r' || p.type === 'b'
        );

        for (const piece of longRangePieces) {
            if (piece.square === from) continue;

            const attackedBefore = this._getAttackedSquares(oldFen, piece.square, piece.type, ourColor);
            const attackedAfter = this._getAttackedSquares(newFen, piece.square, piece.type, ourColor);

            const newlyAttacked = attackedAfter.filter(sq => !attackedBefore.includes(sq));

            for (const sq of newlyAttacked) {
                const targetPiece = pieceFromFenChar(fenCharAtSquare(newFen, sq));
                if (targetPiece && targetPiece.color === oppColor) {
                    const value = PIECE_VALUES[targetPiece.type] || 0;

                    return {
                        type: 'discovered_attack',
                        severity: value >= 5 ? 'high' : 'medium',
                        target: sq,
                        attacker: piece.square,
                        value: value,
                        description: `Discovered attack on ${targetPiece.type} at ${sq}`
                    };
                }
            }
        }

        return null;
    },

    _detectPinPotential(fen, square, pieceType, ourColor, oppColor) {

        if (!['q', 'r', 'b'].includes(pieceType)) return null;

        const directions = this._getPieceDirections(pieceType);
        const oppKing = findKing(fen, oppColor);
        if (!oppKing) return null;

        for (const dir of directions) {
            const ray = this._castRay(fen, square, dir);

            if (ray.length >= 2) {
                const lastSquare = ray[ray.length - 1];
                if (lastSquare === oppKing && ray.length === 2) {
                    const pinnedSquare = ray[0];
                    const pinnedPiece = pieceFromFenChar(fenCharAtSquare(fen, pinnedSquare));

                    if (pinnedPiece && pinnedPiece.color === oppColor) {
                        return {
                            type: 'pin',
                            severity: 'medium',
                            target: pinnedSquare,
                            description: `Pinning ${pinnedPiece.type} to king`
                        };
                    }
                }
            }
        }

        return null;
    },

    _detectPromotionThreat(to, ourColor) {
        const promoRank = ourColor === "w" ? 8 : 1;
        const currentRank = parseInt(to[1]);
        const distance = Math.abs(currentRank - promoRank);

        if (distance <= 2) {
            return {
                type: 'promotion_threat',
                severity: distance === 1 ? 'high' : 'medium',
                distance: distance,
                description: `Pawn ${distance} square(s) from promotion`
            };
        }

        return null;
    },

    _detectBackRankThreat(fen, pieceType, ourColor, oppColor) {
        if (pieceType !== 'r' && pieceType !== 'q') return null;

        const backRank = oppColor === "w" ? "1" : "8";
        const oppKing = findKing(fen, oppColor);

        if (oppKing && oppKing[1] === backRank) {

            const escape = this._canKingEscape(fen, oppKing, oppColor);
            if (!escape) {
                return {
                    type: 'back_rank',
                    severity: 'high',
                    description: 'Back rank mate threat'
                };
            }
        }

        return null;
    },

    _detectOpponentForks(fen, ourColor, oppColor) {
        const forks = [];
        const oppPieces = getAllPieces(fen, oppColor);

        for (const piece of oppPieces) {
            const attacked = this._getAttackedPieces(fen, piece.square, oppColor, ourColor);

            if (attacked.length >= 2) {
                const hasKing = attacked.some(p => p.type === 'k');
                const hasQueen = attacked.some(p => p.type === 'q');
                const totalValue = attacked.reduce((sum, p) => sum + (PIECE_VALUES[p.type] || 0), 0);

                forks.push({
                    type: 'opponent_fork',
                    severity: hasKing ? 'high' : (hasQueen || totalValue >= 8) ? 'high' : 'medium',
                    attacker: piece.square,
                    targets: attacked.map(p => p.square),
                    description: `Opponent ${piece.type} forks ${attacked.length} pieces`
                });
            }
        }

        return forks;
    },

    _detectQueenTrap(fen, queenSquare, ourColor, oppColor) {

        const queenMoves = this._getQueenMoves(fen, queenSquare, ourColor);

        const safeSquares = queenMoves.filter(sq => {
            const testFen = makeSimpleMove(fen, queenSquare, sq);
            return !isSquareAttackedBy(testFen, sq, oppColor);
        });

        if (safeSquares.length <= 2) {
            return {
                type: 'queen_trapped',
                severity: 'high',
                escapeSquares: safeSquares.length,
                description: `Queen has only ${safeSquares.length} safe escape(s)`
            };
        }

        return null;
    },

    _detectLeftBehind(oldFen, newFen, from, ourColor, oppColor) {
        const threats = [];
        const ourPieces = getAllPieces(newFen, ourColor);

        for (const piece of ourPieces) {
            if (piece.square === from) continue;

            const wasDefended = getAttackersOfSquare(oldFen, piece.square, ourColor).length > 0;
            const isDefendedNow = getAttackersOfSquare(newFen, piece.square, ourColor).length > 0;
            const isAttacked = getAttackersOfSquare(newFen, piece.square, oppColor).length > 0;

            if (wasDefended && !isDefendedNow && isAttacked) {
                const value = PIECE_VALUES[piece.type] || 0;

                threats.push({
                    type: 'undefended_piece',
                    severity: value >= 5 ? 'high' : 'medium',
                    square: piece.square,
                    pieceType: piece.type,
                    value: value,
                    description: `${piece.type} at ${piece.square} left undefended`
                });
            }
        }

        return threats;
    },

    _detectOpponentPins(fen, ourColor, oppColor) {
        const pins = [];
        const ourKing = findKing(fen, ourColor);
        if (!ourKing) return pins;

        const oppLongRange = getAllPieces(fen, oppColor).filter(p =>
            p.type === 'q' || p.type === 'r' || p.type === 'b'
        );

        for (const piece of oppLongRange) {
            const directions = this._getPieceDirections(piece.type);

            for (const dir of directions) {
                const ray = this._castRay(fen, piece.square, dir);

                if (ray.length >= 2 && ray[ray.length - 1] === ourKing) {
                    const pinnedSquare = ray[0];
                    const pinnedPiece = pieceFromFenChar(fenCharAtSquare(fen, pinnedSquare));

                    if (pinnedPiece && pinnedPiece.color === ourColor) {
                        pins.push({
                            type: 'opponent_pin',
                            severity: 'medium',
                            pinnedPiece: pinnedSquare,
                            description: `Our ${pinnedPiece.type} pinned by opponent ${piece.type}`
                        });
                    }
                }
            }
        }

        return pins;
    },

    _detectPreventedThreats(oldFen, newFen, from, to, ourColor, oppColor) {
        const prevented = [];

        const capturedPiece = pieceFromFenChar(fenCharAtSquare(oldFen, to));
        if (capturedPiece && capturedPiece.color === oppColor) {
            const threats = this._getPieceThreats(oldFen, to, oppColor, ourColor);
            if (threats.length > 0) {
                prevented.push({
                    type: 'threat_removed',
                    severity: 'medium',
                    description: `Removed threatening ${capturedPiece.type}`
                });
            }
        }

        const blocked = this._detectBlockedAttack(oldFen, newFen, to, ourColor, oppColor);
        if (blocked) {
            prevented.push(blocked);
        }

        return prevented;
    },

    _getAttackedPieces(fen, square, attackerColor, defenderColor) {
        const attacked = [];
        const moves = this._getPossibleMoves(fen, square, attackerColor);

        for (const move of moves) {
            const piece = pieceFromFenChar(fenCharAtSquare(fen, move));
            if (piece && piece.color === defenderColor) {
                attacked.push({ square: move, type: piece.type });
            }
        }

        return attacked;
    },

    _getAttackedSquares(fen, square, pieceType, color) {

        return this._getPossibleMoves(fen, square, color);
    },

    _getPossibleMoves(fen, square, color) {

        const piece = pieceFromFenChar(fenCharAtSquare(fen, square));
        if (!piece) return [];

        const allSquares = [];
        for (let file = 0; file < 8; file++) {
            for (let rank = 1; rank <= 8; rank++) {
                const sq = "abcdefgh"[file] + rank;
                allSquares.push(sq);
            }
        }

        return allSquares.filter(sq => {
            const testFen = makeSimpleMove(fen, square, sq);
            return testFen !== fen;
        });
    },

    _getPieceDirections(pieceType) {
        switch (pieceType) {
            case 'q': return [[1,0], [-1,0], [0,1], [0,-1], [1,1], [1,-1], [-1,1], [-1,-1]];
            case 'r': return [[1,0], [-1,0], [0,1], [0,-1]];
            case 'b': return [[1,1], [1,-1], [-1,1], [-1,-1]];
            default: return [];
        }
    },

    _castRay(fen, square, direction) {
        const ray = [];
        const [dx, dy] = direction;
        let file = "abcdefgh".indexOf(square[0]);
        let rank = parseInt(square[1]);

        while (true) {
            file += dx;
            rank += dy;

            if (file < 0 || file > 7 || rank < 1 || rank > 8) break;

            const sq = "abcdefgh"[file] + rank;
            const piece = fenCharAtSquare(fen, sq);

            ray.push(sq);

            if (piece && piece !== '.') break;
        }

        return ray;
    },

    _canKingEscape(fen, kingSquare, color) {
        const kingMoves = this._getKingMoves(kingSquare);
        const oppColor = color === "w" ? "b" : "w";

        for (const move of kingMoves) {
            const piece = fenCharAtSquare(fen, move);
            const pieceObj = pieceFromFenChar(piece);

            if (pieceObj && pieceObj.color === color) continue;

            const testFen = makeSimpleMove(fen, kingSquare, move);
            if (!isSquareAttackedBy(testFen, move, oppColor)) {
                return true;
            }
        }

        return false;
    },

    _getKingMoves(square) {
        const moves = [];
        const file = "abcdefgh".indexOf(square[0]);
        const rank = parseInt(square[1]);

        const offsets = [
            [-1,-1], [-1,0], [-1,1],
            [0,-1], [0,1],
            [1,-1], [1,0], [1,1]
        ];

        for (const [dx, dy] of offsets) {
            const newFile = file + dx;
            const newRank = rank + dy;

            if (newFile >= 0 && newFile <= 7 && newRank >= 1 && newRank <= 8) {
                moves.push("abcdefgh"[newFile] + newRank);
            }
        }

        return moves;
    },

    _getQueenMoves(fen, square, color) {

        const moves = [];
        const directions = this._getPieceDirections('q');

        for (const dir of directions) {
            const ray = this._castRay(fen, square, dir);
            moves.push(...ray);
        }

        return moves;
    },

    _getPieceThreats(fen, square, pieceColor, targetColor) {
        const attacked = this._getAttackedPieces(fen, square, pieceColor, targetColor);
        return attacked.filter(p => (PIECE_VALUES[p.type] || 0) >= 3);
    },

    _detectBlockedAttack(oldFen, newFen, blockSquare, ourColor, oppColor) {

        const oppLongRange = getAllPieces(oldFen, oppColor).filter(p =>
            p.type === 'q' || p.type === 'r' || p.type === 'b'
        );

        for (const piece of oppLongRange) {
            const directions = this._getPieceDirections(piece.type);

            for (const dir of directions) {
                const rayBefore = this._castRay(oldFen, piece.square, dir);
                const rayAfter = this._castRay(newFen, piece.square, dir);

                if (rayAfter.includes(blockSquare) && rayBefore.length > rayAfter.length) {
                    return {
                        type: 'blocked_attack',
                        severity: 'medium',
                        description: `Blocked ${piece.type} attack`
                    };
                }
            }
        }

        return null;
    },

    _createEmptyResult() {
        return {
            givesCheck: false,
            checkIsSafe: false,
            captureAnalysis: {
                isCapture: false,
                capturedValue: 0,
                ourPieceHanging: false,
                exchangeResult: 0,
                netMaterialGain: 0
            },
            threats: { created: [], weFallInto: [], prevented: [] }
        };
    },

    clearCache() {
        this.cache.clear();
    }

};

function analyzeCCT(fen, uci, ourColor) {
    return CCTAnalyzer.analyze(fen, uci, ourColor);
}

function isSafeCheck(oldFen, newFen, uci, ourColor) {
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const movingPiece = pieceFromFenChar(fenCharAtSquare(oldFen, from));
    const oppColor = ourColor === "w" ? "b" : "w";

    return CCTAnalyzer._isSafeCheck(oldFen, newFen, from, to, movingPiece, oppColor);
}

function analyzeCaptures(oldFen, newFen, uci, ourColor, capturedPiece) {
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const movingPiece = pieceFromFenChar(fenCharAtSquare(oldFen, from));
    const oppColor = ourColor === "w" ? "b" : "w";

    return CCTAnalyzer._analyzeCaptures(oldFen, newFen, from, to, movingPiece, capturedPiece, oppColor);
}

function analyzeThreats(oldFen, newFen, uci, ourColor, movingPiece, capturedPiece) {
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const oppColor = ourColor === "w" ? "b" : "w";

    return CCTAnalyzer._analyzeThreats(oldFen, newFen, from, to, movingPiece, capturedPiece, ourColor, oppColor);
}

// =====================================================
// Section 16: Threat Detection Functions
// =====================================================

const ThreatDetectionSystem = {

    cache: new Map(),
    CACHE_TTL: 1000,

    detectForks(fen, square, pieceType, ourColor) {
        const cacheKey = `fork|${fen}|${square}|${pieceType}|${ourColor}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const oppColor = ourColor === "w" ? "b" : "w";
        const threats = [];

        if (!['n', 'q', 'p', 'b', 'r', 'k'].includes(pieceType)) {
            return this._setCache(cacheKey, threats);
        }

        const attackSquares = getSquaresAttackedByPiece(fen, square, pieceType, ourColor);
        const attackedPieces = [];

        for (const sq of attackSquares) {
            const ch = fenCharAtSquare(fen, sq);
            const piece = pieceFromFenChar(ch);

            if (piece && piece.color === oppColor) {
                const value = PIECE_VALUES[piece.type] || 0;

                if (value >= 3 || piece.type === 'k') {
                    attackedPieces.push({
                        square: sq,
                        type: piece.type,
                        value: value
                    });
                }
            }
        }

        if (attackedPieces.length >= 2) {
            const totalValue = attackedPieces.reduce((sum, p) => sum + p.value, 0);
            const hasKing = attackedPieces.some(p => p.type === 'k');
            const hasQueen = attackedPieces.some(p => p.type === 'q');

            threats.push({
                type: 'fork',
                severity: hasKing ? 'high' : (hasQueen || totalValue >= 10 ? 'high' : 'medium'),
                attacker: pieceType,
                attackerSquare: square,
                targets: attackedPieces,
                totalValue: totalValue,
                description: `${pieceType.toUpperCase()} fork on ${attackedPieces.map(p => p.type.toUpperCase()).join(" and ")}`
            });
        }

        return this._setCache(cacheKey, threats);
    },

    detectDiscoveredAttack(oldFen, newFen, from, to, ourColor) {
        const cacheKey = `disco|${oldFen}|${from}|${to}`;
        const cached = this._getCache(cacheKey);
        if (cached !== undefined) return cached;

        const oppColor = ourColor === "w" ? "b" : "w";
        const ourPieces = getAllPieces(newFen, ourColor);
        const oppPieces = getAllPieces(newFen, oppColor);

        const longRangePieces = ourPieces.filter(p =>
            ['q', 'r', 'b'].includes(p.type) && p.square !== to
        );

        const valuablePieces = oppPieces.filter(p =>
            (PIECE_VALUES[p.type] || 0) >= 5 || p.type === 'k'
        );

        for (const ourPiece of longRangePieces) {
            for (const oppPiece of valuablePieces) {
                if (canPieceAttackSquare(newFen, ourPiece, oppPiece.square)) {
                    if (wasBlocked(oldFen, from, ourPiece.square, oppPiece.square)) {
                        const result = {
                            type: 'discovered_attack',
                            severity: oppPiece.type === 'k' ? 'high' : 'medium',
                            attacker: ourPiece.type,
                            attackerSquare: ourPiece.square,
                            target: oppPiece.type,
                            targetSquare: oppPiece.square,
                            value: PIECE_VALUES[oppPiece.type] || 0,
                            description: `Discovered attack: ${ourPiece.type.toUpperCase()} → ${oppPiece.type.toUpperCase()}`
                        };
                        return this._setCache(cacheKey, result);
                    }
                }
            }
        }

        return this._setCache(cacheKey, null);
    },

    detectPinPotential(fen, square, pieceType, ourColor) {
        const cacheKey = `pin|${fen}|${square}|${pieceType}`;
        const cached = this._getCache(cacheKey);
        if (cached !== undefined) return cached;

        if (!['q', 'r', 'b'].includes(pieceType)) {
            return this._setCache(cacheKey, null);
        }

        const oppColor = ourColor === "w" ? "b" : "w";
        const oppKing = findKing(fen, oppColor);
        if (!oppKing) return this._setCache(cacheKey, null);

        const directions = this._getPinDirections(pieceType);
        const [tFile, tRank] = this._parseSquare(square);

        for (const dir of directions) {
            let f = tFile + dir.dx;
            let r = tRank + dir.dy;
            const piecesInLine = [];

            while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
                const sq = "abcdefgh"[f] + r;
                const ch = fenCharAtSquare(fen, sq);

                if (ch && ch !== '.') {
                    const piece = pieceFromFenChar(ch);
                    if (!piece) break;

                    piecesInLine.push({ square: sq, piece: piece });

                    if (piecesInLine.length === 2) {
                        const [first, second] = piecesInLine;

                        if (first.piece.color === oppColor &&
                            second.piece.color === oppColor &&
                            second.piece.type === 'k' &&
                            (PIECE_VALUES[first.piece.type] || 0) >= 3) {

                            const result = {
                                type: 'pin',
                                severity: 'medium',
                                pinner: pieceType,
                                pinnerSquare: square,
                                pinnedPiece: first.piece.type,
                                pinnedSquare: first.square,
                                description: `${pieceType.toUpperCase()} pins ${first.piece.type.toUpperCase()} to king`
                            };
                            return this._setCache(cacheKey, result);
                        }
                        break;
                    }
                }
                f += dir.dx;
                r += dir.dy;
            }
        }

        return this._setCache(cacheKey, null);
    },

    detectOpponentForks(fen, ourColor) {
        const cacheKey = `oppfork|${fen}|${ourColor}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const oppColor = ourColor === "w" ? "b" : "w";
        const threats = [];

        const oppPieces = getAllPieces(fen, oppColor);

        for (const oppPiece of oppPieces) {

            if (oppPiece.type === 'p') continue;

            const attacked = getSquaresAttackedByPiece(fen, oppPiece.square, oppPiece.type, oppColor);
            const ourAttackedPieces = [];

            for (const sq of attacked) {
                const ch = fenCharAtSquare(fen, sq);
                const piece = pieceFromFenChar(ch);

                if (piece && piece.color === ourColor) {
                    const value = PIECE_VALUES[piece.type] || 0;
                    if (value >= 1) {
                        ourAttackedPieces.push({
                            square: sq,
                            type: piece.type,
                            value: value
                        });
                    }
                }
            }

            if (ourAttackedPieces.length >= 2) {
                const totalValue = ourAttackedPieces.reduce((sum, p) => sum + p.value, 0);
                const hasKing = ourAttackedPieces.some(p => p.type === 'k');
                const hasQueen = ourAttackedPieces.some(p => p.type === 'q');

                threats.push({
                    type: 'opponent_fork',
                    severity: hasKing ? 'high' : (hasQueen || totalValue >= 10 ? 'high' : 'medium'),
                    attacker: oppPiece.type,
                    attackerSquare: oppPiece.square,
                    targets: ourAttackedPieces,
                    totalValue: totalValue,
                    description: `Opponent ${oppPiece.type.toUpperCase()} forks ${ourAttackedPieces.map(p => p.type.toUpperCase()).join(" and ")}`
                });
            }
        }

        const ourPieces = getAllPieces(fen, ourColor);
        for (const ourPiece of ourPieces) {
            const value = PIECE_VALUES[ourPiece.type] || 0;
            if (value < 5) continue;

            const attackers = getAttackersOfSquare(fen, ourPiece.square, oppColor);
            if (attackers.length >= 2) {
                threats.push({
                    type: 'multiple_attackers',
                    severity: 'high',
                    target: ourPiece.type,
                    targetSquare: ourPiece.square,
                    attackerCount: attackers.length,
                    attackers: attackers.map(a => ({ type: a.piece, square: a.square })),
                    description: `${ourPiece.type.toUpperCase()} attacked ${attackers.length} times`
                });
            }
        }

        return this._setCache(cacheKey, threats);
    },

    detectQueenTrap(fen, queenSquare, ourColor) {
        const cacheKey = `qtrap|${fen}|${queenSquare}`;
        const cached = this._getCache(cacheKey);
        if (cached !== undefined) return cached;

        const oppColor = ourColor === "w" ? "b" : "w";
        const escapeSquares = getQueenEscapeSquares(fen, queenSquare, ourColor);

        const safeEscapes = escapeSquares.filter(sq => {
            const attackers = getAttackersOfSquare(fen, sq, oppColor);
            return attackers.length === 0;
        });

        const nearbyOppPieces = getPiecesInRadius(fen, queenSquare, 2, oppColor);
        const [file, rank] = this._parseSquare(queenSquare);
        const isEdge = file === 0 || file === 7 || rank === 1 || rank === 8;
        const isCorner = (file === 0 || file === 7) && (rank === 1 || rank === 8);

        const isTrapped =
            (isCorner && safeEscapes.length <= 1) ||
            (isEdge && safeEscapes.length <= 1 && nearbyOppPieces.length >= 3) ||
            (!isEdge && safeEscapes.length <= 2 && nearbyOppPieces.length >= 4);

        return this._setCache(cacheKey, isTrapped);
    },

    detectLeftBehind(oldFen, newFen, from, to, ourColor) {
        const cacheKey = `leftbehind|${oldFen}|${from}|${to}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const threats = [];
        const oppColor = ourColor === "w" ? "b" : "w";
        const ourPieces = getAllPieces(oldFen, ourColor);

        for (const piece of ourPieces) {
            if (piece.square === from) continue;

            const wasDefended = isSquareDefendedBy(oldFen, piece.square, from);

            if (wasDefended) {
                const stillDefendedByMovedPiece = isSquareDefendedBy(newFen, piece.square, to);
                const hasOtherDefenders = getAttackersOfSquare(newFen, piece.square, ourColor).length > 0;
                const stillDefended = stillDefendedByMovedPiece || hasOtherDefenders;

                if (!stillDefended) {
                    const attackers = getAttackersOfSquare(newFen, piece.square, oppColor);
                    if (attackers.length > 0) {
                        const value = PIECE_VALUES[piece.type] || 0;
                        threats.push({
                            type: 'left_undefended',
                            severity: value >= 5 ? 'high' : 'medium',
                            piece: piece.type,
                            square: piece.square,
                            value: value,
                            attackers: attackers.length,
                            description: `${piece.type.toUpperCase()} left undefended at ${piece.square}`
                        });
                    }
                }
            }
        }

        return this._setCache(cacheKey, threats);
    },

    detectPreventedThreats(oldFen, newFen, uci, ourColor) {
        const cacheKey = `prevented|${oldFen}|${uci}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const prevented = [];
        const oppColor = ourColor === "w" ? "b" : "w";
        const to = uci.substring(2, 4);

        const capturedPiece = pieceFromFenChar(fenCharAtSquare(oldFen, to));
        if (capturedPiece && capturedPiece.color === oppColor) {
            const capturedThreats = this._getPieceThreats(oldFen, to, oppColor, ourColor);
            if (capturedThreats > 0) {
                prevented.push({
                    type: 'threat_removed',
                    severity: 'medium',
                    removedPiece: capturedPiece.type,
                    description: `Removed threatening ${capturedPiece.type.toUpperCase()}`
                });
            }
        }

        const oppPieces = getAllPieces(newFen, oppColor);
        for (const oppPiece of oppPieces) {
            const wasAttacked = isSquareAttackedBy(oldFen, oppPiece.square, ourColor);
            const nowAttacked = isSquareAttackedBy(newFen, oppPiece.square, ourColor);

            if (!wasAttacked && nowAttacked) {
                const value = PIECE_VALUES[oppPiece.type] || 0;
                if (value >= 3) {
                    prevented.push({
                        type: 'new_attack',
                        severity: value >= 5 ? 'high' : 'medium',
                        target: oppPiece.type,
                        square: oppPiece.square,
                        value: value,
                        description: `Now attacking ${oppPiece.type.toUpperCase()} at ${oppPiece.square}`
                    });
                }
            }
        }

        const blocked = this._detectBlockedAttack(oldFen, newFen, to, ourColor, oppColor);
        if (blocked) {
            prevented.push(blocked);
        }

        return this._setCache(cacheKey, prevented);
    },

    _getPieceThreats(fen, square, pieceColor, targetColor) {
        const attacked = getSquaresAttackedByPiece(fen, square,
            pieceFromFenChar(fenCharAtSquare(fen, square)).type, pieceColor);

        let threatCount = 0;
        for (const sq of attacked) {
            const piece = pieceFromFenChar(fenCharAtSquare(fen, sq));
            if (piece && piece.color === targetColor) {
                const value = PIECE_VALUES[piece.type] || 0;
                if (value >= 3) threatCount++;
            }
        }
        return threatCount;
    },

    _detectBlockedAttack(oldFen, newFen, blockSquare, ourColor, oppColor) {
        const oppLongRange = getAllPieces(oldFen, oppColor).filter(p =>
            ['q', 'r', 'b'].includes(p.type)
        );

        for (const piece of oppLongRange) {
            const directions = this._getPinDirections(piece.type);

            for (const dir of directions) {
                const rayBefore = this._castRay(oldFen, piece.square, dir);
                const rayAfter = this._castRay(newFen, piece.square, dir);

                if (rayAfter.includes(blockSquare) && rayBefore.length > rayAfter.length) {
                    return {
                        type: 'blocked_attack',
                        severity: 'medium',
                        blockedPiece: piece.type,
                        description: `Blocked ${piece.type.toUpperCase()} attack`
                    };
                }
            }
        }

        return null;
    },

    _getPinDirections(pieceType) {
        const directions = [];
        if (pieceType === 'r' || pieceType === 'q') {
            directions.push(
                { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
            );
        }
        if (pieceType === 'b' || pieceType === 'q') {
            directions.push(
                { dx: 1, dy: 1 }, { dx: 1, dy: -1 },
                { dx: -1, dy: 1 }, { dx: -1, dy: -1 }
            );
        }
        return directions;
    },

    _castRay(fen, square, direction) {
        const ray = [];
        const [startFile, startRank] = this._parseSquare(square);
        let f = startFile + direction.dx;
        let r = startRank + direction.dy;

        while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
            const sq = "abcdefgh"[f] + r;
            ray.push(sq);

            const ch = fenCharAtSquare(fen, sq);
            if (ch && ch !== '.') break;

            f += direction.dx;
            r += direction.dy;
        }

        return ray;
    },

    _parseSquare(square) {
        return [
            "abcdefgh".indexOf(square[0]),
            parseInt(square[1])
        ];
    },

    _getCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.value;
        }
        return undefined;
    },

    _setCache(key, value) {
        this.cache.set(key, { value, timestamp: Date.now() });

        if (this.cache.size > 200) {
            const cutoff = Date.now() - this.CACHE_TTL;
            for (const [k, v] of this.cache.entries()) {
                if (v.timestamp < cutoff) {
                    this.cache.delete(k);
                }
            }
        }

        return value;
    },

    clearCache() {
        this.cache.clear();
    }

};

function detectForks(fen, square, pieceType, ourColor) {
    return ThreatDetectionSystem.detectForks(fen, square, pieceType, ourColor);
}

function detectDiscoveredAttack(oldFen, newFen, from, to, ourColor) {
    return ThreatDetectionSystem.detectDiscoveredAttack(oldFen, newFen, from, to, ourColor);
}

function detectPinPotential(fen, square, pieceType, ourColor) {
    return ThreatDetectionSystem.detectPinPotential(fen, square, pieceType, ourColor);
}

function detectOpponentForks(fen, ourColor) {
    return ThreatDetectionSystem.detectOpponentForks(fen, ourColor);
}

function detectQueenTrap(fen, queenSquare, ourColor) {
    return ThreatDetectionSystem.detectQueenTrap(fen, queenSquare, ourColor);
}

function detectLeftBehind(oldFen, newFen, from, to, ourColor) {
    return ThreatDetectionSystem.detectLeftBehind(oldFen, newFen, from, to, ourColor);
}

function detectPreventedThreats(oldFen, newFen, uci, ourColor) {
    return ThreatDetectionSystem.detectPreventedThreats(oldFen, newFen, uci, ourColor);
}

function getSquaresAttackedByPiece(fen, square, pieceType, color) {
    let squares = [];
    let f = "abcdefgh".indexOf(square[0]);
    let r = parseInt(square[1]);

    if (pieceType === 'n') {
        let moves = [
            [2, 1],
            [2, -1],
            [-2, 1],
            [-2, -1],
            [1, 2],
            [1, -2],
            [-1, 2],
            [-1, -2]
        ];
        moves.forEach(function (m) {
            let nf = f + m[0],
                nr = r + m[1];
            if (nf >= 0 && nf <= 7 && nr >= 1 && nr <= 8) {
                squares.push("abcdefgh"[nf] + nr);
            }
        });
    }

    if (pieceType === 'p') {
        let dir = color === 'w' ? 1 : -1;
        [-1, 1].forEach(function (df) {
            let nf = f + df,
                nr = r + dir;
            if (nf >= 0 && nf <= 7 && nr >= 1 && nr <= 8) {
                squares.push("abcdefgh"[nf] + nr);
            }
        });
    }

    if (['q', 'r', 'b'].includes(pieceType)) {
        let directions = [];
        if (pieceType === 'q' || pieceType === 'r') {
            directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        }
        if (pieceType === 'q' || pieceType === 'b') {
            directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        }

        directions.forEach(function (d) {
            let nf = f + d[0],
                nr = r + d[1];
            while (nf >= 0 && nf <= 7 && nr >= 1 && nr <= 8) {
                let sq = "abcdefgh"[nf] + nr;
                squares.push(sq);
                if (fenCharAtSquare(fen, sq)) break;
                nf += d[0];
                nr += d[1];
            }
        });
    }

    if (pieceType === 'k') {
        for (let df = -1; df <= 1; df++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (df === 0 && dr === 0) continue;
                let nf = f + df,
                    nr = r + dr;
                if (nf >= 0 && nf <= 7 && nr >= 1 && nr <= 8) {
                    squares.push("abcdefgh"[nf] + nr);
                }
            }
        }
    }

    return squares;
}

function getAllPieces(fen, color) {
    let pieces = [];
    let placement = fen.split(" ")[0];
    let ranks = placement.split("/");

    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
        let rank = 8 - rankIdx;
        let file = 0;
        for (let i = 0; i < ranks[rankIdx].length; i++) {
            let ch = ranks[rankIdx][i];
            if (/\d/.test(ch)) {
                file += parseInt(ch, 10);
            } else {
                let isUpper = ch === ch.toUpperCase();
                let pieceColor = isUpper ? 'w' : 'b';
                if (pieceColor === color) {
                    pieces.push({ square: "abcdefgh"[file] + rank, type: ch.toLowerCase(), char: ch, color: pieceColor });
                }
                file++;
            }
        }
    }

    return pieces;
}

function canPieceAttackSquare(fen, piece, targetSquare) {
    let squares = getSquaresAttackedByPiece(fen, piece.square, piece.type, piece.color);
    return squares.includes(targetSquare);
}

function wasBlocked(fen, movedFrom, attackerSquare, targetSquare) {
    let af = "abcdefgh".indexOf(attackerSquare[0]);
    let ar = parseInt(attackerSquare[1]);
    let tf = "abcdefgh".indexOf(targetSquare[0]);
    let tr = parseInt(targetSquare[1]);
    let mf = "abcdefgh".indexOf(movedFrom[0]);
    let mr = parseInt(movedFrom[1]);

    let df = tf - af;
    let dr = tr - ar;

    if (df === 0 && dr === 0) return false;
    if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return false;

    let stepF = df === 0 ? 0 : (df > 0 ? 1 : -1);
    let stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);

    if (mf === af && mr === ar) return false;
    if (mf === tf && mr === tr) return false;

    let dmf = mf - af;
    let dmr = mr - ar;

    if (stepF === 0) {
        if (mf !== af) return false;

        if (stepR > 0) {
            if (!(mr > ar && mr < tr)) return false;
        } else {
            if (!(mr < ar && mr > tr)) return false;
        }
    } else if (stepR === 0) {
        if (mr !== ar) return false;

        if (stepF > 0) {
            if (!(mf > af && mf < tf)) return false;
        } else {
            if (!(mf < af && mf > tf)) return false;
        }
    } else {
        if (Math.abs(dmf) !== Math.abs(dmr)) return false;

        let movedStepF = dmf > 0 ? 1 : -1;
        let movedStepR = dmr > 0 ? 1 : -1;
        if (movedStepF !== stepF || movedStepR !== stepR) return false;

        if (Math.abs(dmf) >= Math.abs(df)) return false;
    }

    return true;
}

function isSquareDefendedBy(fen, square, defenderSquare) {
    let ch = fenCharAtSquare(fen, defenderSquare);
    let piece = pieceFromFenChar(ch);
    if (!piece) return false;

    let attacked = getSquaresAttackedByPiece(fen, defenderSquare, piece.type, piece.color);
    return attacked.includes(square);
}

function isPiecePinned(fen, pieceSquare, kingSquare, ourColor, oppColor) {
    const pf = "abcdefgh".indexOf(pieceSquare[0]);
    const pr = parseInt(pieceSquare[1], 10);
    const kf = "abcdefgh".indexOf(kingSquare[0]);
    const kr = parseInt(kingSquare[1], 10);

    const df = kf - pf;
    const dr = kr - pr;

    if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return false;

    const stepF = df === 0 ? 0 : -(df / Math.abs(df));
    const stepR = dr === 0 ? 0 : -(dr / Math.abs(dr));

    let f = pf + stepF;
    let r = pr + stepR;

    while (f >= 0 && f <= 7 && r >= 1 && r <= 8) {
        const sq = "abcdefgh"[f] + r;
        const ch = fenCharAtSquare(fen, sq);
        if (ch) {
            const p = pieceFromFenChar(ch);
            if (!p || p.color === ourColor) return false;
            if (
                ((stepF === 0 || stepR === 0) && (p.type === 'r' || p.type === 'q')) ||
                ((stepF !== 0 && stepR !== 0) && (p.type === 'b' || p.type === 'q'))
            ) {
                return true;
            }
            return false;
        }
        f += stepF;
        r += stepR;
    }
    return false;
}

function getQueenEscapeSquares(fen, queenSquare, color) {
    let escapes = [];
    let directions = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
    ];
    let f = "abcdefgh".indexOf(queenSquare[0]);
    let r = parseInt(queenSquare[1]);

    directions.forEach(function (d) {
        let nf = f + d[0],
            nr = r + d[1];
        while (nf >= 0 && nf <= 7 && nr >= 1 && nr <= 8) {
            let sq = "abcdefgh"[nf] + nr;
            if (!fenCharAtSquare(fen, sq)) {
                escapes.push(sq);
            } else {
                break;
            }
            nf += d[0];
            nr += d[1];
        }
    });

    return escapes;
}

function getPiecesInRadius(fen, centerSquare, radius, color) {
    let pieces = [];
    let allPieces = getAllPieces(fen, color);
    let cf = "abcdefgh".indexOf(centerSquare[0]);
    let cr = parseInt(centerSquare[1]);

    allPieces.forEach(function (p) {
        let pf = "abcdefgh".indexOf(p.square[0]);
        let pr = parseInt(p.square[1]);
        let dist = Math.max(Math.abs(cf - pf), Math.abs(cr - pr));
        if (dist <= radius) {
            pieces.push(p);
        }
    });

    return pieces;
}

// =====================================================
// Section 17: Premove Decision Wrapper
// =====================================================
function shouldPremove(uci, fen, pvMoves) {
    const scoreInfo = State._lastScoreInfo || null;
    return SmartPremove.shouldPremove(fen, uci, pvMoves, scoreInfo);
}

// =====================================================
// Section 18: Cache Management
// =====================================================
function clearPremoveCaches() {
    predictedFenCache.clear();
    premoveSafetyCache.clear();
}

function trimCaches() {
    function trimMap(map, maxSize) {
        if (map.size <= maxSize) return;
        let keysToDelete = map.size - Math.floor(maxSize * 0.8);
        let keys = Array.from(map.keys()).slice(0, keysToDelete);
        keys.forEach(function (k) { map.delete(k); });
    }

    let maxSize = 15;
    trimMap(predictedFenCache, maxSize);
    trimMap(premoveSafetyCache, maxSize);

    if (Object.keys(ATTACK_CACHE).length > 20) {
        let keysToRemove = Object.keys(ATTACK_CACHE).slice(0, 10);
        keysToRemove.forEach(function (k) { delete ATTACK_CACHE[k]; });
    }
}

function getOpponentMoveFromPV(pv, ourColor, sideToMove) {
    if (!pv) return null;
    let moves = parsePVMoves(pv);
    if (!moves.length) return null;
    let idx = (sideToMove === ourColor) ? 1 : 0;
    if (idx >= moves.length) return null;
    return moves[idx];
}

// =====================================================
// Section 19: Evaluation Parsing
// =====================================================
function normalizeEvaluation(evaluation) {
    if (evaluation === null || evaluation === undefined || evaluation === "-" || evaluation === "Error") {
        return null;
    }

    if (typeof evaluation === "object" && evaluation !== null) {
        if ("mate" in evaluation && evaluation.mate !== 0) {
            return { mate: evaluation.mate };
        }
        if ("cp" in evaluation) {
            return { cp: evaluation.cp };
        }
        return null;
    }

    if (typeof evaluation === "string") {
        const mateMatch = evaluation.match(/([+-])?M([+-]?\d+)/i);
        if (mateMatch) {
            const sign = mateMatch[1] === "-" ? -1 : 1;
            const moves = Math.abs(parseInt(mateMatch[2], 10));
            return { mate: sign * moves };
        }

        const num = parseFloat(evaluation);
        if (!isNaN(num)) {
            return { cp: Math.round(num * 100) };
        }
        return null;
    }

    if (typeof evaluation === "number") {
        return { cp: Math.round(evaluation * 100) };
    }

    return null;
}

// =====================================================
// Section 20: Premove Chance Calculation
// =====================================================
function getBaseChanceFromParsedEval(parsed) {
    if (!parsed) return 0;
    if ("mate" in parsed) {
        let mateDistance = Math.abs(parsed.mate);
        if (parsed.mate > 0) return 2;
        if (mateDistance <= 2) return 75;
        if (mateDistance <= 4) return 65;
        if (mateDistance <= 6) return 55;
        return 45;
    }

    let evalFromSTM = parsed.cp / 100;
    let ourEval = -evalFromSTM;
    if (ourEval >= 10.0) return 80;
    if (ourEval >= 6.0) return 70;
    if (ourEval >= 3.5) return 55;
    if (ourEval >= 2.0) return 45;
    if (ourEval >= 1.0) return 35;
    if (ourEval >= 0.3) return 25;
    if (ourEval >= 0) return 18;
    if (ourEval >= -0.5) return 12;
    if (ourEval >= -1.5) return 8;
    if (ourEval >= -3.0) return 5;
    return 2;
}

function getEvalBasedPremoveChance(evaluation, ourColor) {
    if (!State.premoveEnabled) return 0;
    let game = getGame();
    if (!game || isPlayersTurn(game)) return 0;
    let parsed = normalizeEvaluation(evaluation, ourColor);
    if (!parsed) return 0;
    return getBaseChanceFromParsedEval(parsed);
}

function calculatePremoveChance(fen, uci, pvMoves, scoreType, scoreValue, rawCp, stm) {
    let ourColor = getPlayingAs();
    let breakdown = {
        base: 0,
        cctBonus: 0,
        riskPenalty: 0,
        rawCpSanityApplied: false,
        final: 0
    };
    if (!stm || !ourColor) {
        State.statusInfo = "[Premove] Invalid: missing stm or ourColor";
        UI.updateStatusInfo();
        return { chance: 0, breakdown: breakdown, safety: null, cct: null, uci: uci };
    }
    if (stm === ourColor) {
        State.statusInfo = "[Premove] Invalid: stm === ourColor";
        UI.updateStatusInfo();
        return { chance: 0, breakdown: breakdown, safety: null, cct: null, uci: uci };
    }
    let predictedFen = getPredictedFen(fen, pvMoves);
    let parsed = scoreType === "mate" ? { mate: scoreValue } : { cp: scoreValue };
    breakdown.base = getBaseChanceFromParsedEval(parsed);
    if (scoreType === "cp" && rawCp !== undefined && rawCp !== null) {
        let rawParsed = { cp: rawCp };
        let rawBase = getBaseChanceFromParsedEval(rawParsed);
        let scoreDiff = Math.abs(rawBase - breakdown.base);
        if (scoreDiff > 20) {
            breakdown.base = Math.min(breakdown.base, rawBase);
            breakdown.rawCpSanityApplied = true;
            State.statusInfo = "[Premove] rawCp sanity check applied: scoreValue=" +
                scoreValue + " rawCp=" + rawCp + " baseDiff=" + scoreDiff;
            UI.updateStatusInfo();
        }
    }
    let cct = State.cctAnalysisEnabled ? analyzeCCT(predictedFen, uci, ourColor) : null;
    if (cct) {
        if (cct.givesCheck && cct.checkIsSafe) breakdown.cctBonus += 6;
        else if (cct.givesCheck) breakdown.cctBonus += 2;
        let createdThreats = (cct.threats && cct.threats.created) ? cct.threats.created : [];
        let majorThreats = createdThreats.filter(function (t) { return t.severity === "high"; });
        breakdown.cctBonus += Math.min(majorThreats.length, 2) * 3;
        if (cct.captureAnalysis && cct.captureAnalysis.netMaterialGain > 2) breakdown.cctBonus += 3;
        if (breakdown.cctBonus > 15) breakdown.cctBonus = 15;
        if (!cct.givesCheck) {
            let fallThreats = (cct.threats && cct.threats.weFallInto) ? cct.threats.weFallInto : [];
            let badThreats = fallThreats.filter(function (t) { return t.severity === "high"; });
            breakdown.cctBonus -= badThreats.length * 10;
            if (cct.captureAnalysis && cct.captureAnalysis.netMaterialGain < -1) {
                breakdown.cctBonus -= Math.abs(cct.captureAnalysis.netMaterialGain) * 8;
            }
        }
        if (breakdown.cctBonus < -15) breakdown.cctBonus = -15;
    }
    let safety = checkPremoveSafety(predictedFen, uci, ourColor);
    if (safety && safety.riskLevel > 0) {
        let riskMult;
        if (safety.riskLevel <= 15) riskMult = 0.2;
        else if (safety.riskLevel <= 30) riskMult = 0.5;
        else if (safety.riskLevel <= 50) riskMult = 0.9;
        else if (safety.riskLevel <= 70) riskMult = 1.3;
        else riskMult = 1.8;
        breakdown.riskPenalty = Math.round(safety.riskLevel * (State.premoveRiskPenaltyFactor || 0.6) * riskMult);
    }
    let rawFinal = breakdown.base + breakdown.cctBonus - breakdown.riskPenalty;
    let maxFinal = Math.min(70, breakdown.base + 8);
    let userMinConfidence = clamp(State.premoveMinConfidence || 15, 5, 30);
    let minFinal = Math.max(5, userMinConfidence);
    if (breakdown.cctBonus < -5 || breakdown.riskPenalty > 10) {
        minFinal = Math.max(3, Math.floor(minFinal / 2));
    }
    breakdown.final = clamp(rawFinal, minFinal, maxFinal);
    if (scoreType === "mate" && scoreValue > 0) breakdown.final = Math.min(breakdown.final, 3);
    if (scoreType === "mate" && scoreValue < 0 && Math.abs(scoreValue) <= 3) breakdown.final = Math.max(breakdown.final, 60);
    if (safety && safety.riskLevel > 50) breakdown.final = Math.min(breakdown.final, 25);
    if (safety && safety.riskLevel > 70) breakdown.final = Math.min(breakdown.final, 10);
    if (breakdown.final > 70) breakdown.final = 70;
    return { chance: breakdown.final, breakdown: breakdown, safety: safety, cct: cct, uci: uci };
}

function parsePVMoves(pv) {
    if (!pv || typeof pv !== "string") return [];
    let tokenRe = /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i;
    let trimmed = pv.trim();
    if (!trimmed) return [];
    return trimmed.split(/\s+/).filter(function (t) { return tokenRe.test(t); });
}

function getOurMoveFromPV(pv, ourColor, sideToMove) {
    if (!pv) return null;
    let moves = parsePVMoves(pv);
    if (!moves.length) return null;
    let idx = (sideToMove === ourColor) ? 0 : 1;
    if (idx >= moves.length) {
        State.statusInfo = "[PV] PV too short for premove. Length:" + moves.length + " needed idx:" + idx;
        UI.updateStatusInfo();
        return null;
    }
    return moves[idx];
}

// =====================================================
// Section 21A: Time and Clock Functions
// =====================================================
function parseTimeString(timeString) {
    if (!timeString || typeof timeString !== "string") return null;
    let clean = timeString.replace(/[^\d:.]/g, "");
    if (!/\d/.test(clean)) return null;
    let parts = clean.split(":").map(function (p) { return parseFloat(p); });
    if (parts.some(isNaN)) return null;
    let total = 0;
    if (parts.length === 3) total = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) total = parts[0] * 60 + parts[1];
    else if (parts.length === 1) total = parts[0];
    return total >= 0 ? total : null;
}

function getClockTimes() {
    try {
        const clockSelectors = [
            ".clock-time-monospace[role=\"timer\"]",
            ".clock-time-monospace",
            ".clock-component .clock-time-monospace"
        ];
        let allClockElements = [];

        for (let si = 0; si < clockSelectors.length; si++) {
            const elements = Array.from(document.querySelectorAll(clockSelectors[si]))
                .filter(function (el) { return el && el.offsetParent !== null; });
            if (elements.length > 0) {
                allClockElements = elements;
                break;
            }
        }

        if (allClockElements.length === 0) {
            return { opponentTime: null, playerTime: null, found: false };
        }

        const getElementTime = function (el) {
            const text = (el.textContent || el.innerText || "").trim();
            return parseTimeString(text);
        };

        let opponentTime = null;
        let playerTime = null;

        if (allClockElements.length >= 2) {
            const sorted = allClockElements
                .map(function (el) { return { el: el, rect: el.getBoundingClientRect() }; })
                .sort(function (a, b) { return a.rect.top - b.rect.top; })
                .map(function (obj) { return obj.el; });
            playerTime = getElementTime(sorted[sorted.length - 1]);
            opponentTime = getElementTime(sorted[0]);
        } else {
            playerTime = getElementTime(allClockElements[0]);
        }

        return { opponentTime: opponentTime, playerTime: playerTime, found: true };

    } catch (e) {
        return { opponentTime: null, playerTime: null, found: false };
    }
}

// =====================================================
// Section 21B: Advanced Time Management (v2.0)
// =====================================================
let TimeManager = {
    lastMoveTime: 0,
    moveTimes: [],
    isTimePressure: false,

    calculateHumanizedDelay: function () {
        if (State.clockSync) return this._calculateClockSyncDelay();

        let range = this._getValidatedDelayRange();
        let minD = range.min;
        let maxD = range.max;
        let baseDelay = (Math.random() * (maxD - minD) + minD) * 1000;

        // Reset each cycle so drag timing does not stay in time-pressure mode forever.
        this.isTimePressure = false;

        if (CONFIG.STEALTH.RANDOMIZE_DELAYS) {
            let complexity = this._estimatePositionComplexity();
            let complexityMultiplier = 1 + (complexity * 0.5);
            baseDelay *= complexityMultiplier;

            if (State.moveNumber <= 10) baseDelay *= 0.8;

            let clockData = getClockTimes();
            if (clockData.found && clockData.playerTime !== null) {
                if (clockData.playerTime < 30) {
                    baseDelay *= 0.4;
                    this.isTimePressure = true;
                } else if (clockData.playerTime > 120) {
                    baseDelay *= 1.2;
                }
            }
        }

        this.moveTimes.push(baseDelay);
        if (this.moveTimes.length > 10) this.moveTimes.shift();

        return Math.max(100, baseDelay);
    },

    _calculateClockSyncDelay: function () {
        let clockData = getClockTimes();
        if (!clockData.found || clockData.playerTime === null) {
            return this._calculateRandomDelay();
        }

        let myTimeSec = clockData.playerTime;
        let quickThreshold = State.clockSyncLowTimeQuickSec;
        let quickDelayMs = State.clockSyncQuickDelayMs || 300;

        if (myTimeSec <= quickThreshold) {
            console.log("[TimeManager] LOW TIME! " + myTimeSec + "s <= " + quickThreshold + "s, using quick delay: " + quickDelayMs + "ms");
            return quickDelayMs;
        }

        let myTimeMs = myTimeSec * 1000;
        let incrementMs = State.incrementSeconds * 1000;
        let moveNum = State.moveNumber;
        let estimatedTotalMoves = this._estimateGameLength();
        let remainingMoves = Math.max(1, estimatedTotalMoves - moveNum);

        let phaseMultiplier = 1.0;
        if (moveNum <= 10) phaseMultiplier = 0.6;
        else if (moveNum > 10 && moveNum < 40) phaseMultiplier = 1.3;
        else phaseMultiplier = 0.8;

        let timeForThisMove = (myTimeMs / remainingMoves) * phaseMultiplier;
        timeForThisMove += (incrementMs * 0.3);

        // Clock Sync normal mode follows the main normal delay range.
        let minTime = Number(State.minDelay) * 1000;
        let maxTime = Number(State.maxDelay) * 1000;
        if (!isFinite(minTime) || minTime <= 0) minTime = 100;
        if (!isFinite(maxTime) || maxTime <= 0) maxTime = minTime;
        if (minTime > maxTime) {
            let tmp = minTime;
            minTime = maxTime;
            maxTime = tmp;
        }

        let finalDelay = Math.min(Math.max(timeForThisMove, minTime), maxTime);
        let jitter = (Math.random() - 0.5) * 0.2;

        console.log("[TimeManager] Normal mode: " + myTimeSec + "s remaining, calculated delay: " + Math.round(finalDelay * (1 + jitter)) + "ms");
        State.statusInfo = "Moving in " + (finalDelay / 1000).toFixed(1) + "s";
        return finalDelay * (1 + jitter);
    },

    _estimatePositionComplexity: function () {
        let fen = getAccurateFen();
        if (!fen) return 1.0;
        let pieceCount = (fen.match(/[pnbrqkPNBRQK]/g) || []).length;
        let baseComplexity = pieceCount / 32;
        let kingExposure = this._estimateKingExposure(fen);
        return Math.min(2.0, baseComplexity + kingExposure);
    },

    _estimateKingExposure: function (fen) {
        let parts = fen.split(" ");
        let castling = parts[2] || "-";
        return castling === "-" ? 0.3 : 0.1;
    },

    _estimateGameLength: function () {
        let timeControl = this._detectTimeControl();
        if (timeControl === "bullet") return 40;
        if (timeControl === "blitz") return 50;
        if (timeControl === "rapid") return 60;
        return 70;
    },

    _detectTimeControl: function () {
        let clockData = getClockTimes();
        if (!clockData.found) return "rapid";
        let totalTime = clockData.playerTime;
        if (totalTime <= 180) return "bullet";
        if (totalTime <= 600) return "blitz";
        if (totalTime <= 1800) return "rapid";
        return "classical";
    },

    _getValidatedDelayRange: function () {
        let minD = Number(State.useSecondDelay ? State.minDelayTwo : State.minDelay);
        let maxD = Number(State.useSecondDelay ? State.maxDelayTwo : State.maxDelay);

        if (!isFinite(minD) || minD <= 0) minD = 0.1;
        if (!isFinite(maxD) || maxD <= 0) maxD = minD;
        if (minD > maxD) {
            let tmp = minD;
            minD = maxD;
            maxD = tmp;
        }

        return {
            min: minD,
            max: maxD
        };
    },

    _calculateRandomDelay: function () {
        let range = this._getValidatedDelayRange();
        let minD = range.min;
        let maxD = range.max;
        return (Math.random() * (maxD - minD) + minD) * 1000;
    }
};

function getCalculatedDelay() {
    return TimeManager.calculateHumanizedDelay();
}

function cancelPendingMove() {
    if (pendingMoveTimeoutId) {
        clearTimeout(pendingMoveTimeoutId);
        pendingMoveTimeoutId = null;
    }
}

// =====================================================
// Section 22: Opponent Rating and Depth Adaptation
// =====================================================
function extractOpponentRating() {
    try {

        let selectors = [

            "#board-layout-player-top .rating",
            "#board-layout-player-bottom .rating",
            "#board-layout-player-top [class*='rating']",
            "#board-layout-player-bottom [class*='rating']",

            ".user-tagline-rating",
            ".player-component .rating",
            ".player-top .rating",
            ".player-bottom .rating",

            ".board-layout-player-top .rating",
            ".board-layout-player-bottom .rating"
        ];

        for (let i = 0; i < selectors.length; i++) {
            let el = document.querySelector(selectors[i]);
            if (el && el.textContent) {
                let rating = parseInt(el.textContent.replace(/\D/g, ""), 10);
                if (!isNaN(rating) && rating > 100) return rating;
            }
        }

        let boardArea = document.querySelector("#board-layout-chessboard") ||
            document.querySelector("chess-board") ||
            document.querySelector(".board");

        if (boardArea) {
            let allText = boardArea.parentElement.textContent || "";
            let ratingMatches = allText.match(/\d{3,4}\s*[♙♘♗♖♕♔⚫⚪]/g);
            if (ratingMatches && ratingMatches.length >= 2) {

                return parseInt(ratingMatches[0].replace(/\D/g, ""), 10);
            }
        }

        let game = getGame();
        if (game && game.players) {
            let myColor = getPlayingAs();
            for (let color in game.players) {
                if (color !== myColor && game.players[color].rating) {
                    return parseInt(game.players[color].rating, 10);
                }
            }
        }

    } catch (e) {
        console.error("[ChessAssistant] Error extracting rating:", e);
    }
    return null;
}

function mapRatingToDepth(r) {
    if (!r || r < 600) return 1;
    if (r < 900) return 3;
    if (r < 1100) return 5;
    if (r < 1300) return 7;
    if (r < 1500) return 9;
    if (r < 1700) return 12;
    if (r < 1900) return 15;
    if (r < 2100) return 18;
    if (r < 2300) return 22;
    if (r < 2500) return 24;
    return Math.min(26, CONFIG.MAX_DEPTH);
}

function applyAutoDepthFromOpponent() {
    if (!State.autoDepthAdapt) {
        return;
    }

    let opp = extractOpponentRating();
    if (!opp) {
        console.log("[ChessAssistant] Could not extract opponent rating");
        State.statusInfo = "Auto Depth: No rating found";
        UI.updateStatusInfo();
        return;
    }

    let newDepth = mapRatingToDepth(opp);

    console.log("[ChessAssistant] Opponent rating:", opp, "-> Depth:", newDepth);

    State.lastOpponentRating = opp;
    saveSetting("customDepth", newDepth);

    _updateDepthSliderUI(newDepth, opp);

    State.statusInfo = "Auto Depth: " + opp + " ELO → Depth " + newDepth;
    UI.updateStatusInfo();
}

function _updateDepthSliderUI(depth, rating) {
    let attempts = 0;
    let maxAttempts = 5;

    function tryUpdate() {
        let sld = $("#sld-depth");
        let disp = $("#depth-display");

        if (sld && disp) {

            sld.value = depth;
            disp.textContent = depth;

            let event = new Event('input', { bubbles: true });
            sld.dispatchEvent(event);

            let changeEvent = new Event('change', { bubbles: true });
            sld.dispatchEvent(changeEvent);

            console.log("[ChessAssistant] Depth slider updated to:", depth);
            return true;
        }

        attempts++;
        if (attempts < maxAttempts) {
            setTimeout(tryUpdate, 100);
        } else {
            console.warn("[ChessAssistant] Could not find depth slider after", maxAttempts, "attempts");
        }
        return false;
    }

    tryUpdate();
}

function forceUpdateDepthFromOpponent() {
    console.log("[ChessAssistant] Manual depth update triggered");
    State.lastOpponentRating = null;
    applyAutoDepthFromOpponent();
}

// =====================================================
// Section 23: Engine Management (Fixed Premove v4.0)
// =====================================================
let Engine = {
    main: null,
    mainBlobURL: null,
    _ready: false,
    analysis: null,
    analysisBlobURL: null,
    premove: null,
    premoveBlobURL: null,

    _premoveEngineBusy: false,
    _premoveProcessedFens: new Set(),
    _premoveProcessing: false,
    _premoveLastFen: null,
    _premoveTimeoutId: null,
    _premoveCandidates: Object.create(null),
    _premoveAttemptedFens: new Set(),
    _premoveLastActivityTs: 0,
    _mainLastActivityTs: 0,
    _analysisLastActivityTs: 0,

    init: function () {
        let self = this;
        let src = "";
        try {
            src = GM_getResourceText("stockfishjs");
        } catch (e) { }

        if (!src || src.length < 1000) {
            State.statusInfo = "GM_getResourceText unavailable, trying manual load...";
            UI.updateStatusInfo();
            return loadStockfishManually().then(function (loaded) {
                if (!loaded) {
                    err("All Stockfish load methods failed");
                    return false;
                }
                return self.loadMainEngine();
            });
        }
        return self.loadMainEngine();
    },

    _createWorker: function (existingBlobURL) {
        if (existingBlobURL) {
            try {
                URL.revokeObjectURL(existingBlobURL);
            } catch (e) { }
        }
        let src = "";
        try {
            src = GM_getResourceText("stockfishjs");
        } catch (e) { }
        if (!src || src.length < 1000) src = stockfishSourceCode;
        if (!src || src.length < 1000) {
            err("No Stockfish source available");
            return {
                worker: null,
                blobURL: null
            };
        }
        try {
            let blob = new Blob([src], {
                type: "application/javascript"
            });
            let blobURL = URL.createObjectURL(blob);
            let worker = new Worker(blobURL);
            return {
                worker: worker,
                blobURL: blobURL
            };
        } catch (e) {
            err("Worker creation failed:", e);
            return {
                worker: null,
                blobURL: null
            };
        }
    },

    _waitForSignal: function (engineWorker, signal, timeout) {
        return new Promise(function (resolve, reject) {
            let timer;
            let handler = function (e) {
                if (typeof e.data === "string" && e.data.includes(signal)) {
                    clearTimeout(timer);
                    engineWorker.removeEventListener("message", handler);
                    resolve();
                }
            };
            engineWorker.addEventListener("message", handler);
            timer = setTimeout(function () {
                engineWorker.removeEventListener("message", handler);
                reject(new Error("Timeout waiting for: " + signal));
            }, timeout);
        });
    },

    loadMainEngine: function () {
        let self = this;
        try {
            if (self.main) {
                self.main.terminate();
                self.main = null;
            }
            let result = self._createWorker(self.mainBlobURL);
            if (!result.worker) return Promise.resolve(false);
            self.main = result.worker;
            self.mainBlobURL = result.blobURL;
            self._ready = false;

            self.main.onmessage = function (e) {
                self._onMainMessage(e.data);
            };
            self.main.onerror = function () {
                self._ready = false;
            };

            return new Promise(function (resolve) {
                let attempt = function (n) {
                    if (n > 3) {
                        resolve(false);
                        return;
                    }
                    self.main.postMessage("uci");
                    self._waitForSignal(self.main, "uciok", 8000).then(function () {
                        self._configureMainEngine();
                        self.main.postMessage("isready");
                        return self._waitForSignal(self.main, "readyok", 5000);
                    }).then(function () {
                        self._ready = true;
                        self._mainLastActivityTs = Date.now();
                        let led = $("#engine-status-led");
                        if (led) led.classList.add("active");
                        resolve(true);
                    }).catch(function () {
                        setTimeout(function () {
                            attempt(n + 1);
                        }, 1000 * n);
                    });
                };
                attempt(1);
            });
        } catch (e) {
            err("Main engine init failed:", e);
            return Promise.resolve(false);
        }
    },

    _configureMainEngine: function () {
        let mpv = clamp(State.numberOfMovesToShow || 5, 2, 10);
        this.main.postMessage("setoption name MultiPV value " + mpv);
        if (State.evaluationMode === "human") {
            this.main.postMessage("setoption name UCI_LimitStrength value true");
            this.main.postMessage("setoption name UCI_Elo value " + State.eloRating);
        } else {
            this.main.postMessage("setoption name UCI_LimitStrength value false");
        }
        this.main.postMessage("ucinewgame");
    },

    go: function (fen, depth) {
        if (!this.main || !this._ready) return;
        if (State.analysisMode) {
            State.statusInfo = "Main engine blocked: Analysis mode active";
            UI.updateStatusInfo();
            return;
        }

        State.isThinking = true;
        State.statusInfo = "Analyzing...";
        UI.updateStatusInfo();
        State.topMoves = [];
        State.topMoveInfos = {};
        State.topMovesFen = fen;
        State.mainBestHistory = [];
        State.mainPVLine = [];
        State.mainPVTurn = getCurrentTurn(fen);

        let maxRows = clamp(State.numberOfMovesToShow || 5, 2, 10);
        for (let i = 1; i <= maxRows; i++) {
            UI.updateMove(i, "...", "0.00", "eval-equal");
        }
        UI.clearBestmoveArrows();

        UI.clearHighlights();
        this.main.postMessage("stop");
        this.main.postMessage("position fen " + fen);
        this._mainLastActivityTs = Date.now();
        if (State.evaluationMode === "human") {
            let level = ELO_LEVELS[State.humanLevel] || ELO_LEVELS.intermediate;
            let ms = Math.floor((level.moveTime.min + Math.random() * (level.moveTime.max - level.moveTime.min)) * 1000);
            this.main.postMessage("go movetime " + ms);
        } else {
            this.main.postMessage("go depth " + depth);
        }
        UI.updateStatusInfo();
    },

    stop: function () {
        if (this.main) this.main.postMessage("stop");
        State.isThinking = false;
        State.statusInfo = "Ready";
        UI.updateStatusInfo();
    },

    setElo: function (elo) {
        if (!this.main) return;
        this.main.postMessage("setoption name UCI_LimitStrength value true");
        this.main.postMessage("setoption name UCI_Elo value " + elo);
        this.main.postMessage("isready");
    },

    setFullStrength: function () {
        if (!this.main) return;
        this.main.postMessage("setoption name UCI_LimitStrength value false");
        this.main.postMessage("isready");
    },

    _onMainMessage: function (data) {
        if (typeof data !== "string") return;
        this._mainLastActivityTs = Date.now();
        if (State.analysisMode) {
            if (data.indexOf("bestmove") === 0) State.isThinking = false;
            return;
        }

        if (data.indexOf("info") === 0 && data.includes(" pv ")) {
            this._parseMainInfo(data);
        } else if (data.indexOf("bestmove") === 0) {
            this._handleMainBestMove(data);
        }
    },

    _parseMainInfo: function (data) {
        let tokens = data.split(" ");
        let get = function (key) {
            let i = tokens.indexOf(key);
            return (i !== -1 && i + 1 < tokens.length) ? tokens[i + 1] : null;
        };

        let multipv = parseInt(get("multipv")) || 1;
        let depth = parseInt(get("depth")) || 0;
        let pvIdx = tokens.indexOf("pv");
        if (pvIdx === -1) return;
        let bestMove = tokens[pvIdx + 1];

        let pvMoves = tokens.slice(pvIdx + 1).filter(function (m) {
            return /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(m);
        });

        let scoreIdx = tokens.indexOf("score");
        if (scoreIdx === -1) return;
        let scoreType = tokens[scoreIdx + 1];
        let scoreValue = parseInt(tokens[scoreIdx + 2]) || 0;

        let maxTrackedMoves = clamp(State.numberOfMovesToShow || 5, 2, 10);
        if (multipv >= 1 && multipv <= maxTrackedMoves) State.topMoves[multipv - 1] = bestMove;

        let evalText = "0.00";
        let evalClass = "eval-equal";
        let rawCp = 0;
        let mateVal = null;

        if (scoreType === "cp") {
            rawCp = scoreValue;
            evalText = (rawCp >= 0 ? "+" : "") + (rawCp / 100).toFixed(2);
            evalClass = rawCp > 30 ? "eval-positive" : rawCp < -30 ? "eval-negative" : "eval-equal";
        } else if (scoreType === "mate") {
            mateVal = scoreValue;
            rawCp = scoreValue > 0 ? CONFIG.MATE_VALUE : -CONFIG.MATE_VALUE;
            evalText = (scoreValue > 0 ? "M+" : "M") + scoreValue;
            evalClass = scoreValue > 0 ? "eval-positive" : "eval-negative";
        }

        if (multipv >= 1 && multipv <= maxTrackedMoves) {
            State.topMoveInfos[multipv] = {
                move: bestMove,
                evalText: evalText,
                evalClass: evalClass,
                depth: depth,
                rawCp: rawCp
            };
            UI.updateMove(multipv, bestMove, evalText, evalClass);
            if (State.showBestmoveArrows && !State.analysisMode) {
                UI.drawBestmoveArrows();
            }
        }

        checkAutoResign(scoreType, scoreValue);

        if (multipv === 1) {
            let oldPV = State.mainPVLine.join(" ");
            let newPV = pvMoves.join(" ");

            State.mainBestHistory.push({ move: bestMove, depth: depth, ts: Date.now() });
            if (State.mainBestHistory.length > 8) {
                State.mainBestHistory = State.mainBestHistory.slice(-8);
            }

            State.mainPVLine = pvMoves;
            State.principalVariation = newPV;
            State.lastTopMove1 = bestMove;
            State.lastEvalText1 = evalText;
            State.lastEvalClass1 = evalClass;
            State.currentEvaluation = rawCp;
            State._lastScoreInfo = {
                type: scoreType,
                value: scoreValue,
                display: evalText
            };

            UI.updateMove(1, bestMove, evalText, evalClass);
            UI.updateEvalBar(rawCp, mateVal, depth);
            ACPL.onNewEval(rawCp, mateVal);

            if (State.premoveEnabled) {
                let game = getGame();
                UI.updatePremoveChanceDisplay(game, rawCp, evalText, bestMove, 1);
            }

            if (!State.analysisMode && State.showPVArrows) {
                if (oldPV !== newPV || pvMoves[0] !== State.lastRenderedMainPV.split(" ")[0]) {
                    UI._removePVArrowsByType(false);
                    UI.drawPVArrows(pvMoves, State.mainPVTurn, false);
                }
            }

            UI.updatePVDisplay();
        }
    },

    _handleMainBestMove: function (data) {
        let tokens = data.split(" ");
        let finalMove = tokens[1];
        if (!finalMove || finalMove === "(none)") {
            State.isThinking = false;
            return;
        }

        let game = getGame();
        if (!isPlayersTurn(game)) {
            State.isThinking = false;
            State.statusInfo = "Waiting for opponent";
            UI.updateStatusInfo();
            return;
        }

        if (State.analysisMode) {
            State.isThinking = false;
            return;
        }

        finalMove = getMainConsensusMove(finalMove);

        if (State.evaluationMode === "human" && State.topMoves.length >= 2 && State.topMoves[1]) {
            let currentFen = getAccurateFen();
            if (State.topMovesFen === currentFen) {
                let level = ELO_LEVELS[State.humanLevel] || ELO_LEVELS.intermediate;
                let uniqueMoves = State.topMoves.filter(function (mv, idx, arr) {
                    return !!mv && arr.indexOf(mv) === idx;
                });
                let ourColor = getPlayingAs();
                let humanFallback = pickHumanFallbackMove(currentFen, uniqueMoves, level, ourColor);
                if (humanFallback && humanFallback !== finalMove) {
                    finalMove = humanFallback;
                }
            }
        }

        let fen = getAccurateFen();
        let currentPV = State.mainPVLine;
        let needsRedraw = false;

        if (currentPV.length === 0) {
            State.mainPVLine = [finalMove];
            State.principalVariation = finalMove;
            needsRedraw = true;
        } else if (currentPV[0] !== finalMove) {
            State.statusInfo = "Bestmove changed: " + currentPV[0] + " -> " + finalMove;
            UI.updateStatusInfo();
            State.mainPVLine = [finalMove].concat(currentPV.slice(1));
            State.principalVariation = State.mainPVLine.join(" ");
            needsRedraw = true;
        }

        State.lastRenderedMainPV = "";
        State.lastMainPVDrawTime = 0;

        if (!State.analysisMode && State.showPVArrows && needsRedraw) {
            UI._removePVArrowsByType(false);
            UI.drawPVArrows(State.mainPVLine, State.mainPVTurn, false);
        }

        UI.updatePVDisplay();
        MoveExecutor.recordMove(finalMove);

        if (State.autoMovePiece) executeAction(finalMove, fen);
        let Delay = getCalculatedDelay();
        State.isThinking = false;
        State.statusInfo = "Moving in " + (Delay / 1000).toFixed(1) + "s";
        UI.updateStatusInfo();
    },

    loadAnalysisEngine: function () {
        let self = this;
        try {
            if (self.analysis) {
                self.analysis.terminate();
                self.analysis = null;
            }
            let result = self._createWorker(self.analysisBlobURL);
            if (!result.worker) return false;
            self.analysis = result.worker;
            self.analysisBlobURL = result.blobURL;
            self._analysisLastActivityTs = Date.now();
            self.analysis.onmessage = function (e) {
                self._onAnalysisMessage(e.data);
            };
            self.analysis.onerror = function () { };
            setTimeout(function () {
                self.analysis.postMessage("uci");
                self.analysis.postMessage("setoption name MultiPV value 1");
                self.analysis.postMessage("ucinewgame");
                self.analysis.postMessage("isready");
            }, 100);
            State.statusInfo = "Analysis engine loaded";
            UI.updateStatusInfo();
            return true;
        } catch (e) {
            err("Analysis engine load failed:", e);
            return false;
        }
    },

    _onAnalysisMessage: function (data) {
        if (typeof data !== "string") return;
        this._analysisLastActivityTs = Date.now();
        if (!State.analysisMode) return;

        let currentFen = getAccurateFen();
        if (!currentFen) return;
        if (State._lastAnalysisFen && normalizeFen(currentFen) !== normalizeFen(State._lastAnalysisFen)) {
            State.statusInfo = "FEN changed during analysis, skipping update";
            UI.updateStatusInfo();
            return;
        }

        if (data.indexOf("info") === 0 && data.includes(" pv ")) {
            let tokens = data.split(" ");
            let pvIdx = tokens.indexOf("pv");
            let scoreIdx = tokens.indexOf("score");
            let depthIdx = tokens.indexOf("depth");
            if (pvIdx === -1 || scoreIdx === -1) return;

            let currentDepth = depthIdx !== -1 ? (parseInt(tokens[depthIdx + 1]) || 0) : 0;
            let scoreType = tokens[scoreIdx + 1];
            let scoreValue = parseInt(tokens[scoreIdx + 2]) || 0;

            let rawCp = scoreType === "cp" ? scoreValue :
            scoreType === "mate" ? (scoreValue > 0 ? CONFIG.MATE_VALUE : -CONFIG.MATE_VALUE) : 0;

            let pvMoves = tokens.slice(pvIdx + 1).filter(function (m) {
                return /^[a-h][1-8][a-h][1-8](?:[qrbn])?$/i.test(m);
            });

            if (pvMoves.length === 0) return;
            let bestMove = pvMoves[0];

            if (bestMove === State.analysisLastBestMove) State.analysisStableCount++;
            else {
                State.analysisLastBestMove = bestMove;
                State.analysisStableCount = 1;
            }
            State.analysisPrevEvalCp = State.analysisLastEvalCp;
            State.analysisLastEvalCp = rawCp;
            State.analysisGuardStateText = "Monitoring";
            UI.updateAnalysisMonitorDisplay();

            State.statusInfo = "Analysis D" + currentDepth + " | " + bestMove + " | PV: " + pvMoves.slice(0, 3).join(" ");
            UI.updateStatusInfo();
            if (currentDepth >= State._lastAnalysisDepth) {
                State._lastAnalysisDepth = currentDepth;
                State._lastAnalysisBestPV = pvMoves.slice();
                State._lastAnalysisBestMove = bestMove;
            }

            State.analysisPVLine = pvMoves;
            State.principalVariation = pvMoves.join(" ");
            State.currentEvaluation = rawCp;

            UI.updateAnalysisBar(rawCp);
            UI.clearAll();

            if (State.highlightEnabled) UI.highlightMove(bestMove, State.highlightColor2, true);
            if (State.showPVArrows) UI.drawPVArrows(pvMoves, State.analysisPVTurn, true);
            UI.updatePVDisplay();
        }

        if (data.indexOf("bestmove") === 0 && State.analysisMode) {
            let bmTokens = data.split(" ");
            let finalBestMove = bmTokens[1];

            if (finalBestMove && finalBestMove !== "(none)") {
                State.statusInfo = "Analysis: " + finalBestMove;
                UI.updateStatusInfo();

                if (State._lastAnalysisBestPV.length > 0 && State._lastAnalysisBestPV[0] === finalBestMove) {
                    State.analysisPVLine = State._lastAnalysisBestPV.slice();
                } else {
                    State.analysisPVLine = [finalBestMove];
                }

                State.principalVariation = State.analysisPVLine.join(" ");
                State.analysisPVTurn = getCurrentTurn(State._lastAnalysisFen || getAccurateFen());

                UI.clearAll();
                if (State.showPVArrows) UI.drawPVArrows(State.analysisPVLine, State.analysisPVTurn, true);
                if (State.highlightEnabled) UI.highlightMove(finalBestMove, State.highlightColor2, true);
                UI.updatePVDisplay();

                if (shouldAutoAnalysisMove(finalBestMove)) {
                    let delay = getCalculatedDelay();
                    State.currentDelayMs = delay;
                    let moveToPlay = finalBestMove;
                    setTimeout(function () {
                        if (shouldAutoAnalysisMove(moveToPlay)) {
                            MoveExecutor.movePiece(
                                moveToPlay.substring(0, 2),
                                moveToPlay.substring(2, 4),
                                moveToPlay.length > 4 ? moveToPlay.substring(4) : null
                            );
                        }
                    }, delay);
                }
            }

            State._lastAnalysisDepth = 0;
            State._lastAnalysisBestPV = [];
            State._lastAnalysisBestMove = null;
            State.isAnalysisThinking = false;
            State.statusInfo = "Ready";
            UI.updateStatusInfo();
            UI.updateAnalysisMonitorDisplay();
        }
    },

    loadPremoveEngine: function () {
        let self = this;
        try {

            if (self.premove) {
                self.premove.terminate();
                self.premove = null;
            }

            self._premoveProcessedFens.clear();
            self._premoveAttemptedFens.clear();
            self._premoveCandidates = Object.create(null);
            self._premoveProcessing = false;
            self._premoveEngineBusy = false;
            self._premoveLastFen = null;
            self._premoveLastActivityTs = Date.now();
            if (self._premoveTimeoutId) {
                clearTimeout(self._premoveTimeoutId);
                self._premoveTimeoutId = null;
            }

            let result = self._createWorker(self.premoveBlobURL);
            if (!result.worker) {
                err("Failed to create premove worker");
                return false;
            }

            self.premove = result.worker;
            self.premoveBlobURL = result.blobURL;

            self.premove.onmessage = function (e) {
                self._onPremoveMessage(e.data);
            };

            self.premove.onerror = function (workerErr) {
                err("Premove engine error:", workerErr);
                self._premoveEngineBusy = false;
                self._premoveProcessing = false;
            };

            setTimeout(function () {
                if (!self.premove) return;
                self.premove.postMessage("uci");
                self.premove.postMessage("setoption name MultiPV value 2");
                self.premove.postMessage("ucinewgame");
                self.premove.postMessage("isready");
            }, 100);

            log("[Engine] Premove engine loaded successfully");
            return true;
        } catch (e) {
            err("Premove engine load failed:", e);
            return false;
        }
    },

    _onPremoveMessage: function (data) {
        this._premoveLastActivityTs = Date.now();

        let releaseLock = () => {
            this._premoveProcessing = false;
            State.premoveAnalysisInProgress = false;
        };

        if (typeof data !== "string") {
            releaseLock();
            return;
        }

        if (State.analysisMode) {
            releaseLock();
            return;
        }

        const currentFen = getAccurateFen();
        if (!currentFen) {
            releaseLock();
            return;
        }

        const currentFenHash = hashFen(currentFen);

        if (this._premoveProcessedFens.has(currentFenHash)) {
            State.statusInfo = "[Premove] Already processed FEN: " + currentFenHash.substring(0, 30);
            releaseLock();
            return;
        }

        const game = getGame();
        if (game && isPlayersTurn(game)) {
            this._premoveProcessedFens.add(currentFenHash);
            releaseLock();
            return;
        }

        if (data.indexOf("info") === 0 && data.includes(" pv ")) {

            if (this._premoveProcessing) {
                return;
            }
            this._premoveProcessing = true;

            const tokens = data.split(" ");
            const pvIdx = tokens.indexOf("pv");
            const scoreIdx = tokens.indexOf("score");

            if (pvIdx === -1) {
                releaseLock();
                return;
            }

            const pvMoves = tokens.slice(pvIdx + 1).filter(m => /^[a-h][1-8][a-h][1-8]/i.test(m));
            if (pvMoves.length === 0) {
                releaseLock();
                return;
            }

            let scoreInfo = null;
            if (scoreIdx !== -1) {
                const type = tokens[scoreIdx + 1];
                const value = parseInt(tokens[scoreIdx + 2]);
                scoreInfo = {
                    type,
                    value,
                    display: type === 'mate' ? `M${value}` : (value / 100).toFixed(2)
                };
                State._lastPremoveScoreInfo = scoreInfo;
            }

            const ourColor = getPlayingAs();
            const stm = getCurrentTurn(currentFen);

            if (!ourColor || stm === ourColor) {
                releaseLock();
                return;
            }

            const ourUci = getOurMoveFromPV(pvMoves.join(" "), ourColor, stm);
            if (!ourUci) {
                releaseLock();
                return;
            }

            if (this._premoveProcessedFens.has(currentFenHash)) {
                releaseLock();
                return;
            }

            const multiPvIdx = tokens.indexOf("multipv");
            const multiPv = multiPvIdx !== -1 ? (parseInt(tokens[multiPvIdx + 1], 10) || 1) : 1;
            const candidateBucket = this._premoveCandidates[currentFenHash] || [];

            const existingCandidateIdx = candidateBucket.findIndex(function (c) {
                return c.multiPv === multiPv;
            });
            const candidatePayload = {
                multiPv: multiPv,
                ourUci: ourUci,
                pvMoves: pvMoves.slice(0, 6),
                scoreInfo: scoreInfo
            };
            if (existingCandidateIdx >= 0) candidateBucket[existingCandidateIdx] = candidatePayload;
            else candidateBucket.push(candidatePayload);
            this._premoveCandidates[currentFenHash] = candidateBucket;

            let selectedMove = ourUci;
            let selectedDecision = null;
            let selectedCandidate = null;
            const rankedCandidates = candidateBucket.slice().sort(function (a, b) {
                return a.multiPv - b.multiPv;
            }).slice(0, 2);

            for (let ci = 0; ci < rankedCandidates.length; ci++) {
                const candidate = rankedCandidates[ci];
                const decision = SmartPremove.shouldPremove(currentFen, candidate.ourUci, candidate.pvMoves, candidate.scoreInfo);
                if (!selectedDecision || (decision.allowed && (!selectedDecision.allowed || (decision.confidence || 0) > (selectedDecision.confidence || 0)))) {
                    selectedDecision = decision;
                    selectedMove = candidate.ourUci;
                    selectedCandidate = candidate;
                }
            }

            const decision = selectedDecision || SmartPremove.shouldPremove(currentFen, ourUci, pvMoves, scoreInfo);
            const finalScoreInfo = selectedCandidate ? selectedCandidate.scoreInfo : scoreInfo;

            const chanceEl = $("#premoveChanceDisplay");
            if (chanceEl) {
                let confidence = Math.round(decision.confidence || 0);
                let confColor = confidence >= 70 ? '#a6e3a1' : confidence <= 20 ? '#ff9800' : '#f9e2af';
                let safeEvalDisplay = escapeHtml(finalScoreInfo ? finalScoreInfo.display : '?');
                let safeReason = escapeHtml(decision.reason || '');

                let statusText = decision.allowed ?
                    `<strong>#Premove</strong> [Eval: <span style="color:#a6adc8;">${safeEvalDisplay}</span>] [Confidence: <span style="color:${confColor};">${confidence}%</span>]` :
                    `<span style="color:#ff9800;">BLOCKED: ${safeReason}</span>`;
                chanceEl.innerHTML = statusText;
            }

            const firstAttemptForFen = !this._premoveAttemptedFens.has(currentFenHash);
            if (firstAttemptForFen) {
                this._premoveAttemptedFens.add(currentFenHash);
                State.premoveStats.attempted++;
            }

            if (decision.allowed) {
                if (firstAttemptForFen) State.premoveStats.allowed++;

                this._premoveProcessedFens.add(currentFenHash);

                // CRITICAL: Aggressive cache cleanup to prevent memory leak in long games
                const MAX_ENGINE_CACHE = Math.min(10, CONFIG.PREMOVE.MAX_EXECUTED_FENS || 50);
                if (this._premoveProcessedFens.size > MAX_ENGINE_CACHE) {
                    const toDelete = this._premoveProcessedFens.size - Math.floor(MAX_ENGINE_CACHE * 0.6);
                    for (let i = 0; i < toDelete; i++) {
                        const iter = this._premoveProcessedFens.values();
                        const first = iter.next().value;
                        if (first) this._premoveProcessedFens.delete(first);
                    }
                }

                SmartPremove.execute(currentFen, selectedMove, decision).then(success => {
                    if (!success) {

                        this._premoveProcessedFens.delete(currentFenHash);
                        State.premoveStats.failed++;
                    } else {
                        State.premoveStats.executed++;
                    }

                    UI.updatePremoveStatsDisplay();
                    releaseLock();

                }).catch(() => {
                    this._premoveProcessedFens.delete(currentFenHash);
                    State.premoveStats.failed++;
                    UI.updatePremoveStatsDisplay();
                    releaseLock();
                });
            } else {
                if (firstAttemptForFen) State.premoveStats.blocked++;
                State.statusInfo = `Premove: ${decision.reason}`;
                UI.updateStatusInfo();
                UI.updatePremoveStatsDisplay();

                this._premoveProcessedFens.add(currentFenHash);
                releaseLock();
            }
        }

        if (data.indexOf("bestmove") === 0) {
            this._premoveEngineBusy = false;
            releaseLock();
            if (this._premoveTimeoutId) {
                clearTimeout(this._premoveTimeoutId);
                this._premoveTimeoutId = null;
            }

            const tokens = data.split(" ");
            const bestMove = tokens[1];

            if (!bestMove || bestMove === "(none)") return;

            if (!this._premoveProcessedFens.has(currentFenHash) && !premoveInFlight) {
                State.statusInfo = "[Premove] Got bestmove but no execution yet, waiting for PV...";
            }
        }
    },

    resetPremoveState: function () {
        log("[Engine] Resetting premove state");
        this._premoveProcessedFens.clear();
        this._premoveAttemptedFens.clear();
        this._premoveCandidates = Object.create(null);
        this._premoveProcessing = false;
        this._premoveEngineBusy = false;
        this._premoveLastFen = null;
        this._premoveLastActivityTs = Date.now();
        premoveSafetyCache.clear();
        if (this._premoveTimeoutId) {
            clearTimeout(this._premoveTimeoutId);
            this._premoveTimeoutId = null;
        }
        if (this.premove) {
            this.premove.postMessage("stop");
            this.premove.postMessage("ucinewgame");
        }
    },

    selfHealPremove: function (reason) {
        warn("[Engine] Self-healing premove:", reason || "unknown");
        try {
            if (this._premoveTimeoutId) {
                clearTimeout(this._premoveTimeoutId);
                this._premoveTimeoutId = null;
            }

            if (this.premove) {
                try {
                    this.premove.terminate();
                } catch (e) { }
                this.premove = null;
            }

            this._premoveProcessing = false;
            this._premoveEngineBusy = false;
            this._premoveLastFen = null;
            this._premoveLastActivityTs = Date.now();
            State.premoveAnalysisInProgress = false;

            this.loadPremoveEngine();
        } catch (e) {
            err("[Engine] selfHealPremove failed:", e);
        }
    },

    selfHealMain: function (reason) {
        warn("[Engine] Self-healing main:", reason || "unknown");
        try {
            this.stop();
            this._ready = false;
            this._mainLastActivityTs = Date.now();

            if (this.main) {
                try {
                    this.main.terminate();
                } catch (e) { }
                this.main = null;
            }

            this.loadMainEngine().then(function (ok) {
                if (!ok) {
                    err("[Engine] selfHealMain reload failed");
                }
            });
        } catch (e) {
            err("[Engine] selfHealMain failed:", e);
        }
    },

    selfHealAnalysis: function (reason) {
        warn("[Engine] Self-healing analysis:", reason || "unknown");
        try {
            State.isAnalysisThinking = false;
            this._analysisLastActivityTs = Date.now();

            if (this.analysis) {
                try {
                    this.analysis.terminate();
                } catch (e) { }
                this.analysis = null;
            }

            if (State.analysisMode) {
                const ok = this.loadAnalysisEngine();
                if (!ok) {
                    err("[Engine] selfHealAnalysis reload failed");
                    return;
                }
                State._lastAnalysisFen = null;
            }
        } catch (e) {
            err("[Engine] selfHealAnalysis failed:", e);
        }
    },

    reloadAllEngines: function () {
        let self = this;

        return new Promise(function (resolve) {
            console.log("[Engine] 🔄 Starting full reload sequence...");

            self.stop();
            if (self.analysis) self.analysis.postMessage("stop");
            if (self.premove) self.premove.postMessage("stop");

            setTimeout(function () {

                self._terminateAllWorkers();

                self._revokeAllBlobURLs();

                self._resetAllEngineState();

                console.log("[Engine] Re-initializing main engine...");
                self.init().then(function (mainOk) {
                    if (!mainOk) {
                        console.error("[Engine] ❌ Main engine failed");
                        resolve(false);
                        return;
                    }
                    console.log("[Engine] ✅ Main engine ready");

                    if (State.analysisMode) {
                        console.log("[Engine] Loading analysis engine...");
                        let analysisOk = self.loadAnalysisEngine();
                        console.log("[Engine]", analysisOk ? "✅ Analysis ready" : "❌ Analysis failed");
                    }

                    if (State.premoveEnabled) {
                        console.log("[Engine] Loading premove engine...");
                        let premoveOk = self.loadPremoveEngine();
                        console.log("[Engine]", premoveOk ? "✅ Premove ready" : "❌ Premove failed");
                    }

                    let led = $("#engine-status-led");
                    if (led && self._ready) led.classList.add("active");

                    console.log("[Engine] 🎉 Full reload complete!");
                    resolve(true);
                });
            }, 500);
        });
    },

    _terminateAllWorkers: function () {
        console.log("[Engine] Terminating workers...");

        [this.main, this.analysis, this.premove].forEach(function (worker, idx) {
            if (worker) {
                try {
                    worker.terminate();
                    console.log("[Engine] Terminated:", ["Main", "Analysis", "Premove"][idx]);
                } catch (e) {
                    console.warn("[Engine] Error terminating:", e);
                }
            }
        });

        this.main = null;
        this.analysis = null;
        this.premove = null;
        this._ready = false;
    },

    _revokeAllBlobURLs: function () {
        console.log("[Engine] Revoking blob URLs...");

        [this.mainBlobURL, this.analysisBlobURL, this.premoveBlobURL].forEach(function (url, idx) {
            if (url) {
                try {
                    URL.revokeObjectURL(url);
                    console.log("[Engine] Revoked:", ["Main", "Analysis", "Premove"][idx]);
                } catch (e) {
                    console.warn("[Engine] Error revoking:", e);
                }
            }
        });

        this.mainBlobURL = null;
        this.analysisBlobURL = null;
        this.premoveBlobURL = null;
    },

    _resetAllEngineState: function () {
        console.log("[Engine] Resetting state...");

        this._premoveEngineBusy = false;
        this._premoveProcessing = false;
        this._premoveProcessedFens.clear();
        this._premoveAttemptedFens.clear();
        this._premoveCandidates = Object.create(null);
        this._premoveLastFen = null;
        this._premoveLastActivityTs = Date.now();

        if (this._premoveTimeoutId) {
            clearTimeout(this._premoveTimeoutId);
            this._premoveTimeoutId = null;
        }

        SmartPremove.resetExecutionTracking();

        clearPremoveCaches();

        State.isThinking = false;
        State.isAnalysisThinking = false;
        State.premoveAnalysisInProgress = false;
        State.premoveExecutedForFen = null;
        State.statusInfo = "Engines reset";
        UI.updateStatusInfo();
    },

    terminate: function () {
        let urls = [this.mainBlobURL, this.analysisBlobURL, this.premoveBlobURL];
        urls.forEach(function (url) {
            if (url) {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) { }
            }
        });
        this.mainBlobURL = null;
        this.analysisBlobURL = null;
        this.premoveBlobURL = null;

        if (this.main) {
            this.main.terminate();
            this.main = null;
        }
        if (this.analysis) {
            this.analysis.terminate();
            this.analysis = null;
        }
        if (this.premove) {
            this.premove.terminate();
            this.premove = null;
        }

        this._premoveProcessedFens.clear();
        this._premoveAttemptedFens.clear();
        this._premoveCandidates = Object.create(null);
        this._premoveProcessing = false;
        this._premoveEngineBusy = false;
    }
};

function isHumanCriticalPosition(fen, ourColor) {
    if (!fen || !ourColor) return false;

    let oppColor = ourColor === "w" ? "b" : "w";
    let ourKing = findKing(fen, ourColor);
    if (ourKing) {
        let kingAttackers = getAttackersOfSquare(fen, ourKing, oppColor).length;
        if (kingAttackers >= (CONFIG.HUMAN.CRITICAL_KING_ATTACKERS || 1)) {
            return true;
        }
    }

    let score = State._lastScoreInfo;
    if (score && score.type === "mate" && score.value < 0 && Math.abs(score.value) <= (CONFIG.HUMAN.CRITICAL_MATE_PLY || 8)) {
        return true;
    }
    if (score && score.type === "cp" && score.value <= (CONFIG.HUMAN.CRITICAL_CP_THRESHOLD || -120)) {
        return true;
    }

    return false;
}

function getHumanLevelTuning(levelName) {
    let tunings = (CONFIG.HUMAN && CONFIG.HUMAN.LEVEL_TUNING) ? CONFIG.HUMAN.LEVEL_TUNING : null;
    if (!tunings) {
        return { errorMult: 1, blunderMult: 1, criticalErrorMult: 0.55, criticalBlunderMult: 0.20, safetyRiskCap: 60 };
    }
    return tunings[levelName] || tunings.intermediate ||
        { errorMult: 1, blunderMult: 1, criticalErrorMult: 0.55, criticalBlunderMult: 0.20, safetyRiskCap: 60 };
}

function filterHumanCandidatesBySafety(fen, candidates, ourColor, riskCap) {
    if (!fen || !ourColor || !Array.isArray(candidates)) return [];
    let cap = typeof riskCap === "number" ? riskCap : 60;

    return candidates.filter(function (mv) {
        let safety = checkPremoveSafety(fen, mv, ourColor);
        return safety && safety.riskLevel < cap;
    });
}

function pickHumanFallbackMove(fen, uniqueMoves, level, ourColor) {
    if (!Array.isArray(uniqueMoves) || uniqueMoves.length < 2) return null;

    let critical = isHumanCriticalPosition(fen, ourColor);
    let tuning = getHumanLevelTuning(State.humanLevel || "intermediate");
    let errorRate = clamp((level.errorRate || 0) * (tuning.errorMult || 1), 0, 1);
    let blunderRate = clamp((level.blunderRate || 0) * (tuning.blunderMult || 1), 0, 1);
    let safetyRiskCap = clamp(tuning.safetyRiskCap || 60, 30, 90);
    let debug = !!(CONFIG.HUMAN && CONFIG.HUMAN.DEBUG_DECISION);
    let selected = null;

    if (critical) {
        errorRate = clamp(errorRate * (tuning.criticalErrorMult || 0.55), 0, 1);
        blunderRate = clamp(blunderRate * (tuning.criticalBlunderMult || 0.20), 0, 1);
    }

    let softCandidates = uniqueMoves.slice(1, Math.min(3, uniqueMoves.length));
    let blunderCandidates = uniqueMoves.slice(3);
    if (blunderCandidates.length === 0 && uniqueMoves[2]) {
        blunderCandidates = [uniqueMoves[2]];
    }

    if (critical) {
        let safeSoft = filterHumanCandidatesBySafety(fen, softCandidates, ourColor, safetyRiskCap);
        if (safeSoft.length > 0) softCandidates = safeSoft;

        let safeBlunders = filterHumanCandidatesBySafety(fen, blunderCandidates, ourColor, safetyRiskCap);
        if (safeBlunders.length > 0) blunderCandidates = safeBlunders;
    } else if (State.humanLevel === "advanced" || State.humanLevel === "expert") {
        // Higher levels avoid obviously unsafe blunder candidates even in normal positions.
        let saferBlunders = filterHumanCandidatesBySafety(fen, blunderCandidates, ourColor, safetyRiskCap);
        if (saferBlunders.length > 0) blunderCandidates = saferBlunders;
    }

    if (blunderCandidates.length > 0 && Math.random() < blunderRate) {
        selected = blunderCandidates[randomInt(0, blunderCandidates.length - 1)];
        if (debug) {
            log("[HumanMode] blunder pick", selected, "critical=", critical, "level=", State.humanLevel,
                "blunderRate=", blunderRate.toFixed(3), "riskCap=", safetyRiskCap);
        }
        return selected;
    }

    if (softCandidates.length > 0 && Math.random() < errorRate) {
        selected = softCandidates[randomInt(0, softCandidates.length - 1)];
        if (debug) {
            log("[HumanMode] soft pick", selected, "critical=", critical, "level=", State.humanLevel,
                "errorRate=", errorRate.toFixed(3), "riskCap=", safetyRiskCap);
        }
        return selected;
    }

    if (debug) {
        log("[HumanMode] keep best", uniqueMoves[0], "critical=", critical,
            "level=", State.humanLevel,
            "errorRate=", errorRate.toFixed(3), "blunderRate=", blunderRate.toFixed(3),
            "riskCap=", safetyRiskCap);
    }

    return null;
}

// =====================================================
// Section 24: Auto Analysis Functions
// =====================================================
function shouldAutoAnalysisMove(bestMoveCandidate) {
    if (!State.analysisMode || State.autoAnalysisColor === "none") return false;
    let fen = getAccurateFen();
    if (!fen) return false;
    let turn = getCurrentTurn(fen);
    let colorMatch = (State.autoAnalysisColor === "white" && turn === "w") ||
        (State.autoAnalysisColor === "black" && turn === "b");
    if (!colorMatch) return false;

    // Require a stable bestmove before auto-playing in analysis mode.
    if (State.analysisStableCount < (State.analysisMinStableUpdates || 2)) {
        State.analysisGuardStateText = "Waiting stability";
        UI.updateAnalysisMonitorDisplay();
        return false;
    }

    if (bestMoveCandidate && State.analysisLastBestMove && bestMoveCandidate !== State.analysisLastBestMove) {
        State.analysisGuardStateText = "Bestmove changed";
        UI.updateAnalysisMonitorDisplay();
        return false;
    }

    // Basic blunder guard: skip if eval suddenly drops hard.
    if (State.analysisBlunderGuard && typeof State.analysisPrevEvalCp === "number" && typeof State.analysisLastEvalCp === "number") {
        if ((State.analysisLastEvalCp - State.analysisPrevEvalCp) < -120) {
            State.analysisGuardStateText = "Blocked by blunder guard";
            UI.updateAnalysisMonitorDisplay();
            return false;
        }
    }

    State.analysisGuardStateText = "Guard OK";
    UI.updateAnalysisMonitorDisplay();
    return true;
}

function getMainConsensusMove(fallbackMove) {
    if (!State.useMainConsensus) return fallbackMove;
    let history = State.mainBestHistory || [];
    if (!history.length) return fallbackMove;

    let recent = history.slice(-6).filter(function (h) { return h.depth >= 8; });
    if (recent.length < 3) return fallbackMove;

    let counts = Object.create(null);
    recent.forEach(function (h) {
        counts[h.move] = (counts[h.move] || 0) + 1;
    });

    let best = fallbackMove;
    let bestCount = 0;
    Object.keys(counts).forEach(function (mv) {
        if (counts[mv] > bestCount) {
            best = mv;
            bestCount = counts[mv];
        }
    });

    if (best && bestCount >= 3 && best !== fallbackMove) {
        State.statusInfo = "Consensus move selected: " + best + " (" + bestCount + "/" + recent.length + ")";
        UI.updateStatusInfo();
        return best;
    }

    return fallbackMove;
}

// =====================================================
// Section 25: Stealth Move Executor (v4.0, Fixed)
// =====================================================
let MoveExecutor = {
    _squareCache: new Map(),
    _lastBoardRect: null,
    _lastFlipped: null,

    recordMove: function (moveStr) {
        if (!moveStr || moveStr.length < 4) return;
        let from = moveStr.substring(0, 2);
        let to = moveStr.substring(2, 4);
        UI.highlightBestMove(from, to);

        let currentMoveTime = null;
        if (State.moveStartTime && State.moveStartTime > 0) {
            currentMoveTime = Date.now() - State.moveStartTime;
            State.moveStartTime = 0;
        } else if (TimeManager.moveTimes && TimeManager.moveTimes.length > 0) {
            currentMoveTime = TimeManager.moveTimes[TimeManager.moveTimes.length - 1];
        } else if (State.currentDelayMs && State.currentDelayMs > 0) {
            currentMoveTime = State.currentDelayMs;
        }

        MoveHistory.add(moveStr, State.lastEvalText1, State.customDepth, State.lastMoveGrade, currentMoveTime);
    },

    movePiece: function (from, to, promotion) {
        let self = this;
        promotion = promotion || "q";
        let beforeFen = getAccurateFen();

        let isPromo = self._isPromotion(from, to, beforeFen);
        if (isPromo) return self._handlePromotionOld(from, to, beforeFen);

        if (State.moveExecutionMode === "drag") {
            return self._executeHumanizedMove(from, to, beforeFen);
        } else {
            return self._clickMoveClassic(from, to, beforeFen);
        }
    },

    _clickMoveClassic: function (from, to, beforeFen) {
        let self = this;
        let fromCenter = self._getSquareXY(from, true);
        let toCenter = self._getSquareXY(to, true);

        if (!fromCenter || !toCenter) {
            console.error("[ChessAssistant] Cannot get square coordinates:", from, to);
            return Promise.resolve(false);
        }

        let board = getBoardElement();
        if (!board) return Promise.resolve(false);

        this._squareCache.clear();

        return self._dispatchAt(fromCenter, "pointerdown", board)
            .then(() => sleep(20))
            .then(() => self._dispatchAt(fromCenter, "pointerup", board))
            .then(() => sleep(50))
            .then(() => self._dispatchAt(toCenter, "pointerdown", board))
            .then(() => sleep(20))
            .then(() => self._dispatchAt(toCenter, "pointerup", board))
            .then(() => true)
            .catch(function (e) {
                warn("Click strategy failed:", e);
                return false;
            }).then(function (success) {
                if (!success) return false;
                return self._waitFenChange(beforeFen, 1500);
            });
    },

    _executeHumanizedMove: function (from, to, beforeFen) {
        let self = this;
        let moveDuration = self._calculateMoveDuration(from, to);
        let steps = self._generateBezierPath(from, to, moveDuration);
        self._squareCache.clear();

        return new Promise(function (resolve) {
            let stepIndex = 0;

            function nextStep() {
                if (stepIndex >= steps.length) {
                    setTimeout(function () {
                        self._dispatchAt(steps[steps.length - 1], "pointerup")
                            .then(() => resolve(true))
                            .catch(() => resolve(false));
                    }, randomInt(250, 500));
                    return;
                }

                let point = steps[stepIndex];
                let eventType = stepIndex === 0 ? "pointerdown" :
                stepIndex === steps.length - 1 ? "pointerup" : "pointermove";

                self._dispatchAt(point, eventType).then(function () {
                    stepIndex++;

                    let delay = Math.floor(moveDuration / steps.length);
                    delay = Math.max(15, Math.min(40, delay));

                    setTimeout(nextStep, delay);
                }).catch(function () {
                    resolve(false);
                });
            }
            nextStep();
        }).then(function (success) {
            if (!success) return false;
            return self._waitFenChange(beforeFen, 1500);
        });
    },

    _calculateMoveDuration: function (from, to) {
        let fromFile = from.charCodeAt(0) - 97;
        let fromRank = parseInt(from[1]);
        let toFile = to.charCodeAt(0) - 97;
        let toRank = parseInt(to[1]);

        let distance = Math.sqrt(Math.pow(toFile - fromFile, 2) + Math.pow(toRank - fromRank, 2));

        let baseDuration = 200 + (distance * 100);
        let variance = (Math.random() - 0.5) * 80;

        if (TimeManager.isTimePressure) baseDuration *= 0.75;

        return Math.max(120, Math.min(1200, baseDuration + variance));
    },

    _generateBezierPath: function (from, to, duration) {
        let fromXY = this._getSquareXY(from);
        let toXY = this._getSquareXY(to);
        if (!fromXY || !toXY) return [fromXY, toXY];

        let midX = (fromXY.x + toXY.x) / 2 + (Math.random() - 0.5) * 20;
        let midY = (fromXY.y + toXY.y) / 2 + (Math.random() - 0.5) * 20;

        let points = [];
        let steps = Math.min(40, Math.max(3, Math.floor(duration / 20)));

        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            t = t * t * (3 - 2 * t); // smoothstep easing

            let x = (1 - t) * (1 - t) * fromXY.x + 2 * (1 - t) * t * midX + t * t * toXY.x;
            let y = (1 - t) * (1 - t) * fromXY.y + 2 * (1 - t) * t * midY + t * t * toXY.y;

            x += (Math.random() - 0.5) * 0.5;
            y += (Math.random() - 0.5) * 0.5;

            points.push({ x, y });
        }
        return points;
    },

    _clickMove: function (from, to) {
        // Premove always uses click execution to avoid drag-mode side effects.
        return this._clickMoveClassic(from, to, getAccurateFen());
    },

    _dispatchAt: function (pos, type, fallbackEl) {
        return new Promise(function (resolve) {
            let el = document.elementFromPoint(pos.x, pos.y) || fallbackEl;
            if (!el) { resolve(); return; }

            let isDown = type.includes("down");
            let isMove = type.includes("move");

            let options = {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: pos.x,
                clientY: pos.y,
                button: 0,
                buttons: isDown ? 1 : (isMove ? 1 : 0),
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                pressure: isDown ? 0.5 : (isMove ? 0.3 : 0),
                tiltX: (Math.random() - 0.5) * 10,
                tiltY: (Math.random() - 0.5) * 10
            };

            try {
                el.dispatchEvent(new PointerEvent(type, options));
                if (type === "pointerdown") el.dispatchEvent(new MouseEvent("mousedown", options));
                else if (type === "pointerup") {
                    el.dispatchEvent(new MouseEvent("mouseup", options));
                    el.dispatchEvent(new MouseEvent("click", options));
                } else if (type === "pointermove") el.dispatchEvent(new MouseEvent("mousemove", options));
            } catch (e) { }
            resolve();
        });
    },

    _getSquareXY: function (square, addOffset) {
        let board = getBoardElement();
        if (!board) return null;

        let useCache = addOffset !== false;
        let cacheKey = square + (isBoardFlipped() ? "_f" : "_n");
        if (useCache && this._squareCache.has(cacheKey)) return this._squareCache.get(cacheKey);

        let rect = board.getBoundingClientRect();
        let file = square.charCodeAt(0) - 97;
        let rank = parseInt(square.charAt(1)) - 1;

        let flipped = isBoardFlipped();
        let squareSize = rect.width / 8;

        let xIdx, yIdx;
        if (flipped) {
            xIdx = 7 - file;
            yIdx = rank;
        } else {
            xIdx = file;
            yIdx = 7 - rank;
        }

        let offsetX = 0, offsetY = 0;
        if (addOffset !== false) {
            offsetX = (Math.random() - 0.5) * squareSize * 0.6;
            offsetY = (Math.random() - 0.5) * squareSize * 0.6;
        }

        let result = {
            x: rect.left + (xIdx + 0.5) * squareSize + offsetX,
            y: rect.top + (yIdx + 0.5) * squareSize + offsetY
        };

        if (useCache) this._squareCache.set(cacheKey, result);
        return result;
    },

    _waitFenChange: function (prevFen, timeout) {
        let start = Date.now();
        let check = function () {
            if (Date.now() - start >= timeout) return Promise.resolve(false);
            let current = getAccurateFen();
            if (current !== prevFen) return Promise.resolve(true);
            return sleep(50).then(check);
        };
        return check();
    },

    _handlePromotionOld: function (from, to, beforeFen) {
        let self = this;
        let gameBoard = document.querySelector("chess-board") || document.querySelector(".board");
        let game = null;
        if (gameBoard) game = gameBoard.game || null;
        if (!game) {
            try { game = window.board && window.board.game ? window.board.game : null; } catch (e) { }
        }
        if (!game) {
            try { game = window.game || null; } catch (e) { }
        }

        if (game && typeof game.move === "function") {
            try {
                game.move({ from: from, to: to, promotion: "q", animate: true, userGenerated: true });
                return self._waitFenChange(beforeFen, 2000);
            } catch (e) {
                warn("Internal API promotion failed:", e);
            }
        }

        return self._clickMoveClassic(from, to, beforeFen).then(function (clicked) {
            if (!clicked) return false;
            return self._waitFenChange(beforeFen, 1500).then(function (changed) {
                if (changed) {
                    return self._handlePromotionDialog().then(function () { return true; });
                }
                return self._handlePromotionDialog().then(function () {
                    return self._waitFenChange(beforeFen, 2000);
                });
            });
        });
    },

    _isPromotion: function (from, to, fen) {
        if (!fen) return false;
        let piece = this._getPieceAt(from, fen);
        if (!piece) return false;
        let rankTo = parseInt(to.charAt(1));
        return (piece === "P" && rankTo === 8) || (piece === "p" && rankTo === 1);
    },

    _getPieceAt: function (square, fen) {
        if (!fen || !square) return null;
        let rows = fen.split(" ")[0].split("/");
        let file = square.charCodeAt(0) - 97;
        let rank = 8 - parseInt(square.charAt(1));
        if (rank < 0 || rank > 7 || file < 0 || file > 7) return null;
        let col = 0;
        for (let i = 0; i < rows[rank].length; i++) {
            let ch = rows[rank][i];
            if (/\d/.test(ch)) {
                col += parseInt(ch);
            } else {
                if (col === file) return ch;
                col++;
            }
        }
        return null;
    },

    _handlePromotionDialog: function () {
        let attempts = 0;
        let maxAttempts = 20;
        let self = this;

        let tryClick = function () {
            if (attempts >= maxAttempts) return Promise.resolve(false);
            attempts++;

            let queenBtn =
                document.querySelector(".promotion-piece[data-piece=\"q\"]") ||
                document.querySelector(".promotion-piece.wq") ||
                document.querySelector(".promotion-piece.bq") ||
                document.querySelector("[data-cy=\"promotion-queen\"]") ||
                document.querySelector(".promotion-window .promotion-piece:first-child") ||
                document.querySelector(".board-promotion-piece-q") ||
                document.querySelector(".promotion-piece[data-piece='queen']");

            if (!queenBtn) {
                let allPromo = document.querySelectorAll(".promotion-piece, [class*=\"promotion\"]");
                for (let i = 0; i < allPromo.length; i++) {
                    let cls = allPromo[i].className.toLowerCase();
                    let attr = (allPromo[i].getAttribute("data-piece") || "").toLowerCase();
                    if (cls.includes("queen") || cls.includes("wq") ||
                        cls.includes("bq") || attr === "q" || attr === "queen") {
                        queenBtn = allPromo[i];
                        break;
                    }
                }
            }

            if (queenBtn) {
                let rect = queenBtn.getBoundingClientRect();
                let centerX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 10;
                let centerY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 10;

                let opts = { bubbles: true, cancelable: true, clientX: centerX, clientY: centerY };
                queenBtn.dispatchEvent(new MouseEvent("mousedown", opts));
                queenBtn.dispatchEvent(new MouseEvent("mouseup", opts));
                queenBtn.dispatchEvent(new MouseEvent("click", opts));
                return Promise.resolve(true);
            }

            return sleep(100).then(tryClick);
        };

        return tryClick();
    }
};

// =====================================================
// Section 26: Auto Move Execution
// =====================================================
function executeAction(selectedUci, analysisFen) {
    if (!selectedUci || selectedUci.length < 4) return;
    let from = selectedUci.substring(0, 2);
    let to = selectedUci.substring(2, 4);
    let promotionChar = selectedUci.length >= 5 ? selectedUci[4] : null;

    if (!State.autoMovePiece) return;

    let game = getGame();
    if (!game || !isPlayersTurn(game)) {
        State.statusInfo = "Waiting for opponent";
        UI.updateStatusInfo();
        return;
    }

    cancelPendingMove();

    let Delay = getCalculatedDelay();
    State.moveStartTime = Date.now();
    State.statusInfo = "Moving in " + (Delay / 1000).toFixed(1) + "s";
    UI.updateStatusInfo();

    pendingMoveTimeoutId = setTimeout(function () {
        let freshGame = getGameController();
        if (!freshGame || !isPlayersTurn(freshGame)) {
            State.statusInfo = "Move canceled (not our turn)";
            UI.updateStatusInfo();
            return;
        }
        let currentFen = getAccurateFen();
        if (currentFen !== analysisFen) {
            State.statusInfo = "Move canceled (position changed)";
            UI.updateStatusInfo();
            return;
        }
        State.statusInfo = "Making move...";
        UI.updateStatusInfo();
        MoveExecutor.movePiece(from, to, promotionChar).then(function (success) {
            State.statusInfo = success ? "Move made!" : "Move failed";
            UI.updateStatusInfo();
            if (!success) {
                setTimeout(function () {
                    if (State.autoRun && isPlayersTurn(getGame())) runEngineNow();
                }, 800);
            }
        });
    }, Delay);
}

// =====================================================
// Section 27: ACPL Tracking
// =====================================================
let ACPL = {
    onNewEval: function (newCp, mateVal) {
        if (!State.acplInitialized) {
            State.previousEvaluation = newCp;
            State.acplInitialized = true;
            return;
        }
        let fen = getAccurateFen();
        if (!fen) return;
        let turnToMove = getCurrentTurn(fen);
        let whoJustMoved = turnToMove === "w" ? "b" : "w";
        let cpl = 0;
        if (whoJustMoved === "w") {
            cpl = Math.max(0, State.previousEvaluation - newCp);
        } else {
            cpl = Math.max(0, newCp - State.previousEvaluation);
        }
        State.lastMoveGrade = this._grade(cpl, mateVal !== null);
        let prevIsMate = Math.abs(State.previousEvaluation) >= CONFIG.MATE_VALUE;
        let curIsMate = Math.abs(newCp) >= CONFIG.MATE_VALUE;
        if (!prevIsMate && !curIsMate) {
            if (whoJustMoved === "w") {
                State.totalCplWhite += cpl;
                State.cplMoveCountWhite++;
                State.acplWhite = (State.totalCplWhite / State.cplMoveCountWhite / 100).toFixed(2);
            } else {
                State.totalCplBlack += cpl;
                State.cplMoveCountBlack++;
                State.acplBlack = (State.totalCplBlack / State.cplMoveCountBlack / 100).toFixed(2);
            }
        }
        State.previousEvaluation = newCp;
        UI.updateACPL();
    },

    _grade: function (cpl, isMateRelated) {
        if (isMateRelated || cpl === 0) return "Terbaik";
        if (cpl < 20) return "Terbaik";
        if (cpl < 50) return "Bagus";
        if (cpl < 100) return "Cukup Baik";
        if (cpl < 200) return "Tidak Akurat";
        if (cpl < 400) return "Kesalahan";
        return "Blunder";
    },

    reset: function () {
        State.totalCplWhite = 0;
        State.cplMoveCountWhite = 0;
        State.acplWhite = "0.00";
        State.totalCplBlack = 0;
        State.cplMoveCountBlack = 0;
        State.acplBlack = "0.00";
        State.previousEvaluation = 0;
        State.acplInitialized = false;
        State.lastMoveGrade = "Book";
        lastFenProcessedMain = "";
        lastFenProcessedPremove = "";
        clearPremoveCaches();
        UI.updateACPL();
    }
};

// =====================================================
// Section 28: Opening Book Management
// =====================================================
function weightedRandomMove(movesObj) {
    if (!movesObj) return null;
    let total = Object.values(movesObj).reduce((a, b) => a + (typeof b === 'number' ? b : (b.weight || 0)), 0);
    if (total === 0) return Object.keys(movesObj)[0] || null;
    let rand = Math.random() * total;
    for (let move in movesObj) {
        let weight = typeof movesObj[move] === 'number' ? movesObj[move] : (movesObj[move].weight || 0);
        rand -= weight;
        if (rand < 0) return move;
    }
    return Object.keys(movesObj)[0] || null;
}

let OpeningBook = {
    _noEpIndex: null,
    _firstMoveNames: {
        e2e4: "King's Pawn Opening",
        d2d4: "Queen's Pawn Game",
        c2c4: "English Opening",
        g1f3: "Réti Opening",
        f2f4: "Bird's Opening",
        b2b3: "Nimzowitsch-Larsen Attack",
        b2b4: "Polish Opening",
        g2g3: "King's Indian Attack"
    },
    _buildNoEpIndex: function () {
        if (this._noEpIndex) return;
        this._noEpIndex = new Map();
        let keys = Object.keys(OPENING_BOOK);
        for (let i = 0; i < keys.length; i++) {
            let parts = keys[i].split(" ");
            let key3 = parts.slice(0, 3).join(" ");
            if (!this._noEpIndex.has(key3)) {
                this._noEpIndex.set(key3, OPENING_BOOK[keys[i]]);
            }
        }
    },
    _getOpeningName: function (fen, move, history) {
        if (!move) return "Book Move";

        if (OPENING_NAMES[move]) {
            return OPENING_NAMES[move];
        }

        let startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
        if (normalizeFen(fen) === startFen && this._firstMoveNames[move]) {
            return this._firstMoveNames[move];
        }

        if (Array.isArray(history) && history.length > 0) {
            let firstMove = history[0];
            if (firstMove && this._firstMoveNames[firstMove]) {
                return this._firstMoveNames[firstMove];
            }
        }

        return "Book Move";
    },
    getMove: function (fen, history) {
        if (!State.useOpeningBook || !fen) return null;

        let notationMove = this.getNotationMove(history);
        if (notationMove) {
            let display = $("#currentOpeningDisplay");
            if (display) {
                display.textContent = "Notation Book";
                display.style.color = "#FFD700";
            }
            State.statusInfo = "Notation move: " + notationMove;
            UI.updateStatusInfo();
            return notationMove;
        }

        let key = normalizeFen(fen);
        let movesObj = OPENING_BOOK[key];

        if (!movesObj) {
            this._buildNoEpIndex();
            let parts = fen.split(" ");
            let key3 = parts.slice(0, 3).join(" ");
            movesObj = this._noEpIndex.get(key3);
        }

        if (!movesObj) return null;

        let move = weightedRandomMove(movesObj);
        if (!move) return null;

        let name = this._getOpeningName(fen, move, history);
        let display = $("#currentOpeningDisplay");
        if (display) {
            display.textContent = name;
            display.style.color = "#1E90FF";
        }
        State.statusInfo = "Opening book move: " + move + " (" + name + ")";
        UI.updateStatusInfo();
        return move;
    },
    getNotationMove: function (history) {
        if (!State.notationSequence || !history || history.length === 0) return null;

        let sequence = State.notationSequence.replace(/\d+\./g, " ").trim().split(/\s+/);
        if (sequence.length === 0) return null;

        for (let i = 0; i < history.length; i++) {
            if (i >= sequence.length || history[i] !== sequence[i]) {
                return null;
            }
        }

        if (history.length < sequence.length) {
            return sequence[history.length];
        }
        return null;
    }
};

// =====================================================
// Section 29: Move History and Records
// =====================================================
let MoveHistory = {
    add: function (move, evalText, depth, grade, moveTime) {
        let tbody = $("#moveHistoryTableBody");
        if (!tbody) return;
        let moveNum = tbody.children.length + 1;
        let row = document.createElement("tr");

        let evalClass = "eval-equal";
        if (typeof evalText === "string") {
            if (evalText.includes("M")) evalClass = "eval-mate";
            else {
                let v = parseFloat(evalText);
                if (!isNaN(v)) evalClass = v > 0.4 ? "eval-positive" : v < -0.4 ? "eval-negative" : "eval-equal";
            }
        }

        let gradeColors = {
            "Terbaik": "#7fa650", "Bagus": "#4caf50", "Cukup Baik": "#aeea00",
            "Tidak Akurat": "#ffc107", "Kesalahan": "#ff9800", "Blunder": "#f44336", "Book": "#888"
        };
        let gc = gradeColors[grade] || "#888";

        let safeMove = move.replace(/[<>]/g, '');
        let safeEval = (evalText || "0.00").toString().replace(/[<>]/g, '');
        let safeGrade = (grade || "Book").replace(/[<>]/g, '');

        let timerDisplay = "-";
        if (typeof moveTime === "number" && moveTime > 0) {
            timerDisplay = (moveTime / 1000).toFixed(2) + "s";
        }

        row.innerHTML =
            "<td>" + moveNum + "</td>" +
            "<td style=\"font-weight:bold\">" + safeMove + "</td>" +
            "<td class=\"" + evalClass + "\">" + safeEval + "</td>" +
            "<td>" + (depth || "-") + "</td>" +
            "<td style=\"font-weight:bold;color:" + gc + "\">" + safeGrade + "</td>" +
            "<td style=\"color:#89b4fa;font-weight:bold\">" + timerDisplay + "</td>";
        tbody.insertBefore(row, tbody.firstChild);
        while (tbody.children.length > CONFIG.MAX_HISTORY_SIZE) tbody.removeChild(tbody.lastChild);
    },
    clear: function () {
        let tbody = $("#moveHistoryTableBody");
        if (tbody) tbody.innerHTML = "";
        ACPL.reset();
    }
};

// =====================================================
// Section 30: User Interface Management (Fixed)
// =====================================================
let UI = {
    _arrowElements: [],
    _pvArrowElements: [],
    _bestmoveArrowElements: [],
    _pvDrawScheduled: false,
    _lastDrawnIsAnalysis: null,
    _lastHighlightedMove: null,
    _lastArrowMoves: null,
    _isStreamProof: false,
    _panicMode: false,
    _panicHotkeysBound: false,

    initPanicKey: function () {
        if (this._panicHotkeysBound) return;
        this._panicHotkeysBound = true;

        let self = this;
        let panicHotkeysHandler = function (e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                self.togglePanicMode();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                self.toggleStreamProof();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'M') {
                e.preventDefault();
                self.toggleMoveMode();
            }
        };

        document.addEventListener('keydown', panicHotkeysHandler);
        _eventListeners.push({ element: document, type: 'keydown', handler: panicHotkeysHandler });
    },

    togglePanicMode: function () {
        this._panicMode = !this._panicMode;
        let panel = $("#chess-assist-panel");
        if (this._panicMode) {
            if (panel) panel.style.opacity = '0';
            this.clearAll();
            this._removeAllVisuals();
            State.statusInfo = "PANIC MODE - All hidden";
        } else {
            if (panel) panel.style.opacity = '1';
            State.statusInfo = "Normal mode restored";
        }
        UI.updateStatusInfo();
    },

    toggleStreamProof: function () {
        this._isStreamProof = !this._isStreamProof;
        if (this._isStreamProof) {
            this._applyStreamProofStyles();
            State.statusInfo = "Stream-proof mode ON";
        } else {
            this._removeStreamProofStyles();
            State.statusInfo = "Stream-proof mode OFF";
        }
        UI.updateStatusInfo();
    },

    toggleMoveMode: function () {
        let newMode = State.moveExecutionMode === "click" ? "drag" : "click";
        State.moveExecutionMode = newMode;
        saveSetting("moveExecutionMode", newMode);
        State.statusInfo = "Move Mode: " + newMode.toUpperCase() + (newMode === "drag" ? " (Bezier)" : " (Simple)");
        UI.updateStatusInfo();
    },

    _applyStreamProofStyles: function () {
        let style = document.getElementById('stream-proof-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'stream-proof-styles';
            style.textContent = `
                .chess-assist-arrow rect { stroke-width: 2px !important; opacity: 0.4 !important; filter: none !important; }
                .chess-assist-pv-arrow line { stroke-width: 2px !important; opacity: 0.3 !important; }
                .chess-assist-pv-arrow circle { r: 6 !important; opacity: 0.4 !important; }
                .chess-assist-pv-arrow text { display: none !important; }
            `;
            document.head.appendChild(style);
        }
    },

    _removeStreamProofStyles: function () {
        let style = document.getElementById('stream-proof-styles');
        if (style) style.remove();
    },

    _removeAllVisuals: function () {
        let arrows = document.querySelectorAll(".chess-assist-arrow, .chess-assist-pv-arrow, .chess-assist-bestmove-arrow");
        arrows.forEach(function (el) { el.remove(); });
        this._arrowElements = [];
        this._pvArrowElements = [];
        this._bestmoveArrowElements = [];
    },

    updateMove: function (num, move, evalText, evalClass) {
        let moveEl = $("#topMove" + num);
        let evalEl = $("#topMoveEval" + num);
        if (moveEl) moveEl.textContent = move || "...";
        if (evalEl) {
            evalEl.textContent = evalText || "0.00";
            evalEl.className = "eval " + (evalClass || "eval-equal");
        }
    },

    updateEvalBar: function (rawCp, mateVal, depth) {
        let fill = $("#evaluationFillAutoRun");
        let text = $("#autoRunStatusText");
        if (!fill || !text) return;

        fill.style.transition = "width 0.5s ease, background-color 0.5s ease";

        let pct = 50;
        let color = "#9E9E9E";
        let label = "0.00";
        let emo = "";

        let deltaCp = 0;
        if (typeof rawCp === "number") {
            if (typeof State._lastEvalRawCp === "number") {
                deltaCp = rawCp - State._lastEvalRawCp;
            }
            State._lastEvalRawCp = rawCp;
            State.lastEvalDeltaCp = deltaCp;
        }

        if (mateVal !== null) {
            pct = mateVal > 0 ? 100 : 0;
            color = mateVal > 0 ? "#4CAF50" : "#FF4500";
            label = (mateVal > 0 ? "M+" : "M") + mateVal;
            emo = mateVal > 0 ? "😊 Unggul" : "😟 Tertekan";
            State.evalBarInitialized = false;
        } else {
            if (!State.evalBarInitialized) {
                State.evalBarSmoothedCp = rawCp;
                State.evalBarInitialized = true;
            } else {
                State.evalBarSmoothedCp = (State.evalBarSmoothedCp * 0.75) + (rawCp * 0.25);
            }

            let smoothCp = State.evalBarSmoothedCp;
            let capped = clamp(smoothCp, -CONFIG.MAX_BAR_CAP, CONFIG.MAX_BAR_CAP);
            pct = 50 + (capped / CONFIG.MAX_BAR_CAP) * 50;
            color = smoothCp >= 0 ? "#4CAF50" : "#FF4500";
            label = (smoothCp >= 0 ? "+" : "") + (smoothCp / 100).toFixed(2);

            if (Math.abs(smoothCp) < 20) {
                emo = "😐 Seimbang";
                color = "#9E9E9E";
            } else {
                emo = smoothCp > 0 ? "😊 Unggul" : "😟 Tertekan";
            }
        }

        fill.style.width = pct + "%";
        fill.style.backgroundColor = color;

        let status = State.statusInfo || (State.autoRun ? (State.isThinking ? "ANALYZING..." : "READY") : "OFF");
        let deltaText = "";
        if (typeof State.lastEvalDeltaCp === "number" && State.lastEvalDeltaCp !== 0) {
            let deltaPawn = (State.lastEvalDeltaCp / 100).toFixed(2);
            if (State.lastEvalDeltaCp > 0) deltaText = " Δ+" + deltaPawn;
            else deltaText = " Δ" + deltaPawn;
        }
        text.innerHTML = "<span style=\"font-weight:bold;color:" + color + "\">" + label + " " + emo + "</span>" +
            "<span style=\"font-size:10px;margin-left:8px;opacity:0.7\">D" + (depth || 0) + deltaText + " " + status + "</span>";
    },

    updateAnalysisBar: function (rawCp) {
        let fill = $("#evaluationFillAnalysis");
        if (!fill) return;
        let pct = 50;
        if (Math.abs(rawCp) >= CONFIG.MATE_VALUE) {
            pct = rawCp > 0 ? 100 : 0;
        } else {
            let capped = clamp(rawCp, -CONFIG.MAX_BAR_CAP, CONFIG.MAX_BAR_CAP);
            pct = 50 + (capped / CONFIG.MAX_BAR_CAP) * 50;
        }
        fill.style.width = pct + "%";
        fill.style.backgroundColor = rawCp >= 0 ? State.highlightColor2 : State.highlightColor1;
    },

    updateACPL: function () {
        let el = $("#acplTextDisplay");
        if (el) el.textContent = "W " + State.acplWhite + " / B " + State.acplBlack;
        let wc = $("#cplMoveCountWhiteDisplay");
        let bc = $("#cplMoveCountBlackDisplay");
        if (wc) wc.textContent = State.cplMoveCountWhite;
        if (bc) bc.textContent = State.cplMoveCountBlack;
        let wBar = $("#acplBarWhite");
        let bBar = $("#acplBarBlack");
        if (wBar && bBar) {
            let wCp = Math.min(parseFloat(State.acplWhite) * 100, CONFIG.MAX_ACPL_DISPLAY);
            let bCp = Math.min(parseFloat(State.acplBlack) * 100, CONFIG.MAX_ACPL_DISPLAY);
            wBar.style.width = (wCp / CONFIG.MAX_ACPL_DISPLAY * 100) + "%";
            bBar.style.width = (bCp / CONFIG.MAX_ACPL_DISPLAY * 100) + "%";
        }
    },

    updatePVDisplay: function () {
        let el = $("#pvDisplay");
        if (!el) return;
        el.textContent = State.principalVariation && State.principalVariation.length > 0 ?
            State.principalVariation : "Waiting for analysis...";
    },

    updateStatusInfo: function () {
        let statusEl = $('#infoStatus');
        if (!statusEl) return;

        let statusText = State.statusInfo || 'Ready';
        statusEl.textContent = statusText;

        statusEl.classList.remove('ready', 'analyzing', 'waiting', 'error', 'countdown');

        let statusLower = statusText.toLowerCase();

        if (statusLower.includes('⏳') || statusLower.includes('moving in')) {
            statusEl.classList.add('countdown');
            statusEl.style.color = '#f9e2af';
            statusEl.style.fontWeight = 'bold';
        } else if (statusLower.includes('ready') || statusLower.includes('✓')) {
            statusEl.classList.add('ready');
            statusEl.style.color = '#a6e3a1';
        } else if (statusLower.includes('analyz') || statusLower.includes('🔄')) {
            statusEl.classList.add('analyzing');
            statusEl.style.color = '#89b4fa';
        } else if (statusLower.includes('wait') || statusLower.includes('⏳')) {
            statusEl.classList.add('waiting');
            statusEl.style.color = '#fab387';
        } else if (statusLower.includes('error') || statusLower.includes('❌')) {
            statusEl.classList.add('error');
            statusEl.style.color = '#f38ba8';
        } else {
            statusEl.style.color = '#cdd6f4';
        }
    },

    updatePremoveChanceDisplay: function (game, rawCp, evalText, bestMove, moveNumber) {
        let chanceEl = document.getElementById('premoveChanceDisplay');
        if (!chanceEl) return;

        if (!State.premoveEnabled || !game) {
            chanceEl.innerHTML = '<span style="color:#6c7086">-</span>';
            return;
        }

        if (typeof rawCp === 'number' && typeof evalText !== 'undefined' && typeof bestMove === 'string') {
            let ourColor = getPlayingAs(game);
            let currentChance = getEvalBasedPremoveChance(rawCp / 100, ourColor);
            let displayNum = typeof moveNumber === 'number' ? moveNumber : 1;
            let safeEval = escapeHtml(String(evalText || '0.00'));
            let safeMove = bestMove.length >= 4 ? escapeHtml(bestMove.substring(0, 4).toUpperCase()) : escapeHtml(bestMove.toUpperCase());
            let chancePercent = Math.round(Number(currentChance) || 0);

            let numericEval = parseFloat(safeEval.replace('M', ''));
            let evalColor = numericEval >= 0 ? '#a6e3a1' : '#f38ba8';
            let chanceColor = chancePercent >= 70 ? '#a6e3a1' : chancePercent <= 20 ? '#ff9800' : '#f9e2af';

            let displayText =
                '<strong>#' + displayNum + '</strong> [Eval: <span style="color:' +
                evalColor + ';">' + safeEval +
                '</span>] Move: <span style="color:#89b4fa;">' +
                safeMove +
                '</span> [Chance: <span style="color:' +
                chanceColor + ';">' +
                chancePercent + '%</span>]';

            chanceEl.innerHTML = displayText;
            chanceEl.style.color = chanceColor;
            return;
        }

        if (State.currentEvaluation !== '-' && State.currentEvaluation !== 0 && typeof State.currentEvaluation !== 'undefined') {
            let ourColorFallback = getPlayingAs(game);
            let currentChanceFallback = getEvalBasedPremoveChance(State.currentEvaluation / 100, ourColorFallback);
            let evalVal = typeof State.currentEvaluation === 'number' ? (State.currentEvaluation / 100).toFixed(2) : escapeHtml(String(State.currentEvaluation));
            let chancePercent2 = Math.round(Number(currentChanceFallback) || 0);
            let chanceColor2 = chancePercent2 >= 70 ? '#a6e3a1' : '#f9e2af';

            chanceEl.innerHTML =
                '<strong>#1</strong> [Eval: <span style="color:#a6adc8;">' +
                evalVal +
                '</span>] [Chance: <span style="color:' +
                chanceColor2 +
                ';">' +
                chancePercent2 +
                '%</span>]';
        } else {
            chanceEl.innerHTML = '<span style="color:#6c7086;">Waiting for position...</span>';
        }
    },

    updatePremoveStatsDisplay: function () {
        let el = $("#premoveStatsDisplay");
        if (!el) return;
        let s = State.premoveStats || { attempted: 0, allowed: 0, executed: 0, blocked: 0, failed: 0 };
        el.textContent = "A:" + s.attempted + " OK:" + s.allowed + " EX:" + s.executed + " BL:" + s.blocked + " FL:" + s.failed;
    },

    updateAnalysisMonitorDisplay: function () {
        let stableEl = $("#analysis-stability-indicator");
        let guardEl = $("#analysis-guard-indicator");
        if (stableEl) {
            stableEl.textContent = (State.analysisStableCount || 0) + "x";
        }
        if (guardEl) {
            guardEl.textContent = State.analysisGuardStateText || "Ready";
            let txt = (State.analysisGuardStateText || "").toLowerCase();
            if (txt.includes("blocked")) guardEl.style.color = "#f38ba8";
            else if (txt.includes("waiting") || txt.includes("changed")) guardEl.style.color = "#f9e2af";
            else guardEl.style.color = "#a6e3a1";
        }
    },

    updateDiagnosticsDisplay: function () {
        let workersEl = $("#diag-workers");
        let cachesEl = $("#diag-caches");
        let runtimeEl = $("#diag-runtime");
        if (!workersEl && !cachesEl && !runtimeEl) return;

        let report = getDiagnosticsSnapshot();

        if (workersEl) {
            workersEl.textContent = "M:" + (report.workers.main ? "ON" : "OFF") +
                " A:" + (report.workers.analysis ? "ON" : "OFF") +
                " P:" + (report.workers.premove ? "ON" : "OFF");
        }

        if (cachesEl) {
            cachesEl.textContent = "PF:" + report.caches.predictedFenCache +
                " PS:" + report.caches.premoveSafetyCache +
                " CCT:" + report.caches.cctCache +
                " TH:" + report.caches.threatCache;
        }

        if (runtimeEl) {
            runtimeEl.textContent = "H(P/M/A):" + report.runtime.premoveHealCount +
                "/" + report.runtime.mainHealCount +
                "/" + report.runtime.analysisHealCount +
                " L:" + (State.loopStarted ? 1 : 0);
        }
    },

    highlightBestMove: function (from, to, isAnalysis) {
        this._removeHighlightSquares();
        if (!State.highlightEnabled) return;

        if (!from || !to || from.length !== 2 || to.length !== 2) {
            warn("Invalid highlight move:", from, to);
            return;
        }

        let color = isAnalysis ? State.highlightColor2 : State.highlightColor1;
        this._drawSquareHighlight(from, to, color, isAnalysis);

        this._lastHighlightedMove = {
            from: from,
            to: to,
            isAnalysis: isAnalysis,
            time: Date.now()
        };
        State.statusInfo = "Highlight drawn: " + from + " -> " + to + (isAnalysis ? " (analysis)" : " (main)");
        UI.updateStatusInfo();
    },

    highlightMove: function (move, color, isAnalysis) {
        this._removeHighlightSquares();
        if (!move || move.length < 4) {
            warn("Invalid move for highlight:", move);
            return;
        }
        let from = move.substring(0, 2);
        let to = move.substring(2, 4);
        let actualColor = isAnalysis ? State.highlightColor2 : color;
        this._drawSquareHighlight(from, to, actualColor, isAnalysis);

        this._lastHighlightedMove = {
            from: from,
            to: to,
            move: move,
            isAnalysis: isAnalysis,
            time: Date.now()
        };
        State.statusInfo = "Highlight drawn: " + from + " -> " + to + (isAnalysis ? " (analysis)" : " (main)");
        UI.updateStatusInfo();
    },

    _removeHighlightSquares: function () {
        this._arrowElements.forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        this._arrowElements = [];
        $$(".chess-assist-arrow").forEach(function (el) { el.remove(); });
    },

    _drawSquareHighlight: function (from, to, color, isAnalysis) {
        let board = getBoardElement();
        if (!board) {
            warn("No board element for highlight");
            return;
        }

        let fromXY = MoveExecutor._getSquareXY(from, false);
        let toXY = MoveExecutor._getSquareXY(to, false);

        if (!fromXY || !toXY) {
            warn("Could not get coordinates for:", from, to);
            return;
        }

        let container = (board.tagName && board.tagName.toLowerCase() === "wc-chess-board") ?
            (board.parentElement || board) : board;

        let boardRect = board.getBoundingClientRect();
        let containerRect = container.getBoundingClientRect();
        let squareSize = boardRect.width / 8;

        let fx = fromXY.x - containerRect.left - squareSize / 2;
        let fy = fromXY.y - containerRect.top - squareSize / 2;
        let tx = toXY.x - containerRect.left - squareSize / 2;
        let ty = toXY.y - containerRect.top - squareSize / 2;

        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "chess-assist-arrow");

        let zIndex = isAnalysis ? 10001 : 9999;
        svg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:" + zIndex + ";";
        svg.setAttribute("data-analysis", isAnalysis ? "true" : "false");

        let glowSize = isAnalysis ? 6 : 4;
        let opacity = isAnalysis ? "0.98" : "0.95";
        let borderRadius = Math.max(4, squareSize * 0.15);
        let fontSize = Math.max(10, squareSize * 0.15);

        svg.innerHTML =
            "<rect x=\"" + fx + "\" y=\"" + fy + "\" width=\"" + squareSize + "\" height=\"" + squareSize + "\" " +
            "fill=\"none\" stroke=\"" + color + "\" stroke-width=\"4\" rx=\"" + borderRadius + "\" ry=\"" + borderRadius + "\" opacity=\"" + opacity + "\" " +
            "style=\"filter:drop-shadow(0 0 " + glowSize + "px " + color + ");\" />" +

            "<rect x=\"" + tx + "\" y=\"" + ty + "\" width=\"" + squareSize + "\" height=\"" + squareSize + "\" " +
            "fill=\"none\" stroke=\"" + color + "\" stroke-width=\"4\" rx=\"" + borderRadius + "\" ry=\"" + borderRadius + "\" opacity=\"" + opacity + "\" " +
            "style=\"filter:drop-shadow(0 0 " + (glowSize + 2) + "px " + color + ");\" />" +

            "<text x=\"" + (fx + 2) + "\" y=\"" + (fy + 2) + "\" font-size=\"" + fontSize + "px\" fill=\"#000000\" font-weight=\"bold\" pointer-events=\"none\" " +
            "writing-mode=\"tb\" text-anchor=\"start\">" + from.toUpperCase() + "</text>" +

            "<text x=\"" + (tx + 2) + "\" y=\"" + (ty + 2) + "\" font-size=\"" + fontSize + "px\" fill=\"#000000\" font-weight=\"bold\" pointer-events=\"none\" " +
            "writing-mode=\"tb\" text-anchor=\"start\">" + to.toUpperCase() + "</text>";

        container.style.position = container.style.position || "relative";
        container.appendChild(svg);
        this._arrowElements.push(svg);
    },

    drawPVArrows: function (pvMoves, startingTurn, isAnalysis) {
        if (!pvMoves || pvMoves.length === 0 || !State.showPVArrows) return;

        let validMoves = pvMoves.filter(function (m) {
            return m && m.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(m);
        });

        if (validMoves.length === 0) {
            warn("No valid moves in PV:", pvMoves);
            return;
        }

        let board = getBoardElement();
        if (!board) {
            warn("No board element for PV arrows");
            return;
        }

        let container = (board.tagName && board.tagName.toLowerCase() === "wc-chess-board") ?
            (board.parentElement || board) : board;

        let pvStr = validMoves.join(" ");
        let now = Date.now();

        let lastRendered = isAnalysis ? State.lastRenderedAnalysisPV : State.lastRenderedMainPV;
        let lastDrawTime = isAnalysis ? State.lastAnalysisPVDrawTime : State.lastMainPVDrawTime;

        if (pvStr === lastRendered && now - lastDrawTime < 100) return;

        if (this._lastDrawnIsAnalysis !== isAnalysis) {
            this._removePVArrowsByType(!isAnalysis);
        }

        this._removePVArrowsByType(isAnalysis);

        if (isAnalysis) {
            State.lastRenderedAnalysisPV = pvStr;
            State.lastAnalysisPVDrawTime = now;
        } else {
            State.lastRenderedMainPV = pvStr;
            State.lastMainPVDrawTime = now;
        }
        this._lastDrawnIsAnalysis = isAnalysis;

        this._doPVDraw(validMoves, startingTurn, pvStr, board, container, isAnalysis);
    },

    drawBestmoveArrows: function () {
        if (!State.showBestmoveArrows) return;
        if (State.analysisMode) return;

        let board = getBoardElement();
        if (!board) return;

        let container = (board.tagName && board.tagName.toLowerCase() === "wc-chess-board") ?
            (board.parentElement || board) : board;

        this.clearBestmoveArrows();

        let infos = State.topMoveInfos || {};
        let moveCount = clamp(State.numberOfMovesToShow || 5, 2, 10);
        let frag = document.createDocumentFragment();

        for (let i = 1; i <= moveCount; i++) {
            let info = infos[i];
            if (!info || !info.move || info.move.length < 4) continue;

            let from = info.move.substring(0, 2);
            let to = info.move.substring(2, 4);
            let badge = info.evalText || "";
            let alpha = i === 1 ? 0.95 : Math.max(0.55, 0.9 - (i * 0.08));
            let bmColors = State.bestmoveArrowColors || {};
            let basePalette = [
                bmColors[1] || bmColors["1"] || State.bestmoveArrowColor || "#eb6150",
                bmColors[2] || bmColors["2"] || "#89b4fa",
                bmColors[3] || bmColors["3"] || "#a6e3a1",
                bmColors[4] || bmColors["4"] || "#f38ba8",
                bmColors[5] || bmColors["5"] || "#cba6f7",
                bmColors[6] || bmColors["6"] || "#fab387",
                bmColors[7] || bmColors["7"] || "#74c7ec",
                bmColors[8] || bmColors["8"] || "#f5c2e7",
                bmColors[9] || bmColors["9"] || "#b4befe"
            ];
            let color = basePalette[(i - 1) % 9] || "#f9e2af";

            let arrow = this._createBestmoveArrowSVG(from, to, color, alpha, i, badge, board, container);
            if (arrow) {
                this._bestmoveArrowElements.push(arrow);
                frag.appendChild(arrow);
            }
        }

        if (this._bestmoveArrowElements.length > 0) {
            container.style.position = container.style.position || "relative";
            container.appendChild(frag);
        }
    },

    _createBestmoveArrowSVG: function (from, to, color, opacity, rank, badge, board, container) {
        let fromXY = MoveExecutor._getSquareXY(from, false);
        let toXY = MoveExecutor._getSquareXY(to, false);
        if (!fromXY || !toXY) return null;

        let containerRect = (container || board).getBoundingClientRect();
        let x1 = fromXY.x - containerRect.left;
        let y1 = fromXY.y - containerRect.top;
        let x2 = toXY.x - containerRect.left;
        let y2 = toXY.y - containerRect.top;

        let uid = "bm-" + rank + "-" + Date.now();
        let angle = Math.atan2(y2 - y1, x2 - x1);
        let strokeWidth = 4;
        let circleRadius = 10;
        let arrowHeadSize = Math.max(8, strokeWidth * 2);
        let markerWidth = Math.max(6, strokeWidth * 1.5);
        let markerHeight = Math.max(4, strokeWidth);
        let endX = x2 - Math.cos(angle) * arrowHeadSize;
        let endY = y2 - Math.sin(angle) * arrowHeadSize;
        let midX = (x1 + endX) / 2;
        let midY = (y1 + endY) / 2;
        let safeBadge = escapeHtml(String(badge || ""));

        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "chess-assist-bestmove-arrow");
        svg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:" + (9980 + rank) + ";";

        let badgeWidth = Math.max(22, safeBadge.length * 4.5 + 6);
        let badgeSvg = safeBadge
            ? "<rect x=\"" + (midX - badgeWidth / 2) + "\" y=\"" + (midY - 10) + "\" width=\"" + badgeWidth + "\" height=\"10\" rx=\"3\" ry=\"3\" fill=\"rgba(0,0,0,0.62)\" />" +
              "<text x=\"" + midX + "\" y=\"" + (midY - 2) + "\" text-anchor=\"middle\" font-size=\"7\" font-weight=\"700\" fill=\"#f1f1f1\">" + safeBadge + "</text>"
            : "";

        svg.innerHTML =
            "<defs><marker id=\"bmh-" + uid + "\" markerWidth=\"" + markerWidth + "\" markerHeight=\"" + markerHeight + "\" refX=\"" + (markerWidth - 1) + "\" refY=\"" + (markerHeight / 2) + "\" orient=\"auto\">" +
            "<polygon points=\"0 0," + markerWidth + " " + (markerHeight / 2) + ",0 " + markerHeight + "\" fill=\"" + color + "\" opacity=\"" + opacity + "\" /></marker></defs>" +
            "<line x1=\"" + x1 + "\" y1=\"" + y1 + "\" x2=\"" + endX + "\" y2=\"" + endY + "\" stroke=\"" + color + "\" stroke-width=\"" + strokeWidth + "\" stroke-linecap=\"round\" opacity=\"" + Math.max(0.25, opacity * 0.6) + "\" style=\"filter:blur(1.5px);\" />" +
            "<line x1=\"" + x1 + "\" y1=\"" + y1 + "\" x2=\"" + endX + "\" y2=\"" + endY + "\" stroke=\"" + color + "\" stroke-width=\"" + strokeWidth + "\" stroke-linecap=\"round\" marker-end=\"url(#bmh-" + uid + ")\" opacity=\"" + opacity + "\" />" +
            "<circle cx=\"" + x1 + "\" cy=\"" + y1 + "\" r=\"" + circleRadius + "\" fill=\"none\" stroke=\"" + color + "\" stroke-width=\"3\" opacity=\"" + Math.min(1, opacity + 0.1) + "\" />" +
            "<circle cx=\"" + x1 + "\" cy=\"" + y1 + "\" r=\"" + (circleRadius - 4) + "\" fill=\"" + color + "\" opacity=\"0.88\" />" +
            "<text x=\"" + x1 + "\" y=\"" + (y1 + 3) + "\" text-anchor=\"middle\" font-size=\"9\" font-weight=\"800\" fill=\"#111\">" + rank + "</text>" +
            badgeSvg;

        return svg;
    },

    _doPVDraw: function (pvMoves, startingTurn, pvStr, board, container, isAnalysis) {

        this._removePVArrowsByType(isAnalysis);

        if (isAnalysis) {
            State.lastRenderedAnalysisPV = pvStr;
            State.lastAnalysisPVDrawTime = Date.now();
        } else {
            State.lastRenderedMainPV = pvStr;
            State.lastMainPVDrawTime = Date.now();
        }

        this._lastDrawnIsAnalysis = isAnalysis;

        let maxMoves = Math.min(pvMoves.length, State.maxPVDepth);
        let frag = document.createDocumentFragment();

        let pvColors = State.pvArrowColors || {};
        let pvPalette = [
            pvColors[1] || pvColors["1"] || "#4287f5",
            pvColors[2] || pvColors["2"] || "#eb6150",
            pvColors[3] || pvColors["3"] || "#4caf50",
            pvColors[4] || pvColors["4"] || "#9c27b0",
            pvColors[5] || pvColors["5"] || "#f38ba8",
            pvColors[6] || pvColors["6"] || "#fab387",
            pvColors[7] || pvColors["7"] || "#74c7ec",
            pvColors[8] || pvColors["8"] || "#f5c2e7",
            pvColors[9] || pvColors["9"] || "#b4befe"
        ];

        this._lastArrowMoves = [];

        for (let i = 0; i < maxMoves; i++) {

            let move = pvMoves[i];
            if (!move || move.length < 4) continue;

            let from = move.substring(0, 2);
            let to = move.substring(2, 4);

            let opacity = Math.max(0.55, 0.95 - (i * 0.05));
            let color = pvPalette[i % pvPalette.length];

            this._lastArrowMoves.push({ from: from, to: to, index: i });

            let evalBadge = "";
            if (i === 0) {
                let cpValue = null;
                if (State.topMoveInfos && State.topMoveInfos[1] && typeof State.topMoveInfos[1].rawCp === "number") {
                    cpValue = State.topMoveInfos[1].rawCp;
                } else if (typeof State.currentEvaluation === "number") {
                    cpValue = State.currentEvaluation;
                }
                if (typeof cpValue === "number" && isFinite(cpValue) && Math.abs(cpValue) < CONFIG.MATE_VALUE) {
                    let pct = 50 + (45 * Math.tanh(cpValue / 300));
                    evalBadge = pct.toFixed(1) + "%";
                } else if (State.lastEvalText1) {
                    evalBadge = State.lastEvalText1;
                }
            }

            let el = this._createPVArrowSVG(
                from,
                to,
                color,
                opacity,
                4,
                i,
                board,
                container,
                isAnalysis,
                evalBadge
            );

            if (el) {
                this._pvArrowElements.push(el);
                frag.appendChild(el);
            }
        }

        container.style.position = container.style.position || "relative";
        container.appendChild(frag);
    },

    _createPVArrowSVG: function (from, to, color, opacity, strokeWidth, index, board, container, isAnalysis, evalBadge) {

        function getContrastColor(hexColor) {
            if (!hexColor) return "#000000";

            let c = hexColor.replace("#", "");
            if (c.length === 3) {
                c = c.split("").map(function (x) { return x + x; }).join("");
            }

            let r = parseInt(c.substr(0, 2), 16);
            let g = parseInt(c.substr(2, 2), 16);
            let b = parseInt(c.substr(4, 2), 16);

            let brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness > 150 ? "#000000" : "#ffffff";
        }

        let fromXY = MoveExecutor._getSquareXY(from, false);
        let toXY = MoveExecutor._getSquareXY(to, false);

        if (!fromXY || !toXY) {
            warn("Could not get arrow coordinates for:", from, to);
            return null;
        }

        let containerRect = (container || board).getBoundingClientRect();
        let x1 = fromXY.x - containerRect.left;
        let y1 = fromXY.y - containerRect.top;
        let x2 = toXY.x - containerRect.left;
        let y2 = toXY.y - containerRect.top;

        let angle = Math.atan2(y2 - y1, x2 - x1);
        let arrowHeadSize = Math.max(8, strokeWidth * 2);
        let endX = x2 - Math.cos(angle) * arrowHeadSize;
        let endY = y2 - Math.sin(angle) * arrowHeadSize;

        let uid = "pv-" + (isAnalysis ? "a-" : "m-") + index + "-" + Date.now();

        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "chess-assist-pv-arrow");
        svg.setAttribute("data-analysis", isAnalysis ? "true" : "false");

        let zIndex = 9990 + index + (isAnalysis ? 100 : 0);
        svg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:" + zIndex + ";";

        let blurAmount = isAnalysis ? "2px" : "1.5px";
        let circleRadius = isAnalysis ? 12 : 10;
        let textYOffset = isAnalysis ? 5 : 4;
        let markerWidth = Math.max(6, strokeWidth * 1.5);
        let markerHeight = Math.max(4, strokeWidth);

        let textColor = getContrastColor(color);
        let textStroke = textColor === "#ffffff" ? "#000000" : "#ffffff";
        let numberBgOpacity = 0.85;
        let midX = (x1 + endX) / 2;
        let midY = (y1 + endY) / 2;
        let evalTextColor = "#eaeaea";
        let safeEvalBadge = escapeHtml(String(evalBadge || ""));
        let evalBadgeWidth = Math.max(24, safeEvalBadge.length * 4.4 + 6);
        let evalBadgeSvg = safeEvalBadge
            ? "<rect x=\"" + (midX - (evalBadgeWidth / 2)) + "\" y=\"" + (midY - 10) + "\" width=\"" + evalBadgeWidth + "\" height=\"10\" rx=\"3\" ry=\"3\" fill=\"rgba(0,0,0,0.58)\" />" +
              "<text x=\"" + midX + "\" y=\"" + (midY - 2) + "\" text-anchor=\"middle\" font-size=\"7\" font-weight=\"700\" fill=\"" + evalTextColor + "\" pointer-events=\"none\">" + safeEvalBadge + "</text>"
            : "";

        svg.innerHTML =
            "<defs><marker id=\"pvah-" + uid + "\" markerWidth=\"" + markerWidth + "\" markerHeight=\"" + markerHeight + "\" refX=\"" + (markerWidth - 1) + "\" refY=\"" + (markerHeight / 2) + "\" orient=\"auto\">" +
            "<polygon points=\"0 0," + markerWidth + " " + (markerHeight / 2) + ",0 " + markerHeight + "\" fill=\"" + color + "\" opacity=\"" + opacity + "\" /></marker></defs>" +

            "<line x1=\"" + x1 + "\" y1=\"" + y1 + "\" x2=\"" + endX + "\" y2=\"" + endY + "\" " +
            "stroke=\"" + color + "\" stroke-width=\"" + strokeWidth + "\" stroke-linecap=\"round\" " +
            "opacity=\"" + Math.max(0.25, opacity * 0.6) + "\" style=\"filter:blur(" + blurAmount + ");\" />" +

            "<line x1=\"" + x1 + "\" y1=\"" + y1 + "\" x2=\"" + endX + "\" y2=\"" + endY + "\" " +
            "stroke=\"" + color + "\" stroke-width=\"" + strokeWidth + "\" stroke-linecap=\"round\" " +
            "marker-end=\"url(#pvah-" + uid + ")\" opacity=\"" + opacity + "\" />" +

            "<circle cx=\"" + x1 + "\" cy=\"" + y1 + "\" r=\"" + circleRadius + "\" " +
            "fill=\"none\" stroke=\"" + color + "\" stroke-width=\"3\" " +
            "opacity=\"" + Math.min(1, opacity + 0.1) + "\" />" +

            "<circle cx=\"" + x1 + "\" cy=\"" + y1 + "\" r=\"" + (circleRadius - 3) + "\" " +
            "fill=\"none\" stroke=\"" + color + "\" stroke-width=\"1\" " +
            "opacity=\"" + (opacity * 0.5) + "\" />" +

            "<circle cx=\"" + x1 + "\" cy=\"" + y1 + "\" r=\"" + (circleRadius - 4) + "\" " +
            "fill=\"" + color + "\" opacity=\"" + numberBgOpacity + "\" />" +

            "<text x=\"" + x1 + "\" y=\"" + (y1 + textYOffset) + "\" " +
            "text-anchor=\"middle\" font-size=\"11\" font-weight=\"900\" " +
            "fill=\"" + textColor + "\" stroke=\"" + textStroke + "\" stroke-width=\"0.8\" " +
            "paint-order=\"stroke\" pointer-events=\"none\">" +
            (index + 1) + "</text>" +
            evalBadgeSvg;

        return svg;
    },

    _removePVArrowsByType: function (isAnalysis) {
        for (let i = this._pvArrowElements.length - 1; i >= 0; i--) {
            let el = this._pvArrowElements[i];
            let elIsAnalysis = el.getAttribute("data-analysis") === "true";
            if (elIsAnalysis === isAnalysis) {
                if (el.parentNode) el.parentNode.removeChild(el);
                this._pvArrowElements.splice(i, 1);
            }
        }
    },

    _removePVArrowsDOM: function () {
        this._pvArrowElements.forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        this._pvArrowElements = [];
        $$(".chess-assist-pv-arrow").forEach(function (el) { el.remove(); });
    },

    clearBestmoveArrows: function () {
        this._bestmoveArrowElements.forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        this._bestmoveArrowElements = [];
        $$(".chess-assist-bestmove-arrow").forEach(function (el) { el.remove(); });
    },

    clearPVArrows: function () {
        this._pvArrowElements = [];
        this._removePVArrowsDOM();
        State.lastRenderedMainPV = "";
        State.lastRenderedAnalysisPV = "";
        State.lastMainPVDrawTime = 0;
        State.lastAnalysisPVDrawTime = 0;
        this._lastDrawnIsAnalysis = null;
        this._lastArrowMoves = null;
    },

    clearHighlights: function () {
        this._removeHighlightSquares();
        this._lastHighlightedMove = null;
    },

    clearAll: function () {
        State.statusInfo = "Clearing all visuals";
        UI.updateStatusInfo();
        this._removeHighlightSquares();
        this._removePVArrowsDOM();
        this.clearBestmoveArrows();
        this._lastDrawnIsAnalysis = null;
        this._lastHighlightedMove = null;
        this._lastArrowMoves = null;
        State.lastRenderedMainPV = "";
        State.lastRenderedAnalysisPV = "";
        State.lastMainPVDrawTime = 0;
        State.lastAnalysisPVDrawTime = 0;
    },

    updateTurnLEDs: function () {
        let myTurnLed = $("#GILIRAN-SAYA");
        let oppTurnLed = $("#GILIRAN-LAWAN");
        let engineLed = $("#engine-status-led");
        if (engineLed) engineLed.classList.toggle("active", State.isThinking || State.isAnalysisThinking);
        if (!myTurnLed || !oppTurnLed) return;
        let myTurn = isPlayersTurn();
        myTurnLed.classList.toggle("active", myTurn);
        oppTurnLed.classList.toggle("active", !myTurn);
    },

    updateClock: function () {
        const clock = $("#digital-clock");
        if (clock) {
            const timeString = new Date().toLocaleTimeString("en-US", { hour12: false });
            clock.textContent = timeString;
        }
    }
};

// =====================================================
// HELPER: HTML Escaping untuk keamanan
// =====================================================
function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =====================================================
// Section 31: Auto Resignation Logic (Enhanced)
// =====================================================
function checkAutoResign(scoreType, scoreValue) {
    if (!State.autoResignEnabled || State.gameEnded) return;
    if (!isPlayersTurn()) return;

    let trigger = false;

    if (State.resignMode === "cp") {
        if (scoreType === "cp" && scoreValue <= -Math.abs(State.autoResignThresholdCp)) {
            trigger = true;
        }
    } else if (State.resignMode === "mate") {
        if (scoreType === "mate" && scoreValue < 0) {
            const movesToMate = Math.abs(scoreValue);
            if (movesToMate <= State.autoResignThresholdMate) {
                trigger = true;
            }
        }
    }

    if (trigger) {
        _resignTriggerCount++;
        if (_resignTriggerCount >= _resignTriggerNeeded) {
            State.statusInfo = `Auto-resign triggered: ${scoreType} ${scoreValue}`;
            console.log(State.statusInfo);
            _resignTimeout = setTimeout(resignGame, 1500);
        }
    } else {
        _resignTriggerCount = 0;
    }
}

function resignGame() {
    if (State.gameEnded) return;

    if (_resignObserver) {
        _resignObserver.disconnect();
        _resignObserver = null;
    }
    clearTimeout(_resignTimeout);

    const resignSelectors = [
        'button[data-cy="resign-button-with-confirmation"]',
        'button[data-cy="resign-button"]',
        'button[aria-label="Resign"]',
        'button[data-cy="game-controls-resign"]',
        '.resign-button'
    ];

    let resignButton = resignSelectors
        .map(sel => document.querySelector(sel))
        .find(btn => btn);

    if (!resignButton) {
        resignButton = Array.from(document.querySelectorAll("button"))
            .find(btn => {
            const text = (btn.getAttribute("aria-label") || btn.textContent || "")
            .trim().toLowerCase();
            return text === "resign" || text === "menyerah";
        });
    }

    if (!resignButton) {
        console.warn("[AutoResign] Tombol resign tidak ditemukan!");
        return;
    }

    _resignObserver = new MutationObserver(() => {
        const confirmButton = document.querySelector(
            'button[data-cy="confirm-yes"], button[data-cy="confirm-modal-primary-button"].cc-button-danger'
        );
        if (confirmButton) {
            console.log("[AutoResign] Klik tombol konfirmasi resign");
            confirmButton.click();
            State.gameEnded = true;
            cleanup();
        }
    });

    const modalContainer = document.querySelector('.modal-container') || document.body;
    _resignObserver.observe(modalContainer, { childList: true, subtree: true });

    console.log("[AutoResign] Klik tombol resign");
    resignButton.click();

    _resignTimeout = setTimeout(cleanup, 5000);

    function cleanup() {
        if (_resignObserver) {
            _resignObserver.disconnect();
            _resignObserver = null;
        }
        if (_resignTimeout) {
            clearTimeout(_resignTimeout);
            _resignTimeout = null;
        }
    }
}

// =====================================================
// Section 32: Auto Match System (Fixed v4.1)
// =====================================================

let AutoMatch = {
    inProgress: false,
    lastAttemptTime: 0,
    attemptCount: 0,
    MAX_ATTEMPTS: 3,
    COOLDOWN_MS: 10000,
    ACTION_DELAY_MS: 10000,

    _visible: function (el) {
        if (!el) return false;
        return el.offsetParent !== null &&
            el.offsetWidth > 0 &&
            el.offsetHeight > 0 &&
            !el.disabled &&
            getComputedStyle(el).visibility !== 'hidden' &&
            getComputedStyle(el).display !== 'none';
    },

    _isButtonClickable: function(el) {
        if (!el) return false;
        let rect = el.getBoundingClientRect();
        return rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth;
    },

    _findButton: function (selectors, predicate, priorityText) {
        let candidates = [];

        for (let si = 0; si < selectors.length; si++) {
            let nodes;
            try {
                nodes = $$(selectors[si]);
            } catch(e) {
                continue;
            }

            for (let ni = 0; ni < nodes.length; ni++) {
                let el = nodes[ni];
                if (!this._visible(el)) continue;

                let txt = (el.textContent || el.innerText || "").trim().toLowerCase();
                let ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
                let title = (el.getAttribute("title") || "").toLowerCase();
                let dataCy = (el.getAttribute("data-cy") || "").toLowerCase();

                let score = 0;

                if (predicate) {
                    if (predicate(txt, el)) score += 10;
                    if (predicate(ariaLabel, el)) score += 8;
                    if (predicate(title, el)) score += 6;
                }

                if (priorityText && priorityText.length > 0) {
                    for (let pt of priorityText) {
                        let ptLower = pt.toLowerCase();

                        if (txt === ptLower) score += 25;
                        else if (txt.includes(ptLower)) score += 15;

                        if (ariaLabel === ptLower) score += 20;
                        else if (ariaLabel.includes(ptLower)) score += 12;
                    }
                }

                if (dataCy.includes("decline")) score += 30;
                if (dataCy.includes("new-game")) score += 25;
                if (dataCy.includes("rematch")) score += 20;

                if (score > 0) {
                    candidates.push({ el, score, text: txt });
                }
            }
        }

        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0) {
            log("[AutoMatch] Best candidate:", candidates[0].text, "score:", candidates[0].score);
            return candidates[0].el;
        }

        return null;
    },

    _clickElement: function(el, description) {
        if (!el) {
            warn("[AutoMatch] No element to click:", description);
            return false;
        }

        log("[AutoMatch] Clicking:", description, "| Text:", el.textContent?.trim());

        try {
            let rect = el.getBoundingClientRect();
            let centerX = rect.left + rect.width / 2;
            let centerY = rect.top + rect.height / 2;

            const events = [
                ['pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    clientX: centerX,
                    clientY: centerY,
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true
                }],
                ['mousedown', {
                    bubbles: true,
                    cancelable: true,
                    clientX: centerX,
                    clientY: centerY,
                    button: 0,
                    buttons: 1
                }],
                ['pointerup', {
                    bubbles: true,
                    cancelable: true,
                    clientX: centerX,
                    clientY: centerY,
                    pointerId: 1,
                    pointerType: 'mouse'
                }],
                ['mouseup', {
                    bubbles: true,
                    cancelable: true,
                    clientX: centerX,
                    clientY: centerY,
                    button: 0
                }],
                ['click', {
                    bubbles: true,
                    cancelable: true,
                    clientX: centerX,
                    clientY: centerY
                }]
            ];

            for (let [eventType, options] of events) {
                let event;
                if (eventType.startsWith('pointer')) {
                    event = new PointerEvent(eventType, options);
                } else {
                    event = new MouseEvent(eventType, options);
                }
                el.dispatchEvent(event);
            }

            setTimeout(() => {
                try {
                    el.click();
                } catch(e) {}
            }, 50);

            return true;

        } catch (e) {
            err("[AutoMatch] Click error:", e);
            try {
                el.click();
                return true;
            } catch(e2) {
                return false;
            }
        }
    },

    _detectGameOver: function() {
        const selectors = [
            ".game-result-component",
            ".game-over-modal-content",
            ".game-over-modal-component",
            ".game-over-ad-component",
            ".game-over-ad-container-component",
            ".daily-game-footer-game-over",
            "[data-cy='game-over-modal']",
            "[data-cy='game-result-modal']",
            ".game-over-secondary-actions-row-component",
            ".game-over-buttons-component",
            ".game-over-modal-buttons",
            "[data-cy='game-over-modal-new-game-button']",
            "[data-cy='game-over-modal-rematch-button']",
            "[data-cy='rematch-button']",
            "[data-cy='rematch-request-modal']",
            "[data-cy='rematch-offer-modal']",
            ".rematch-request-component",
            ".rematch-offer-component"
        ];

        for (let sel of selectors) {
            let el = $(sel);
            if (el && this._visible(el)) {
                log("[AutoMatch] Game over detected via:", sel);
                return true;
            }
        }

        let newGameBtn = $("[data-cy='game-over-modal-new-game-button']");
        let rematchBtn = $("[data-cy='game-over-modal-rematch-button']");
        let newBotBtn = $("[data-cy='game-over-modal-new-bot-button']");
        let declineBtn = $("[data-cy='rematch-decline-button']");

        if ((newGameBtn && this._visible(newGameBtn)) ||
            (rematchBtn && this._visible(rematchBtn)) ||
            (newBotBtn && this._visible(newBotBtn)) ||
            (declineBtn && this._visible(declineBtn))) {
            log("[AutoMatch] Game over detected via buttons");
            return true;
        }

        return false;
    },

    _detectRematchRequest: function() {
        const declineSelectors = [
            "[data-cy='rematch-decline-button']",
            "[data-cy='decline-rematch-button']",
            "button[data-cy*='decline']",
            "button[data-cy*='reject']"
        ];

        const requestModalSelectors = [
            "[data-cy='rematch-request-modal']",
            "[data-cy='rematch-offer-modal']",
            ".rematch-request-component",
            ".rematch-offer-component",
            ".rematch-dialog-component"
        ];

        for (let sel of requestModalSelectors) {
            let el = $(sel);
            if (el && this._visible(el)) {
                log("[AutoMatch] Rematch request modal detected:", sel);
                return true;
            }
        }

        for (let sel of declineSelectors) {
            let el = $(sel);
            if (el && this._visible(el)) {
                log("[AutoMatch] Decline button found - rematch request detected");
                return true;
            }
        }

        return false;
    },

    try: function () {
        let now = Date.now();

        if (now - this.lastAttemptTime < this.ACTION_DELAY_MS) {
            let remaining = Math.ceil((this.ACTION_DELAY_MS - (now - this.lastAttemptTime)) / 1000);
            log("[AutoMatch] Waiting... " + remaining + "s remaining");
            return;
        }

        this.lastAttemptTime = now;

        if (this.inProgress) {
            log("[AutoMatch] Already in progress");
            return;
        }

        if (!this._detectGameOver()) {
            this.attemptCount = 0;
            return;
        }

        this.inProgress = true;
        this.attemptCount++;

        log("[AutoMatch] Attempt", this.attemptCount, "starting...");

        let self = this;

        sleep(10000).then(function() {
            if (!_allLoopsActive || !State.autoMatch) {
                self.inProgress = false;
                return false;
            }
            return self._executeMatchLogic();
        }).then(function(success) {
            self.inProgress = false;

            if (!_allLoopsActive || !State.autoMatch) {
                self.attemptCount = 0;
                return;
            }

            if (!success && self.attemptCount < self.MAX_ATTEMPTS) {
                log("[AutoMatch] Retry after delay...");
                scheduleManagedTimeout(function () { self.try(); }, self.ACTION_DELAY_MS);
            } else {
                self.attemptCount = 0;
            }
        }).catch(function(e) {
            err("[AutoMatch] Error:", e);
            self.inProgress = false;
        });
    },

    _executeMatchLogic: function() {
        let self = this;

        return new Promise(function(resolve) {

            if (self._detectRematchRequest()) {
                log("[AutoMatch] Rematch request detected - searching for decline button...");

                let declineBtn = self._findButton(
                    [
                        "[data-cy='rematch-decline-button']",
                        "[data-cy='decline-rematch-button']",
                        "button[data-cy*='decline']",
                        "button[data-cy*='reject']",
                        "button[data-cy*='tolak']"
                    ],
                    function (txt) {
                        return txt.includes("decline") ||
                            txt.includes("reject") ||
                            txt.includes("tolak") ||
                            txt.includes("no") ||
                            txt.includes("tidak");
                    },
                    ["Decline", "Tolak", "Reject", "No"]
                );

                if (declineBtn && self._isButtonClickable(declineBtn)) {
                    log("[AutoMatch] Found DECLINE button - rejecting rematch request");
                    self._clickElement(declineBtn, "Decline Rematch");

                    setTimeout(() => {
                        self.inProgress = false;
                        self.try();
                    }, 3000);

                    resolve(true);
                    return;
                }
            }

            log("[AutoMatch] No rematch request - proceeding to New Game...");

            let rematchModal = $("[data-cy='game-over-modal-rematch-button']") ||
                $("[data-cy='rematch-button']");

            let newGameBtn = self._findButton(
                [
                    "[data-cy='game-over-modal-new-game-button']",
                    "[data-cy='new-game-button']",
                    "button[data-cy*='new-game']",
                    "button[data-cy*='new_game']"
                ],
                function (txt) {
                    let hasNewGame =
                        txt.includes("new game") ||
                        txt.includes("game baru") ||
                        txt.includes("pertandingan baru") ||
                        txt.includes("10 mnt baru") ||
                        txt.includes("5 mnt baru") ||
                        txt.includes("3 mnt baru") ||
                        txt.includes("1 mnt baru") ||
                        txt.includes("main baru");

                    let isRematch =
                        txt.includes("rematch") ||
                        txt.includes("tanding ulang") ||
                        txt.includes("main lagi") ||
                        txt.includes("lagi");

                    return hasNewGame && !isRematch;
                },
                ["New Game", "Game Baru", "10 mnt Baru", "5 mnt Baru", "3 mnt Baru", "1 mnt Baru"]
            );

            if (newGameBtn && self._isButtonClickable(newGameBtn)) {
                log("[AutoMatch] Found NEW GAME button:", newGameBtn.textContent?.trim());
                self._clickElement(newGameBtn, "New Game");

                if (typeof handleNewGame === 'function') {
                    handleNewGame();
                }

                resolve(true);
                return;
            }

            let fallbackBtn = self._findButton(
                [
                    "button",
                    "a[role='button']",
                    "[role='button']"
                ],
                function (txt, el) {
                    let dataCy = (el.getAttribute("data-cy") || "").toLowerCase();
                    if (dataCy.includes("rematch")) return false;

                    return txt.includes("new game") ||
                        txt.includes("game baru") ||
                        txt.includes("main baru");
                }
            );

            if (fallbackBtn && self._isButtonClickable(fallbackBtn)) {
                log("[AutoMatch] Found NEW GAME via fallback:", fallbackBtn.textContent?.trim());
                self._clickElement(fallbackBtn, "New Game (Fallback)");

                if (typeof handleNewGame === 'function') {
                    handleNewGame();
                }

                resolve(true);
                return;
            }

            warn("[AutoMatch] No actionable button found");
            resolve(false);
        });
    }
};

// =====================================================
// Section 37: Panel State Management
// =====================================================
function applyPanelState(state) {
    let panel = $("#chess-assist-panel");
    if (!panel) return;
    panel.classList.remove("minimized", "maximized", "closed");
    if (state !== "maximized") panel.classList.add(state);
    saveSetting("panelState", state);
    if (state === "closed") UI.clearAll();
}

// =====================================================
// Section 37A: Panel State Management (Enhanced)
// =====================================================
let newGameActionMouseDownHandler = function (e) {
    if (e.button !== 0) return;

    let target = e.target;
    let btnText = (target.innerText || target.textContent || "").toLowerCase();
    let ariaLabel = (target.getAttribute("aria-label") || "").toLowerCase();
    let dataCy = (target.getAttribute("data-cy") || "").toLowerCase();

    let isActionButton = false;
    let actionType = "";

    if (dataCy.includes("new-game") || dataCy.includes("newgame")) {
        isActionButton = true;
        actionType = "new-game";
    } else if (dataCy.includes("new-bot") || dataCy.includes("bot")) {
        isActionButton = true;
        actionType = "new-bot";
    } else if (dataCy.includes("rematch")) {
        isActionButton = true;
        actionType = "rematch";
    }

    if (!isActionButton) {
        if (btnText.includes("new game") ||
            btnText.includes("baru") ||
            btnText.includes("10 mnt") ||
            btnText.includes("5 mnt") ||
            btnText.includes("3 mnt") ||
            btnText.includes("1 mnt") ||
            btnText.includes("game baru")) {
            isActionButton = true;
            actionType = "new-game";
        }
        else if (btnText.includes("new bot") ||
                 btnText.includes("bot baru") ||
                 btnText.includes("play bot") ||
                 btnText.includes("main bot")) {
            isActionButton = true;
            actionType = "new-bot";
        }
        else if (btnText.includes("rematch") ||
                 btnText.includes("tanding ulang") ||
                 btnText.includes("main lagi")) {
            isActionButton = true;
            actionType = "rematch";
        }
    }

    if (!isActionButton && target.closest) {
        let parentButton = target.closest("button");
        if (parentButton) {
            let parentDataCy = (parentButton.getAttribute("data-cy") || "").toLowerCase();
            let parentText = (parentButton.textContent || "").toLowerCase();

            if (parentDataCy.includes("new-game") ||
                parentDataCy.includes("new-bot") ||
                parentDataCy.includes("rematch")) {
                isActionButton = true;
                actionType = parentDataCy.includes("bot") ? "new-bot" :
                parentDataCy.includes("rematch") ? "rematch" : "new-game";
            }
        }
    }

    if (isActionButton) {
        let now = Date.now();
        if (now - State.lastNewGameLogTs < 2000) return;
        State.lastNewGameLogTs = now;

        log("Action button detected:", actionType, "| Text:", btnText);

        setTimeout(() => handleNewGame(), 500);

        if (State.autoMatch && State.autoRunWasEnabled) {
            saveSetting("autoRun", true);
            syncToggleUI("btn-auto-run", true);
            State.autoRunWasEnabled = false;
        }
    }
};
document.addEventListener("mousedown", newGameActionMouseDownHandler, true);
_eventListeners.push({ element: document, type: "mousedown", handler: newGameActionMouseDownHandler, options: true });

// =====================================================
// Section 38: Visual Clearing on Game End
// =====================================================
function clearVisualsOnGameEnd() {
    State.statusInfo = "Game ended - clearing all visuals";

    UI.clearAll();

    State.mainPVLine = [];
    State.analysisPVLine = [];
    State.principalVariation = "";
    State.mainBestHistory = [];
    State.lastRenderedMainPV = "";
    State.lastRenderedAnalysisPV = "";
    State.lastMainPVDrawTime = 0;
    State.lastAnalysisPVDrawTime = 0;

    State.statusInfo = "Game Finished";
    UI.updateStatusInfo();
    UI.updatePVDisplay();

    Engine.stop();
    if (Engine.analysis) {
        Engine.analysis.postMessage("stop");
    }
    cancelPendingMove();
}

// =====================================================
// Section 39-42: Initialization and Main Loop (Fixed)
// =====================================================
function handleNewGame() {
    log("[NewGame] Detected! Resetting all state");

    State.statusInfo = "New game detected";
    State.gameEnded = false;

    UI.clearAll();

    premoveSafetyCache.clear();
    CCTAnalyzer.clearCache();
    ThreatDetectionSystem.clearCache();
    Object.keys(ATTACK_CACHE).forEach(function (k) { delete ATTACK_CACHE[k]; });

    ACPL.reset();
    MoveHistory.clear();

    SmartPremove.resetExecutionTracking();
    Engine.resetPremoveState();

    State.lastAutoRunFen = null;
    State._lastAnalysisFen = null;
    State._lastMainFen = null;
    State._lastPremoveFen = null;
    State.lastAnalyzedFen = null;
    State.lastPremoveAnalyzedFen = null;

    State.mainPVLine = [];
    State.analysisPVLine = [];
    State.principalVariation = "";

    lastFenProcessedMain = "";
    lastFenProcessedPremove = "";
    lastPremoveFen = "";
    lastPremoveUci = "";

    State.premoveExecutedForFen = null;
    State.premoveAnalysisInProgress = false;
    State.premoveLastAnalysisTime = 0;
    State.premoveRetryCount = 0;

    if (Engine.main) Engine.main.postMessage("ucinewgame");

    if (State.autoMatch && State.autoRunWasEnabled) {
        saveSetting("autoRun", true);
        syncToggleUI("btn-auto-run", true);
        State.autoRunWasEnabled = false;
    }

    let openingDisp = $("#currentOpeningDisplay");
    if (openingDisp) {
        openingDisp.textContent = "Game Start";
        openingDisp.style.color = "#1E90FF";
    }

    State.statusInfo = "New Game Started";
    UI.updateStatusInfo();
}

function startMainLoop() {
    if (State.loopStarted) {
        log("[MainLoop] Already started, skipping");
        return;
    }
    State.loopStarted = true;
    log("[MainLoop] Starting...");

    UI.initPanicKey();

    let clockLoop = function () {
        if (!_allLoopsActive) return;
        const startedAt = RuntimeGuard._nowMs();
        try {
            UI.updateClock();
        } catch (e) { }
        RuntimeGuard.trackLoop("clockLoop", startedAt);
        scheduleManagedTimeout(clockLoop, 1000 + randomInt(-150, 150));
    };
    clockLoop();

    let mainLoop = function () {
        if (!_allLoopsActive) return;
        const startedAt = RuntimeGuard._nowMs();
        try {
            UI.updateTurnLEDs();

            if (State.gameEnded) {
                scheduleNextMainLoop();
                return;
            }

            if (State.analysisMode) {
                analysisCheck();
                scheduleNextMainLoop();
                return;
            }

            let myTurn = isPlayersTurn();

            if (myTurn) {

                if (State.autoRun && Math.random() > 0.08) {
                    autoRunCheck();
                }
            } else {

                if (State.premoveEnabled && !State.premoveAnalysisInProgress) {
                    premoveCheck();
                }
            }
        } catch (e) {
            warn("[MainLoop] Error:", e);
        }

        RuntimeGuard.trackLoop("mainLoop", startedAt);
        scheduleNextMainLoop();
    };

    let scheduleNextMainLoop = function () {
        if (!_allLoopsActive) return;
        let baseInterval = CONFIG.UPDATE_INTERVAL;
        let jitter = (Math.random() - 0.5) * 60;
        let nextInterval = Math.max(80, Math.floor(baseInterval + jitter));
        scheduleManagedTimeout(mainLoop, nextInterval);
    };

    scheduleNextMainLoop();

    let autoMatchAttempts = 0;
    let autoMatchLoop = function () {
        if (!_allLoopsActive) return;
        const startedAt = RuntimeGuard._nowMs();
        try {
            autoMatchCheck();
        } catch (e) { }
        RuntimeGuard.trackLoop("autoMatchLoop", startedAt);
        let baseDelay = Math.min(3000 + (autoMatchAttempts * 200), 8000);
        let nextCheck = baseDelay + randomInt(-400, 400);
        autoMatchAttempts = (autoMatchAttempts + 1) % 10;
        scheduleManagedTimeout(autoMatchLoop, nextCheck);
    };
    autoMatchLoop();

    let gameOverLoop = function () {
        if (!_allLoopsActive) return;
        const startedAt = RuntimeGuard._nowMs();
        try {
            let isGameOver = false;
            let endReason = "";

            let gameOverSelectors = [
                ".game-over-modal-shell-container",
                ".game-over-modal-container",
                "[data-cy='game-over-modal-content']",
                ".game-over-modal-shell-content",
                "[data-cy='game-over-header']",
                ".game-over-modal-header-component",
                "[data-cy='game-over-ad-container']",
                ".game-over-modal-shell-buttons",
                "[data-cy='game-over-new-game-button']"
            ];

            for (let i = 0; i < gameOverSelectors.length; i++) {
                if ($(gameOverSelectors[i])) {
                    isGameOver = true;
                    endReason = "DOM";
                    break;
                }
            }

            if (!isGameOver) {
                let fen = getAccurateFen();
                if (fen) {
                    let game = getGame();
                    if (game && typeof game.isGameOver === 'function' && game.isGameOver()) {
                        isGameOver = true;
                        endReason = "API";
                    }
                }
            }

            if (isGameOver && !State.gameEnded) {
                log("[GameOver] Detected:", endReason);
                State.statusInfo = "Game ended: " + endReason;
                State.gameEnded = true;
                State.autoRunWasEnabled = State.autoRun;

                saveSetting("autoRun", false);
                syncToggleUI("btn-auto-run", false);

                UI.clearAll();
                UI._removeAllVisuals();

                if (State.autoMatch) {
                    scheduleManagedTimeout(function () {
                        if (_allLoopsActive) AutoMatch.try();
                    }, 2000 + randomInt(0, 1000));
                }
            }
        } catch (e) { }

        RuntimeGuard.trackLoop("gameOverLoop", startedAt);
        scheduleManagedTimeout(gameOverLoop, 1500 + randomInt(-250, 250));
    };
    gameOverLoop();

    let prevFen = "";
    let fenPollLoop = function () {
        if (!_allLoopsActive) return;
        const startedAt = RuntimeGuard._nowMs();
        try {
            let fen = getAccurateFen();
            if (!fen) {
                RuntimeGuard.trackLoop("fenPollLoop", startedAt);
                if (_allLoopsActive) scheduleManagedTimeout(fenPollLoop, CONFIG.FEN_POLL_INTERVAL);
                return;
            }

            if (fen.indexOf("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR") === 0) {
                if (prevFen && prevFen.indexOf("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR") !== 0) {
                    handleNewGame();
                }
            }
            prevFen = fen;

            if (Math.random() < 0.1) {
                applyAutoDepthFromOpponent();
                updateMoveNumber(fen);
                trimCaches();
            }
        } catch (e) { }

        RuntimeGuard.trackLoop("fenPollLoop", startedAt);
        if (_allLoopsActive) scheduleManagedTimeout(fenPollLoop, CONFIG.FEN_POLL_INTERVAL + randomInt(-30, 30));
    };
    fenPollLoop();

    let runtimeWatchdogLoop = function () {
        if (!_allLoopsActive) return;
        const startedAt = RuntimeGuard._nowMs();
        try {
            RuntimeGuard.checkCachePressure();
            RuntimeGuard.checkPremoveWatchdog();
            RuntimeGuard.checkEngineWatchdog();
            RuntimeGuard.logSoakSummary();
            UI.updateDiagnosticsDisplay();
        } catch (e) {
            warn("[Watchdog] Error:", e);
        }
        RuntimeGuard.trackLoop("runtimeWatchdogLoop", startedAt);
        scheduleManagedTimeout(runtimeWatchdogLoop, 5000 + randomInt(-600, 600));
    };
    runtimeWatchdogLoop();

    _premoveCacheClearInterval = setInterval(function () {
        if (!_allLoopsActive) {
            clearInterval(_premoveCacheClearInterval);
            return;
        }
        try {
            trimCaches();
        } catch (e) { }
    }, 30000);
}

function init() {
        State.statusInfo = "Starting initialization...";

        let loadPromise = isTampermonkey ? Promise.resolve(true) : loadStockfishManually();

        loadPromise.then(function () {
            return sleep(1000);
        }).then(function () {
            let attempts = 0;
            let waitForBoard = function () {
                if (getBoardElement() || attempts >= 30) return Promise.resolve();
                attempts++;
                return sleep(500).then(waitForBoard);
            };
            return waitForBoard();
        }).then(function () {
            return Engine.init();
        }).then(function (engineOk) {
            if (!engineOk) {
                err("Engine failed to initialize");
                return sleep(2000).then(function () {
                    return Engine.init();
                });
            }
            return true;
        }).then(function () {

            createPanel();
            let completeStartup = function () {
                startMainLoop();
                UI.updatePVDisplay();
                State.statusInfo = "Ready";
                UI.updateStatusInfo();

                if (State.analysisMode) {
                    Engine.loadAnalysisEngine();
                    State._lastAnalysisFen = null;
                    analysisCheck();
                }

                log("Initialization complete!");
            };

            if (!State.onboardingAccepted) {
                showWelcomeConsentModal(completeStartup);
            } else {
                completeStartup();
            }
        }).catch(function (e) {
            err("Initialization error:", e);
        });
    }

    function cleanupAll() {
        _allLoopsActive = false;
        clearManagedTimeouts();

        cleanupEventListeners();
        UI.clearAll();
        UI._removeAllVisuals();

        predictedFenCache.clear();
        premoveSafetyCache.clear();
        CCTAnalyzer.clearCache();
        ThreatDetectionSystem.clearCache();
        Object.keys(ATTACK_CACHE).forEach(function (k) { delete ATTACK_CACHE[k]; });

        if (_premoveCacheClearInterval) {
            clearInterval(_premoveCacheClearInterval);
            _premoveCacheClearInterval = null;
        }

        if (pendingMoveTimeoutId) {
            clearTimeout(pendingMoveTimeoutId);
            pendingMoveTimeoutId = null;
        }

        if (_resignTimeout) {
            clearTimeout(_resignTimeout);
            _resignTimeout = null;
        }

        if (_resignObserver) {
            _resignObserver.disconnect();
            _resignObserver = null;
        }

        let welcomeOverlay = $("#cap-welcome-overlay");
        if (welcomeOverlay && welcomeOverlay.parentNode) {
            welcomeOverlay.parentNode.removeChild(welcomeOverlay);
        }

        Engine.terminate();
        cancelPendingMove();
    }

    let _cleanupDone = false;
    function runCleanupOnce() {
        if (_cleanupDone) return;
        _cleanupDone = true;
        cleanupAll();
    }

    window.addEventListener("beforeunload", function () {
        runCleanupOnce();
    });

    let _initStarted = false;
    function startInitOnce() {
        if (_initStarted) return;
        _initStarted = true;
        init();
    }

    if (document.readyState === "loading") {
        let domReadyHandler = function () {
            document.removeEventListener("DOMContentLoaded", domReadyHandler);
            startInitOnce();
        };
        document.addEventListener("DOMContentLoaded", domReadyHandler);
    } else {
        scheduleManagedTimeout(startInitOnce, 500);
    }

// =====================================================
// End of Chess.com Assistant Pro
// =====================================================

})();