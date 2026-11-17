/* Grokwell console behaviour for the Vorple release.
   Builds the device-feed panel beside the shell and exposes window.grokFeed(view),
   which the Inform game calls through the Grokwell Visuals extension's "show feed".
   Views: "train" (default, web/grok-train.js), "train-calm" (the line camera once the DoS
   is gone), "page:<name>" (pages/<name>.html in an iframe), "plc" (motion-control Modbus
   write flood), "plc-ok" (its registers, steady),
   "plc-stalled" / "hmi-stalled" / "train-stranded" (shaker gone, firmware not yet reverted:
   operations has stopped the train out in the field and holds it there until the SOC signs off), "hmi" (operator dashboard while the
   DoS runs; its controls work, and get overwritten), "hmi-ok" (dashboard, nominal), "ayb" (DarkSeek's AYBABTU defacement on the HMI) and
   "ayb-trap" (the same taunt, shown when the watchdog kicks the player off motion-control),
   and "train-saved" (the win: the ending sequence, which takes over the whole screen). */
(function () {
  function boot() {
    var body = document.body;
    if (document.getElementById("device-feed")) return;
    body.classList.add("grok");

    // --- device-feed panel (appended at body level so Vorple can't wipe it) ---
    var feed = document.createElement("aside");
    feed.id = "device-feed";
    feed.innerHTML =
      '<div class="cap" id="grok-cap"><span class="dot"></span><span id="grok-caplabel">metro-rail · erratic</span></div>' +
      '<div class="stage" id="grok-stage"></div>';
    body.appendChild(feed);

    var stage = document.getElementById("grok-stage");
    var cap = document.getElementById("grok-cap");
    var caplabel = document.getElementById("grok-caplabel");

    var tick = 0;   // interval for the live views; cleared on every switch
    function live(fn, ms) { fn(); tick = setInterval(fn, ms); }
    function rnd(n) { return Math.floor(Math.random() * n); }

    function plcView(ok, stalled) {
      var rows = "";
      for (var i = 0; i < 14; i++) rows += '<div class="reg"><span class="a">%MW' + (100 + i) + '</span><span class="v" data-i="' + i + '">0</span></div>';
      stage.innerHTML = '<div class="plc' + (ok ? " ok" : "") + '"><div class="plc-h">Grokwell PLC \u00B7 holding registers \u00B7 :502</div>' +
        (stalled ? '<div class="plc-stall">\u25A0 OPERATIONS HOLD \u2014 motor enable 0, set from the HMI</div>'
         : ok ? '<div class="plc-ok">\u2713 writes from the HMI only</div>' : '') +
        '<div class="regs">' + rows + '</div><div class="plc-log" id="grok-plclog"></div></div>';
      var vs = stage.querySelectorAll(".reg .v"), log = document.getElementById("grok-plclog"), lines = [];
      if (ok) {   // steady: the HMI's setpoints, and the odd write when someone touches it
        var fixed = [!stalled && hmiState.run ? 1 : 0, 1, stalled ? 0 : hmiState.spd, 0, 1200, 0, 0, 3, 0, 0, 512, 0, 0, 7];
        for (var j = 0; j < vs.length; j++) vs[j].textContent = fixed[j];
        lines = hmiState.writes.slice(0, 9);
        log.textContent = lines.length ? lines.join("\n") : "(no writes since the flood stopped)";
        if (stalled) log.textContent = "WRITE  fc05  %QX0.0 \u2190 0   src 10.42.7.10 (hmi) -- ops hold, SOC-0734\n" + log.textContent.replace("(no writes since the flood stopped)", "");
        return;
      }
      live(function () {
        for (var k = 0; k < vs.length; k++) if (k < 3 || Math.random() < 0.3) vs[k].textContent = k === 0 || k === 1 ? rnd(2) : rnd(k === 2 ? 101 : 65536);
        lines.unshift("WRITE  fc16  %MW10" + rnd(3) + " \u2190 " + rnd(101) + "   src 172.17.4.1:40112");
        lines = lines.slice(0, 9); log.textContent = lines.join("\n");
      }, 140);
    }

    // The operator dashboard. The controls work: each press is logged with what the
    // platform radios back. While the shaker floods the PLC, every command is overwritten a
    // moment later; once it's gone, they hold. (No camera footage -- just the log.)
    var hmiState = { run: true, spd: 42, log: [], writes: [] };
    var RADIO = {
      bad: {
        stop: ["It stopped! ...And there it goes again!", "Stopped -- no, now it's backing up. Was that you?", "Brakes came on for about a second. Then it just took off."],
        run: ["It's moving! ...and it's stopped again.", "Rolling -- oh, now it's going backwards.", "It went. Then it changed its mind."],
        up: ["Oh, it sped up like you said, but now it's doing something else.", "Faster, yep! And now it's crawling. Huh.", "It lurched forward, then slammed on the brakes."],
        down: ["It's slowing... slowing... and it's off like a rocket.", "It eased off. For about two seconds.", "Slower, then faster, then slower. Pick one?"],
        dir: ["Doesn't matter, it's going backwards anyway."]
      },
      ok: {
        stop: ["It stopped. Right on the marks. Staying put.", "Holding at the platform. Doors look happy."],
        run: ["Rolling. Smooth, forward, like it should.", "And off it goes. Nice and steady."],
        up: ["Picking up speed. Steady as anything.", "A bit quicker. Still smooth."],
        down: ["Easing off. Nice and gentle.", "Slower. Nobody's even spilling their coffee."],
        dir: ["Forward's fine by us."],
        still: ["Speed's set, but it's not going anywhere -- you've got it on STOP."],
        idle: ["Still stopped. Still good."]
      }
    };
    // Held: once the train could be stopped, operations stopped it out in the field, and it
    // stays there until the SOC can say it's safe to move. The HMI refuses everything.
    RADIO.stalled = {
      run: ["Negative -- ops says it stays parked out there till you can tell us it's safe.", "Not moving it. Not till we know who else has their hands on it.", "We've got crew standing in a field next to it. It stays put."],
      stop: ["It's stopped. That's the plan. It stays stopped."],
      up: ["Speed doesn't matter, it's not going anywhere till you sign off."],
      down: ["Speed doesn't matter, it's not going anywhere till you sign off."],
      dir: ["It's not going either way till you give us the all-clear."]
    };
    function pick(a) { return a[rnd(a.length)]; }
    var broughtIn = false;
    function hmiView(ok, stalled) {
      stage.innerHTML = '<div class="hmi' + (ok ? " ok" : "") + (stalled ? " stalled" : "") + '">' +
        '<div class="hmi-top"><span>GROKWELL-HMI</span><span>Metro-Rail Line 1</span></div>' +
        '<div class="tile wide"><div class="k">Train motor</div><div class="pills"><button class="pill" id="g-run">RUN</button><button class="pill" id="g-stop">STOP</button></div></div>' +
        '<div class="tile"><div class="k">Speed</div><div class="v" id="g-spd">0%</div><div class="gauge"><span id="g-bar"></span></div>' +
          '<div class="steps"><button class="step" id="g-down">\u2212</button><button class="step" id="g-up">+</button></div></div>' +
        '<div class="tile"><div class="k">Direction</div><button class="v dirv" id="g-dir">FWD</button><div class="lock">\uD83D\uDD12 locked</div></div>' +
        '<div class="tile wide"><div class="k">Status</div><div class="v st" id="g-st"></div></div>' +
        '<div class="tile wide"><div class="k">Line 1 radio</div><div class="radio" id="g-log"></div></div></div>';
      var $ = function (id) { return document.getElementById(id); };
      var run = $("g-run"), stop = $("g-stop"), spd = $("g-spd"), bar = $("g-bar"), dir = $("g-dir"), st = $("g-st"), logEl = $("g-log");
      var hold = 0;   // erratic view: ms until the chaos overwrites what the operator just set
      function show(r, s, f, status) {
        run.className = "pill" + (r ? " on" : ""); stop.className = "pill" + (r ? "" : " on");
        spd.textContent = s + "%"; bar.style.width = s + "%"; dir.textContent = f ? "\u25B6 FWD" : "\u25C0 REV";
        if (status) st.textContent = status;
      }
      function paintLog() { logEl.innerHTML = hmiState.log.slice(0, 6).map(function (l) { return "<div" + (l.me ? ' class="me"' : "") + ">" + l.t + "</div>"; }).join(""); }
      function say(me, t) { hmiState.log.unshift({ me: me, t: t }); hmiState.log.length = Math.min(hmiState.log.length, 12); paintLog(); }
      function press(cmd, label) {
        // The win: once Operations has handed the line back, RUN on the HMI brings it in.
        if (cmd === "run" && ok && !stalled && document.body.getAttribute("data-line") === "released" &&
            !broughtIn && window.vorple && vorple.prompt && vorple.prompt.queueCommand) {
          broughtIn = true;
          vorple.prompt.queueCommand("grokwell-bring-it-in", true);
        }
        say(true, "\u203A " + label + " sent");
        if (cmd === "dir") st.textContent = "Direction is locked forward from the dashboard by design.";
        if (stalled) {   // operations hold: the dashboard is locked to STOP
          hmiState.log[0].t = "\u203A " + label + " refused \u2014 operations hold"; paintLog();
          setTimeout(function () { say(false, "Platform 3: " + pick(RADIO.stalled[cmd])); }, 700);
          return;
        }
        if (ok) {
          var line = RADIO.ok[cmd];
          if (cmd === "stop") { line = hmiState.run ? RADIO.ok.stop : RADIO.ok.idle; hmiState.run = false; }
          if (cmd === "run") hmiState.run = true;
          if (cmd === "up" || cmd === "down") {
            hmiState.spd = Math.max(0, Math.min(100, hmiState.spd + (cmd === "up" ? 10 : -10)));
            if (!hmiState.run) line = RADIO.ok.still;
          }
          hmiState.writes.unshift("WRITE  fc06  %MW10" + (cmd === "up" || cmd === "down" ? 2 : 0) + " \u2190 " +
            (cmd === "up" || cmd === "down" ? hmiState.spd : hmiState.run ? 1 : 0) + "   src 10.42.7.10 (hmi)");
          hmiState.writes.length = Math.min(hmiState.writes.length, 9);
          show(hmiState.run, hmiState.spd, true, hmiState.run ? "nominal \u2014 commands match the line" : "stopped at the platform \u2014 holding");
          setTimeout(function () { say(false, "Platform 3: " + pick(line)); }, 700);
        } else {
          hold = 1100;   // it does what you asked, briefly...
          var r = cmd === "run" ? true : cmd === "stop" ? false : Math.random() < 0.6;
          show(r, cmd === "up" ? 70 : cmd === "down" ? 15 : rnd(101), true, cmd === "dir" ? null : "command accepted");
          setTimeout(function () { say(false, "Platform 3: " + pick(RADIO.bad[cmd])); }, 900);
        }
      }
      [[run, "run", "RUN"], [stop, "stop", "STOP"], [$("g-up"), "up", "SPEED +10"], [$("g-down"), "down", "SPEED \u221210"], [dir, "dir", "DIRECTION"]].forEach(function (b) {
        b[0].addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep the shell's input focused
        b[0].addEventListener("click", function () { press(b[1], b[2]); });
      });
      paintLog();
      if (stalled) { show(false, 0, true, "HELD \u2014 operations hold until the SOC signs off"); return; }
      if (ok) { show(hmiState.run, hmiState.spd, true, hmiState.run ? "nominal \u2014 commands match the line" : "stopped at the platform \u2014 holding"); return; }
      live(function () {
        if (hold > 0) { hold -= 420; return; }
        show(Math.random() < 0.6, rnd(101), Math.random() < 0.55, ["UNCOMMANDED STATE CHANGE", "SETPOINT OVERRIDDEN", "OPERATOR INPUT IGNORED"][rnd(3)]);
      }, 420);
    }
    function aybView() {
      stage.innerHTML = '<div class="ayb"><div class="ayb-face"><img src="pages/img/darkseek_laughing.gif" alt=""></div><div class="jp">\u304A\u524D\u306E\u57FA\u5730\u306F\u3059\u3079\u3066\u6211\u3005\u306E\u3082\u306E\u3060</div>' +
        '<div class="en">All your base are belong to us</div><div class="sig">// darkseek</div><div class="scan"></div></div>';
    }

    function trainScene() {
      stage.innerHTML = "";
      if (window.GrokTrain) window.GrokTrain.mount(stage);
    }
    // After the DoS is gone and before the win: the line camera on the train holding at
    // Market Station. A still of the win's settle shot, before anyone starts cheering, and with no hood
    // in the window -- that's the ending's reveal.
    function trainCalm() {
      stage.innerHTML = "";
      if (window.GrokTrain) { window.GrokTrain.mount(stage, { mode: "saved", from: 1, nohero: true }); window.GrokTrain.still(1, 4.3); }
    }
    // After the shaker is stopped and before the firmware revert: held out in the field.
    function trainStranded() {
      stage.innerHTML = "";
      if (window.GrokTrain) window.GrokTrain.mount(stage, { mode: "stranded" });
    }

    // --- the ending -------------------------------------------------------------------
    // train arrives in the panel -> the panel grows to full screen on the cheering hold ->
    // credits roll over it, blurred and dimmed (no zoom yet) -> the same frame picks back up,
    // passengers step off and the camera pushes in on one window -> optional video clips
    // (window.GROK_CLIPS, e.g. ["media/clip1.mp4","media/clip2.mp4"]) -> the laptop terminal
    // (lines from window.GROK_EPILOGUE, see web/grok-epilogue.js). Esc or Skip leaves at any point.
    var CREDITS = [   // placeholder credits -- edit freely
      ["GROKWELL", "an incident-response text adventure"],
      ["Story & design", "irish-bug"],
      ["Train, cameras & code", "Claude"],
      ["DarkSeek portrait", "made with Gemini"],
      ["Ending footage", "made with Google Vids"],
      ["Built with", "Inform 7 \u00B7 Vorple by Juhana Leinonen \u00B7 Lexend"],
      ["Based on", "the Grokwell OT/ICS incident-response CTF"],
      ["", "Thank you for playing."]
    ];
    var endTimers = [], endOn = false, endExit = "hmi-ok";
    function later(fn, ms) { endTimers.push(setTimeout(fn, ms)); }
    function endingCleanup() {
      endTimers.forEach(clearTimeout); endTimers = [];
      if (!endOn) return;
      endOn = false;
      feed.classList.remove("ending", "full", "credits");
      feed.style.cssText = "";
      Array.prototype.slice.call(feed.querySelectorAll(".grok-credits,.grok-term,.grok-skip,.grok-clip,.grok-screenbox,.grok-black")).forEach(function (n) { n.remove(); });
      screenLayer = null; screenBox = null;
      document.removeEventListener("keydown", endKey);
    }
    function endKey(e) { if (e.key === "Escape") window.grokFeed(endExit); }
    function endGrow() {
      var r = feed.getBoundingClientRect();
      feed.style.cssText = "position:fixed;z-index:60;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
      feed.offsetWidth;                       // commit the starting box, then let the transition carry it out
      feed.classList.add("ending", "full");
      feed.style.left = "0px"; feed.style.top = "0px"; feed.style.width = "100vw"; feed.style.height = "100vh";
    }
    function endCredits(final) {
      feed.classList.add("credits");
      var c = document.createElement("div"); c.className = "grok-credits";
      c.innerHTML = '<div class="roll">' + CREDITS.map(function (r) {
        return '<div class="row">' + (r[0] ? '<div class="k">' + r[0] + '</div>' : '') + '<div class="v">' + r[1] + '</div></div>'; }).join("") + '</div>';
      feed.appendChild(c);
      c.firstChild.addEventListener("animationend", function () {
        c.remove(); feed.classList.remove("credits");
        if (final) return;   // a loss: the credits are the end
        later(function () { if (window.GrokTrain) window.GrokTrain.next(); }, 1400);   // un-blur, a beat, then it picks back up
      });
    }
    // The clips (and the screen track) are fetched as soon as the ending starts, so they're
    // ready by the time the zoom reaches them, a minute later, after the credits.
    var preloaded = [], track = null, endMode = "overlay";
    function endPreload() {
      var m = null;
      endMode = m ? m[1] : (window.GROK_SCREEN_MODE || "overlay");
      var C = window.GROK_CLIPS || [];
      var list = Array.isArray(C) ? C : (C[endMode] || []);
      preloaded = list.map(function (src) {
        var v = document.createElement("video"); v.className = "grok-clip"; v.src = src;
        v.preload = "auto"; v.muted = true; v.playsInline = true; v.load(); return v; });
      track = null;
      if (window.GROK_TRACK && window.GrokScreen) {
        fetch(window.GROK_TRACK).then(function (r) { return r.json(); }).then(function (j) { track = j; }).catch(function () {});
      }
    }
    // The laptop screen layer, riding on the footage (see web/grok-screen.js)
    var screenLayer = null, screenBox = null;
    function trackAt(t) {
      var F = track.frames, i = Math.round(t * track.fps) - F[0].i;
      return F[Math.max(0, Math.min(F.length - 1, i))].H;
    }
    function screenMount() {
      screenBox = document.createElement("div"); screenBox.className = "grok-screenbox";
      feed.appendChild(screenBox);
      screenLayer = window.GrokScreen.build(screenBox, "both", 3);
    }
    function screenPlace(t, H) {
      var r = feed.getBoundingClientRect();
      screenLayer.place(H || trackAt(t), track.width, track.height, r.width, r.height);
    }
    function screenFollow(v) {   // overlay mode: draw on every video frame
      if (!track) return;
      if (!screenLayer) screenMount();
      var tick = function () {
        if (!endOn || v.ended) return;
        screenPlace(v.currentTime); screenLayer.show(v.currentTime);
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
      };
      tick();
    }
    function endClips(done) {
      var clips = preloaded.slice();
      (function play() {
        if (!clips.length || !endOn) { done(); return; }
        var v = clips.shift(), lastClip = !clips.length;
        v.onended = function () {
          var old = v; play();
          if (!lastClip) later(function () { old.remove(); }, 1600);   // the last one stays, frozen, under the laptop screen
        };
        v.onerror = function () { v.remove(); play(); };
        feed.appendChild(v);                  // fades in over the last in-engine frame
        var p = v.play(); if (p && p.catch) p.catch(function () { v.remove(); play(); });
        if (lastClip && endMode === "overlay") screenFollow(v);
      })();
    }
    // After the clip: the shell on the laptop, in focus, and the epilogue typed into it
    function endScreen() {
      if (!track || !window.GrokScreen) { endTerminal(); return; }
      if (!screenLayer) screenMount();
      // glide from the tracked (perspective) placement onto its flat fit, so the frozen screen
      // can be drawn with a 2D transform (see GrokScreen.flat)
      var tEnd = track.frames[track.frames.length - 1].t, H0 = trackAt(tEnd), H1 = window.GrokScreen.flat(H0), H = H0, t0 = performance.now();
      (function glide() {
        if (!endOn || !screenLayer) return;
        var u = Math.min(1, (performance.now() - t0) / 700), e = u * u * (3 - 2 * u);
        H = u < 1 ? H0.map(function (v, i) { return v + (H1[i] - v) * e; }) : H1;
        screenPlace(tEnd, H);
        if (u < 1) requestAnimationFrame(glide);
      })();
      window.addEventListener("resize", function () { if (endOn && screenLayer) screenPlace(tEnd, H); });
      epilogue();
    }
    // The epilogue, typed onto the laptop screen. Entries of window.GROK_EPILOGUE (see
    // web/grok-epilogue.js): a command typed at the prompt, then its output, a vim session,
    // a docker-style progress readout, or the cut to black.
    function epilogue() {
      var sc = window.GROK_SCREEN || {}, prompt = sc.prompt || "$ ";
      var hist = (sc.shell || []).slice(), cur = prompt, blink = true, vim = null;
      var lines = (window.GROK_EPILOGUE || []).slice();
      var keyGap = function () { return 45 + Math.random() * 70; };
      function draw() {
        if (vim) {
          var bottom = vim.cmd !== null ? vim.cmd + (blink ? "█" : " ") : vim.msg;
          screenLayer.rows(window.GrokScreen.vimRows(vim.buf, bottom,
            { cols: screenLayer.cols, cursor: vim.cmd === null && blink ? { row: vim.row, col: vim.buf[vim.row].length } : null }));
        } else {
          screenLayer.rows(hist.concat([cur + (blink ? "█" : " ")]).map(function (t) { return { t: t }; }));
        }
      }
      (function cursor() { if (!endOn) return; blink = !blink; draw(); later(cursor, 500); })();
      // type text into the prompt line (or vim's command line), then go on
      function type(txt, inVim, done) {
        var i = 0;
        (function key() {
          if (!endOn) return;
          if (i >= txt.length) { later(done, 260); return; }
          if (inVim) vim.cmd += txt.charAt(i++); else cur += txt.charAt(i++);
          blink = true; draw(); later(key, keyGap());
        })();
      }
      // print lines one at a time
      function print(out, gap, done) {
        var o = out ? String(out).split("\n") : [];
        (function next() {
          if (!endOn) return;
          if (!o.length) { done(); return; }
          hist.push(o.shift()); draw(); later(next, gap || 90);
        })();
      }
      // a vim session: steps of { row, del } (backspace characters off the end of a line),
      // { cmd, msg } (type an ex command, then show vim's reply), { dd: row }, { wait }
      function vimRun(V, done) {
        vim = { buf: V.lines.slice(), row: 0, cmd: null, msg: V.info || "" };
        var steps = V.keys.slice(); draw();
        (function step() {
          if (!endOn) return;
          if (!steps.length) { vim = null; draw(); done(); return; }
          var k = steps.shift();
          if (k.wait) { later(step, k.wait); return; }
          if (k.del) {
            vim.row = k.row; vim.msg = ""; var n = k.del.length;
            (function bs() {
              if (!endOn) return;
              if (!n--) { later(step, 400); return; }
              vim.buf[k.row] = vim.buf[k.row].slice(0, -1); blink = true; draw(); later(bs, 55);
            })();
            return;
          }
          if (k.dd !== undefined) {
            later(function () { vim.buf.splice(k.dd, 1); vim.row = Math.min(k.dd, vim.buf.length - 1); vim.msg = ""; draw(); later(step, 500); }, 250);
            return;
          }
          if (k.cmd) {
            vim.cmd = "";
            type(k.cmd, true, function () {
              vim.cmd = null; vim.msg = typeof k.msg === "function" ? k.msg(vim.buf) : (k.msg || ""); draw();
              later(step, k.pause || 700);
            });
          }
        })();
      }
      // docker's layer bars filling up, until the cut: a pull fills them together, a load
      // (P.style "load") one layer at a time and leaves each full bar on screen
      function progress(P, done) {
        var load = P.style === "load", base = hist.length, t0 = performance.now();
        if (P.style === "scp") {          // one scp line climbing to 100%, a beat, then on
          var ms = P.ms || 3000;
          (function tickScp() {
            if (!endOn) return;
            hist.length = base;
            var f = Math.min(1, (performance.now() - t0) / ms);
            hist.push((P.file + new Array(47).join(" ")).slice(0, 46) + ("   " + Math.round(f * 100)).slice(-3) + "%" +
              ("     " + Math.round(f * P.mb)).slice(-5) + "MB  10.4MB/s   00:0" +
              (f < 1 ? Math.max(1, Math.ceil((1 - f) * ms / 1000)) + " ETA" : Math.ceil(ms / 1000)));
            draw();
            if (f < 1) later(tickScp, 160); else later(done, 900);
          })();
          return;
        }
        var bars = P.layers.map(function (id, i) {
          return { id: id, f: 0, v: 0.04 + Math.random() * 0.1, mb: [].concat(P.mb)[i] || [].concat(P.mb)[0] };
        });
        (function tick() {
          if (!endOn) return;
          hist.length = base;
          bars.forEach(function (b, i) {
            if (load && i && bars[i - 1].f < 1) return;
            b.f = Math.min(1, b.f + b.v * Math.random() * (load ? 2 : 1));
            var w = 50, n = Math.round(b.f * w),
                bar = "[" + new Array(n + 1).join("=") + ">" + new Array(w - n).join(" ") + "]  " + (b.f * b.mb).toFixed(1) + "MB/" + b.mb + "MB";
            hist.push(load ? b.id + ": Loading layer " + bar : b.f >= 1 ? b.id + ": Download complete" : b.id + ": Downloading " + bar);
          });
          draw();
          if (performance.now() - t0 < (P.ms || 5000)) later(tick, 160); else done();
        })();
      }
      (function line() {
        if (!endOn || !lines.length) return;
        var L = lines.shift();
        type(L.type || "", false, function () {
          hist.push(cur); cur = "";
          var after = function () { cur = L.prompt || prompt; prompt = cur; draw(); later(line, L.pause || 600); };
          if (L.vim) { draw(); later(function () { vimRun(L.vim, function () { print(L.out, L.gap, after); }); }, 350); return; }
          print(L.out, L.gap, function () {
            if (L.progress) { progress(L.progress, function () { if (L.cut) cut(); }); return; }
            if (L.cut) { cut(); return; }
            after();
          });
        });
      })();
    }
    function cut() {   // hard cut to black: the end
      var b = document.createElement("div"); b.className = "grok-black"; feed.appendChild(b);
    }
    function endingView() {
      stage.innerHTML = "";
      if (!window.GrokTrain) return;
      endOn = true;
      endExit = "hmi-ok";
      endPreload();
      document.addEventListener("keydown", endKey);
      var skip = document.createElement("button"); skip.className = "grok-skip"; skip.textContent = "Skip \u25B8";
      skip.onclick = function () { window.grokFeed("hmi-ok"); };
      feed.appendChild(skip);
      var post = false;   // dev: start at the post-credits zoom, already full screen
      if (post) endGrow();
      window.GrokTrain.mount(stage, { mode: "saved", from: post ? 2 : 0, onHold: function (i, last) {
        if (!last) { endGrow(); later(endCredits, 2800); }
        else endClips(endScreen);
      } });
    }

    // A loss: the laughing DarkSeek grows to fill the screen, then the credits roll over it.
    // No post-credits scene. Esc or Skip goes back to the (still erratic) line cameras.
    function lostView() {
      aybView();
      endOn = true;
      endExit = "train";
      document.addEventListener("keydown", endKey);
      var skip = document.createElement("button"); skip.className = "grok-skip"; skip.textContent = "Skip \u25B8";
      skip.onclick = function () { window.grokFeed("train"); };
      feed.appendChild(skip);
      endGrow();
      later(function () { endCredits(true); }, 6000);
    }

    // Tab completion. The first word completes from the commands the game knows; later words
    // from the names in the current folder, which the game sends before every prompt
    // (grokNames). Several matches: fill in what they share and show them for a moment.
    var COMMANDS = ["7z", "base64", "cat", "cd", "cheatsheet", "clear", "curl", "dispatch", "docker", "echo",
      "exit", "file", "flux", "grep", "gwflash", "head", "help", "history", "hostname", "id", "ip",
      "journalctl", "kill", "less", "look", "ls", "nano", "open", "ps", "pwd", "reset", "score", "ss",
      "ssh", "strings", "sudo", "systemctl", "tail", "tcpdump", "tshark", "uname", "whoami"];
    var names = [];
    window.grokNames = function (t) {
      names = String(t || "").split(/\s+/).filter(function (n, i, a) { return n && a.indexOf(n) === i; });
    };
    var tabNote = document.createElement("div");
    tabNote.id = "grok-tab";
    body.appendChild(tabNote);
    var tabTimer = 0;
    function shared(list) {
      var p = list[0];
      list.forEach(function (w) { while (w.indexOf(p) !== 0) p = p.slice(0, -1); });
      return p;
    }
    document.addEventListener("keydown", function (e) {
      var el = e.target;
      if (e.key !== "Tab" || !el || el.tagName !== "INPUT" || !el.closest || !el.closest("#vorple")) return;
      e.preventDefault();
      var v = el.value, cut = v.lastIndexOf(" ") + 1, word = v.slice(cut);
      var first = v.slice(0, cut).trim() === "" || /^sudo\s*$/.test(v.slice(0, cut).trim());
      var pool = first ? COMMANDS : names;
      var hits = pool.filter(function (n) { return n.indexOf(word) === 0; });
      if (!hits.length) return;
      var done = hits.length === 1 ? hits[0] + (/\/$/.test(hits[0]) ? "" : " ") : shared(hits);
      el.value = v.slice(0, cut) + done;
      if (hits.length > 1) {
        tabNote.textContent = hits.join("   ");
        tabNote.classList.add("on");
        clearTimeout(tabTimer);
        tabTimer = setTimeout(function () { tabNote.classList.remove("on"); }, 3500);
      }
    }, true);

    // The Encabulator brochure (pages/encabulator.html) says when it's been read to the fine
    // print; the game awards it through a command the player never sees.
    var finePrint = false;
    window.addEventListener("message", function (e) {
      if (finePrint || !e.data || e.data.grok !== "fine-print") return;
      if (!window.vorple || !vorple.prompt || !vorple.prompt.queueCommand) return;
      finePrint = true;
      vorple.prompt.queueCommand("grokwell-fine-print-7f3a", true);
    });

    var caps = {
      train: ["metro-rail · erratic", ""],
      "page:incident-brief": ["dispatch · incident brief", "ok"],
      "page:cheat-sheet": ["reference · shell cheat sheet", "ok"],
      "page:encabulator": ["grokwell · encabulator brochure", "ok"],
      "page:flux-agent-quickstart": ["flux-agent · quickstart", "ok"],
      "page:flux-vector-quickstart": ["flux-vector · quickstart", "ok"],
      "page:hmi-manual": ["grokwell-hmi · operator's manual (1999)", "ok"],
      plc: ["motion-control · grokwell plc", ""],
      "page:grafana": ["secops · grafana · soc overview", "ok"],
      "plc-ok": ["motion-control · grokwell plc · nominal", "ok"],
      "train-calm": ["metro-rail · holding at market station", "ok"],
      "train-stranded": ["metro-rail · held in the field", "warn"],
      "plc-stalled": ["motion-control · grokwell plc · operations hold", "warn"],
      "hmi-stalled": ["grokwell-hmi · operations hold", "warn"],
      hmi: ["grokwell-hmi · erratic", "bad"],
      "hmi-ok": ["grokwell-hmi · nominal", "ok"],
      ayb: ["grokwell-hmi · COMPROMISED", "bad"],
      lost: ["// darkseek", "bad"],
      "ayb-trap": ["motion-control · session terminated", "bad"],
      "train-saved": ["market station · on schedule", "ok"]
    };

    // Flux's sulk: elements Inform places with class "grok-slow" are typed out one at a
    // time, in order -- the mood's dots slowly, then the complaint at a normal clip.
    (function () {
      var busy = false;
      var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      function next() {
        var el = document.querySelector(".grok-slow:not(.grok-typed)");
        if (!el) { busy = false; return; }
        busy = true;
        el.classList.add("grok-typed");
        if (still) { next(); return; }
        var full = el.textContent, i = 0, dots = el.classList.contains("grok-slow-dots");
        el.textContent = "";
        (function step() {
          if (i >= full.length) { setTimeout(next, dots ? 300 : 0); return; }
          var ch = full.charAt(i++);
          el.textContent += ch;
          setTimeout(step, dots ? (ch === "." ? 420 : 55) : 24);
        })();
      }
      window.grokSlow = function () { if (!busy) next(); };
    })();

    window.grokFeed = function (view) {
      view = String(view || "train");
      if (window.GrokTrain) window.GrokTrain.destroy();   // stop the train RAF when switching away
      clearInterval(tick);
      endingCleanup();
      if (view.indexOf("page:") === 0) {
        var name = view.slice(5);
        stage.innerHTML = '<iframe src="pages/' + name + '.html" title="' + name + '"></iframe>';
      } else if (view === "plc") { plcView(false); }
      else if (view === "plc-ok") { plcView(true); }
      else if (view === "plc-stalled") { plcView(true, true); }
      else if (view === "train-stranded") { trainStranded(); }
      else if (view === "hmi-stalled") { hmiView(true, true); }
      else if (view === "train-calm") { trainCalm(); }
      else if (view === "hmi") { hmiView(false); }
      else if (view === "hmi-ok") { hmiView(true); }
      else if (view === "ayb" || view === "ayb-trap") { aybView(); }
      else if (view === "train-saved") { endingView(); }
      else if (view === "lost") { lostView(); }
      else { trainScene(); }
      var c = caps[view] || [view.replace("page:", ""), ""];
      cap.className = "cap " + (c[1] || "");
      caplabel.textContent = c[0];
    };

    // --- OG terminal toggle (remembers the choice) ---
    var btn = document.createElement("button");
    btn.id = "og-toggle";
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = '<span class="sw"></span><span id="og-label">OG terminal view</span>';
    body.appendChild(btn);
    var label = document.getElementById("og-label");
    function setOG(on) {
      body.classList.toggle("og", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      label.textContent = on ? "Clean view" : "OG terminal view";
      try { localStorage.setItem("grokwell-og", on ? "1" : "0"); } catch (e) {}
    }
    var init = false;
    try { init = localStorage.getItem("grokwell-og") === "1"; } catch (e) {}
    setOG(init);
    btn.addEventListener("click", function () { setOG(!body.classList.contains("og")); });

    // --- "my thoughts" toggle: off is hard mode. The game asks window.grokHard before every
    // thought, so switching only changes the thoughts that come after (remembers the choice). ---
    var tbtn = document.createElement("button");
    tbtn.id = "thoughts-toggle";
    tbtn.innerHTML = '<span class="sw"></span><span><i>my thoughts</i>: <span id="thoughts-state">on</span></span>';
    body.appendChild(tbtn);
    function setHard(on) {
      window.grokHard = on;
      tbtn.setAttribute("aria-pressed", on ? "false" : "true");
      tbtn.title = on ? "Hard mode: the player's thoughts (and the hints in them) are left out from here on"
                      : "Turn off for hard mode: no more thoughts, and no hints in them";
      document.getElementById("thoughts-state").textContent = on ? "off · hard mode" : "on";
      try { localStorage.setItem("grokwell-hard", on ? "1" : "0"); } catch (e) {}
    }
    var hard = false;
    try { hard = localStorage.getItem("grokwell-hard") === "1"; } catch (e) {}
    setHard(hard);
    tbtn.addEventListener("click", function () { setHard(!window.grokHard); });

    // --- score pill. The game calls grokScore(score, max, gained, comment) on every award; a
    // change bumps the pill and drops the points under it. Since 2026-11-13 the game prints the
    // comment in the terminal instead and passes "" here. ---
    var pill = document.createElement("div");
    pill.id = "grok-score";
    pill.innerHTML = '<span class="k">Score</span><b class="n">0</b><span class="of">/ 75</span>' +
      '<div class="note" role="status" aria-live="polite"></div>';
    body.appendChild(pill);

    // The top row: the OG toggle is pinned at the left, the rest follow it in order (the beta
    // build adds its pill with grokHudAdd). Labels change width, so re-lay on every resize.
    var hud = [tbtn, pill];
    function layHud() {
      var x = btn.getBoundingClientRect().right + 8;
      hud.forEach(function (el) { el.style.left = Math.round(x) + "px"; x += el.getBoundingClientRect().width + 8; });
    }
    var hudRO = window.ResizeObserver ? new ResizeObserver(layHud) : null;
    [btn].concat(hud).forEach(function (el) { if (hudRO) hudRO.observe(el); });
    window.grokHudAdd = function (el) { hud.push(el); if (hudRO) hudRO.observe(el); layHud(); };
    layHud();
    var noteTimer = 0;
    window.grokScore = function (score, max, gained, comment) {
      pill.querySelector(".n").textContent = score;
      pill.querySelector(".of").textContent = "/ " + max;
      if (!gained) return;
      var note = pill.querySelector(".note");
      note.textContent = "";
      var plus = document.createElement("b");
      plus.textContent = (gained > 0 ? "+" : "") + gained;   // a hit is negative
      plus.className = gained < 0 ? "minus" : "";
      note.appendChild(plus);
      if (comment && !window.grokHard) {
        var said = document.createElement("i");
        said.textContent = "(" + comment + ")";
        note.appendChild(said);
      }
      pill.classList.remove("bump");
      void pill.offsetWidth;   // restart the bump animation
      pill.classList.add("bump", "noting");
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { pill.classList.remove("noting"); }, 7000);
    };

    // Start at the top of the opening, not at the prompt. Vorple scrolls its output to the
    // bottom when the first prompt appears (and again while it settles), so once the prompt
    // is there, hold the scroll at the top for a moment -- unless the player scrolls or types.
    (function startAtTop() {
      var t0 = Date.now(), held = false, stop = false;
      function quit() { stop = true; }
      document.addEventListener("keydown", quit, { once: true, capture: true });
      document.addEventListener("wheel", quit, { once: true, capture: true, passive: true });
      document.addEventListener("touchstart", quit, { once: true, capture: true, passive: true });
      (function tick() {
        if (stop || window.grokRestoring || Date.now() - t0 > 15000) return;   // a restore ends at the bottom
        var box = document.getElementById("vorple"), out = document.getElementById("output");
        // the prompt element exists before the opening is printed: wait for the text itself
        if (box && document.getElementById("lineinput") && out && out.textContent.length > 400) {
          if (!held) { held = Date.now(); }
          box.scrollTop = 0;
          if (Date.now() - held > 1500) return;
        }
        requestAnimationFrame(tick);
      })();
    })();

    // Keep password managers off the command line. Vorple's prompt is a <label for> the
    // input, so at "analyst@...'s password:" Bitwarden reads the field as a password field
    // (it matches "password" in the label text) and then offers to save every command.
    // Unhooking the label keeps the prompt on screen but out of the field's labels.
    (function noPasswordManagers() {
      function unhook() {
        var f = document.getElementById("lineinput-field"), p = document.getElementById("lineinput-prefix");
        if (!f) return false;
        if (p && p.hasAttribute("for")) p.removeAttribute("for");
        f.setAttribute("aria-label", "command");
        f.setAttribute("data-bwignore", "true");
        f.setAttribute("data-1p-ignore", "true");
        f.setAttribute("data-lpignore", "true");
        f.setAttribute("data-form-type", "other");
        return true;
      }
      (function wait() { if (!unhook()) requestAnimationFrame(wait); })();
      document.addEventListener("submit", unhook, true);
    })();

    window.grokFeed("train");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
