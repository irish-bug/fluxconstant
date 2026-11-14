/* Grokwell feedback panel and a light progress log, so the author can see where players
   get stuck. In the site build (./build.sh dist) and the claude.ai artifact build.

   It watches the shell: the commands typed, which story milestones the output shows, and
   which commands the game didn't understand. Each run goes to one of two places:
   - the site build sets window.GROK_LOG_URL (a Google Apps Script web app, site-log/): every
     save posts the whole run there and the script keeps one row per run, so anyone with
     the link is logged, anonymously unless they type a name;
   - the artifact build has no URL and saves to the artifact's db at beta/<id>/runs/<run>,
     but only viewers the db lets write (the owner, email-invited Editors while there is no
     public link). A public-link visitor saves nothing there.
   Anyone who can't save gets "Copy report", to paste into a message. A notice says all this
   up front. */
(function () {
  var STAGES = [   // in story order; the furthest one reached is the run's headline
    ["login", "Logged into SecOps", /Last login: yesterday, 17:52/],
    ["boss", "Became boss-lady", /You are boss-lady now/],
    ["mover", "Reached motion-control", /Grokwell motion firmware:/],
    ["netcheck", "Stopped the watchdog", /The watchdog's down/],
    ["shaker", "Stopped the shaker", /The register writes stop/],
    ["fwlog", "Read the firmware log", /Official channel first, came up empty/],
    ["marvin", "Found Marvin's note", /RkxBR3tCUkFJTl9USEVfU0laRV9PRl9BX1BMQU5FVH0=/],
    ["decoded", "Decoded the passphrase", /FLAG\{BRAIN_THE_SIZE_OF_A_PLANET\}/],
    ["cobalt", "Extracted Cobalt", /Marvin's note opens it/],
    ["released", "Flashed Cobalt; line handed back", /Bring it in from the HMI/],
    ["win", "Won", /FLAG\{NO_MORE_SHAKING\}/]
  ];
  var EVENTS = [   // worth knowing, but not steps on the main path
    ["quickref", "Read the HMI quickref", /HMI Operator Quick Reference/],
    ["trap", "Sprang the watchdog trap", /Connection to motion-control closed by remote host/],
    ["ayb", "Cleared the HMI defacement", /The panel blanks, then repaints/],
    ["sessionlog", "Read Flux's session history", /Guardrails off on the operator/],
    ["fineprint", "Read the brochure's fine print", /Somebody in procurement should have scrolled this far/],
    ["lose", "Lost: flashed Cobalt with the shaker running", /The train is still shaking/],
    ["rmfail", "Lost: deleted the only clean firmware", /The only clean firmware is gone/]
  ];
  var MISSES = [   // replies that mean "the game didn't understand that"
    [/command not found/, "not found"],
    [/I don't know where that lives yet/, "not found yet"],
    [/There is no .{1,60} to (show|open) here/, "no such view"],
    [/That's not a verb I recognise|I didn't understand that/, "not understood"],
    [/No such file or directory/, "no such file"],
    [/Permission denied/, "permission denied"],
    [/Connection refused|Connection timed out|Could not resolve hostname/, "couldn't connect"]
  ];

  var run = {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
    started: new Date().toISOString(), commands: [], reached: {}, outcome: "", name: "", feedback: "",
    notes: []   // each Send adds one (user's call, 2026-11-14: append, never overwrite)
  };
  var t0 = Date.now();
  function secs() { return Math.round((Date.now() - t0) / 1000); }
  function mins(s) { return s < 60 ? s + "s" : Math.round(s / 60) + "m"; }

  // --- watching the shell ---------------------------------------------------------------
  var pending = "";   // output since the last command
  function scan(text) {
    STAGES.concat(EVENTS).forEach(function (m) {
      if (!run.reached[m[0]] && m[2].test(text)) { run.reached[m[0]] = secs(); changed(true); }
    });
    if (run.reached.win) run.outcome = "won";
    else if (run.reached.lose) run.outcome = "lost (shaker still running)";
    else if (run.reached.rmfail) run.outcome = "lost (deleted the 7z)";
  }
  function settle() {   // classify the reply to the last command
    var last = run.commands[run.commands.length - 1];
    if (last && !last.r) {
      for (var i = 0; i < MISSES.length; i++) if (MISSES[i][0].test(pending)) { last.r = MISSES[i][1]; break; }
      if (!last.r) last.r = "ok";
    }
    scan(pending); pending = "";
  }
  var settleTimer = 0;
  // Hard mode keeps thoughts off the screen, but several milestones are thoughts: the game
  // still hands each hidden one over here, to be scanned with the rest of the reply.
  window.grokThought = function (t) {
    pending += " " + String(t || "");
    run.hidden = (run.hidden || 0) + 1;
    clearTimeout(settleTimer); settleTimer = setTimeout(settle, 700);
  };
  function watchOutput() {
    var out = document.getElementById("output");
    if (!out) { setTimeout(watchOutput, 500); return; }
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) pending += " " + (m.addedNodes[i].textContent || "");
        if (m.type === "characterData") pending += " " + (m.target.textContent || "");
      });
      clearTimeout(settleTimer); settleTimer = setTimeout(settle, 700);
    }).observe(out, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener("keydown", function (e) {
    var el = e.target;
    if (e.key !== "Enter" || !el || el.tagName !== "INPUT" || !el.closest || !el.closest("#vorple")) return;
    settle();
    var c = String(el.value || "").trim().slice(0, 120);
    if (!c) return;
    run.commands.push({ c: c, t: secs(), r: "" });
    if (run.commands.length > 400) run.commands.splice(0, run.commands.length - 400);
    changed(false);
  }, true);

  // --- saving -----------------------------------------------------------------------------
  var LOG_URL = typeof window.GROK_LOG_URL === "string" ? window.GROK_LOG_URL : "";
  var db = null, uid = null, canSave = !!LOG_URL, saving = null, dirty = false, saveTimer = 0;
  function changed(soon) {
    dirty = true;
    if (!canSave) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, soon ? 1500 : 15000);
  }
  // Every note sent so far, with when; then whatever is typed in the box but not sent yet.
  function feedbackText() {
    var parts = run.notes.map(function (n) { return "[" + mins(n.t) + "] " + n.text; });
    if (run.feedback.trim()) parts.push("[" + mins(secs()) + ", draft] " + run.feedback.trim());
    return parts.join("\n\n");
  }
  function summary() {
    var furthest = "Not logged in yet";
    STAGES.forEach(function (s) { if (run.reached[s[0]] !== undefined) furthest = s[1]; });
    var misses = run.commands.filter(function (c) { return c.r && c.r !== "ok"; });
    return { furthest: furthest, misses: misses };
  }
  // the site: a plain text POST, so no CORS preflight; the reply is opaque, so a request that
  // went out counts as sent. Leaving the page uses sendBeacon, which outlives the tab.
  function post(body, leaving) {
    var data = JSON.stringify(body);
    if (leaving && navigator.sendBeacon) {
      return Promise.resolve(navigator.sendBeacon(LOG_URL, new Blob([data], { type: "text/plain;charset=utf-8" })));
    }
    return fetch(LOG_URL, {
      method: "POST", mode: "no-cors", keepalive: data.length < 60000,
      headers: { "Content-Type": "text/plain;charset=utf-8" }, body: data
    }).then(function () { return true; }, function () { return false; });
  }
  function save(leaving) {
    if (!canSave || !dirty) return Promise.resolve(true);
    if (saving && !leaving) return saving.then(function () { return save(); });   // one write at a time
    dirty = false;
    var s = summary(), body = {
      run: run.id, started: run.started, updated: new Date().toISOString(), seconds: secs(),
      furthest: s.furthest, outcome: run.outcome, reached: run.reached,
      commandCount: run.commands.length, notUnderstood: s.misses.length,
      commands: run.commands, name: run.name, feedback: feedbackText(),
      hiddenThoughts: run.hidden || 0
    };
    if (LOG_URL) {
      saving = post(body, leaving).then(function (ok) { saving = null; if (!ok) dirty = true; return ok; });
      return saving;
    }
    if (!db) { dirty = true; return Promise.resolve(false); }
    delete body.run;
    saving = db.doc("beta/" + uid + "/runs/" + run.id).set(body)
      .then(function () { return db.doc("beta/" + uid).set({ lastRun: run.id, updated: body.updated }); })
      .then(function () { saving = null; return true; })
      .catch(function (err) {
        saving = null;
        if (err && err.code === "unavailable") { dirty = true; return false; }
        canSave = false; showSendState(); return false;   // not allowed to write: copy report only
      });
    return saving;
  }
  window.addEventListener("pagehide", function () { if (dirty) save(true); });
  (async function connect() {
    if (LOG_URL || !window.claude || !window.claude.use) return;
    try {
      var d = await window.claude.use("db"), u = await window.claude.use("user");
      if (!d || !u) return;
      var id = await u.id();
      if (!id) return;
      db = d; uid = id; canSave = true; showSendState();
      if (dirty) changed(true);
    } catch (e) { /* the game runs the same without it */ }
  })();

  // --- the report ---------------------------------------------------------------------------
  function report() {
    var s = summary(), lines = [];
    lines.push("Grokwell report");
    lines.push("Played " + mins(secs()) + ", " + run.commands.length + " commands. Furthest: " + s.furthest + (run.outcome ? " (" + run.outcome + ")" : "") + ".");
    var steps = STAGES.concat(EVENTS).filter(function (m) { return run.reached[m[0]] !== undefined; })
      .sort(function (a, b) { return run.reached[a[0]] - run.reached[b[0]]; })
      .map(function (m) { return m[1] + " @" + mins(run.reached[m[0]]); });
    if (steps.length) lines.push("Milestones: " + steps.join(" / "));
    if (s.misses.length) lines.push("Not understood (" + s.misses.length + "): " + s.misses.slice(-25).map(function (c) { return c.c; }).join(" | "));
    if (run.hidden) lines.push("Hard mode: " + run.hidden + " thoughts hidden");
    if (run.name) lines.push("From: " + run.name);
    if (feedbackText()) lines.push("", "Feedback:", feedbackText());
    lines.push("", "Last commands:");
    run.commands.slice(-40).forEach(function (c) { lines.push("@" + mins(c.t) + "  " + c.c + (c.r && c.r !== "ok" ? "   [" + c.r + "]" : "")); });
    return lines.join("\n");
  }

  // --- UI -------------------------------------------------------------------------------------
  var ui = document.createElement("div");
  ui.id = "grok-beta";
  ui.innerHTML =
    '<div class="gb-notice" id="gb-notice" hidden><p>To help find where players get stuck, this game sends its author the commands you type and how far you get. No name unless you add one. Use <b>Send feedback</b> any time.</p><button type="button" id="gb-ok">Got it</button></div>' +
    '<button type="button" class="gb-pill" id="gb-open">Send feedback</button>' +
    '<div class="gb-panel" id="gb-panel" hidden role="dialog" aria-labelledby="gb-title">' +
      '<div class="gb-head"><h2 id="gb-title">Feedback</h2><button type="button" class="gb-x" id="gb-close" aria-label="Close">×</button></div>' +
      '<p class="gb-far">Furthest so far: <b id="gb-far"></b></p>' +
      '<label for="gb-fb">Where did you get stuck, or what confused you?</label>' +
      '<textarea id="gb-fb" rows="5" placeholder="Anything helps: a puzzle you couldn’t crack, a command you expected to work, a bug, a line you liked."></textarea>' +
      '<label for="gb-name">Your name (optional)</label>' +
      '<input id="gb-name" type="text" autocomplete="off">' +
      '<div class="gb-actions"><button type="button" class="gb-primary" id="gb-send" hidden>Send</button><button type="button" id="gb-copy">Copy report</button></div>' +
      '<p class="gb-status" id="gb-status" aria-live="polite"></p>' +
      '<p class="gb-fine" id="gb-fine"></p>' +
    '</div>';
  function $(id) { return document.getElementById(id); }
  function mount() {
    if ($("grok-beta")) return;
    document.body.appendChild(ui);
    // keys typed in the panel stay in the panel: Vorple moves focus to the shell's prompt on
    // any key pressed outside an <input>, so stop them at the window before it sees them
    // (typing still works -- that's the browser's default action, not a listener)
    ["keydown", "keypress", "keyup"].forEach(function (t) {
      window.addEventListener(t, function (e) {
        if (e.target && e.target.closest && e.target.closest("#grok-beta")) e.stopImmediatePropagation();
      }, true);
    });
    // and clicks in it don't bubble up to Vorple's "click anywhere to type" handler either
    ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach(function (t) {
      ui.addEventListener(t, function (e) { e.stopPropagation(); });
    });
    var seen = false; try { seen = localStorage.getItem("grokwell-beta-ok") === "1"; } catch (e) {}
    $("gb-notice").hidden = seen;
    $("gb-ok").onclick = function () { $("gb-notice").hidden = true; try { localStorage.setItem("grokwell-beta-ok", "1"); } catch (e) {} refocus(); };
    $("gb-open").onclick = open;
    $("gb-close").onclick = close;
    $("gb-send").onclick = send;
    $("gb-copy").onclick = copy;
    $("gb-fb").oninput = function () { run.feedback = this.value.slice(0, 4000); dirty = true; };
    $("gb-name").oninput = function () { run.name = this.value.slice(0, 80); dirty = true; };
    showSendState();
    // join the top row after the score pill; older consoles without grokHudAdd: beside the toggle
    var og = document.getElementById("og-toggle"), score = document.getElementById("grok-score");
    if (window.grokHudAdd) {
      window.grokHudAdd($("gb-open"));
    } else if (og) {
      var place = function () {
        var x = og.getBoundingClientRect().right + 8;
        if (score) x += score.getBoundingClientRect().width + 8;
        $("gb-open").style.left = Math.round(x) + "px";
      };
      place();
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(place);
        ro.observe(og);
        if (score) ro.observe(score);
      }
    }
  }
  function refocus() { var i = document.querySelector("#vorple input"); if (i) i.focus(); }
  function open() {
    $("gb-notice").hidden = true;
    $("gb-far").textContent = summary().furthest + (run.outcome ? " (" + run.outcome + ")" : "");
    var n = run.notes.length;
    $("gb-status").textContent = n ? "Sent so far: " + n + (n > 1 ? " notes" : " note") + ". Add another any time." : "";
    $("gb-panel").hidden = false;
    setTimeout(function () { $("gb-fb").focus(); }, 0);
  }
  function close() { $("gb-panel").hidden = true; refocus(); }
  function showSendState() {
    if (!$("gb-send")) return;
    $("gb-send").hidden = !canSave;
    $("gb-fine").textContent = canSave
      ? "Send saves this run, your notes and the commands you typed for the author. Copy report gives you the same text to paste anywhere."
      : "Copy report puts a summary of this run, your notes and your last commands on your clipboard. Paste it into a message to whoever shared the game with you.";
  }
  function send() {
    // the box's text becomes a new note and the box empties for the next one
    var text = $("gb-fb").value.trim().slice(0, 4000);
    if (text) { run.notes.push({ t: secs(), text: text }); $("gb-fb").value = ""; }
    $("gb-fb").focus();   // ready for the next note (left on Send, a space would send again)
    run.feedback = ""; run.name = $("gb-name").value.slice(0, 80);
    dirty = true; $("gb-status").textContent = "Sending…";
    save().then(function (ok) {
      var n = run.notes.length;
      $("gb-status").textContent = !ok
        ? (LOG_URL ? "Couldn’t send just now. It goes with your next command, or use Copy report."
                   : "Couldn’t send from here. Use Copy report and paste it to whoever shared the game with you.")
        : n > 1 ? "Sent. That’s " + n + " notes so far. Thank you!" : "Sent. Thank you!";
    });
  }
  function copy() {
    run.feedback = $("gb-fb").value.slice(0, 4000); run.name = $("gb-name").value.slice(0, 80);
    var text = report(), st = $("gb-status");
    function fallback() {   // show it selected, to copy by hand
      var ta = document.createElement("textarea"); ta.className = "gb-copybox"; ta.value = text; ta.readOnly = true;
      st.textContent = "Select all and copy this:"; st.appendChild(ta); ta.focus(); ta.select();
    }
    try {
      navigator.clipboard.writeText(text).then(function () { st.textContent = "Copied. Paste it into a message to whoever shared the game with you."; }, fallback);
    } catch (e) { fallback(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { mount(); watchOutput(); });
  else { mount(); watchOutput(); }
})();
