/* Save and restore by replay (user's call, 2026-11-14).
   The story has no randomness, so the lines the game has taken, fed back in order to a fresh
   game, rebuild the same state, side panel and score included. This keeps every line the game
   takes (typed, or sent silently by the side panel), saves them to a file, and restores one by
   reloading the page and replaying it behind a progress screen.
   Typing save, restore or load does the same as the Save menu. The game answers those lines
   itself (story.ni), and they stay in the log: the game counts turns, so a replay has to feed
   it exactly what it took. */
(function () {
  "use strict";
  var PENDING = "grokwell-restore";   // sessionStorage: a save waiting for the reload
  var lines = [];         // every line the game has taken: "text", or ["text", 1] if sent silently
  var ended = false;      // no saves once the story is over (a restore would replay the ending)
  var restoring = null;   // {save, total, last, timer} while a replay runs

  function $(id) { return document.getElementById(id); }
  function scoreNow() { var n = document.querySelector("#grok-score .n"); return n ? n.textContent.trim() : ""; }
  function promptNow() { var p = $("lineinput-prefix"); return p ? p.textContent.trim() : ""; }
  function serialNow() { var m = /Serial number (\d+)/.exec(($("output") || {}).textContent || ""); return m ? m[1] : ""; }

  // --- recording: Vorple reports every line it hands the game, typed or queued -----------------
  function listen() {
    if (!window.vorple || !vorple.addEventListener) { setTimeout(listen, 50); return; }
    vorple.addEventListener("submitCommand", function (e) {
      var t = String(e.original != null ? e.original : e.input || "");
      lines.push(e.silent ? [t, 1] : t);
      if (restoring) { restoring.last = Date.now(); paint(); }
    });
    vorple.addEventListener("expectCommand", function () {
      // the prompt's text is set just after this event, and finish() compares it
      if (restoring && lines.length >= restoring.total && !restoring.ending) { restoring.ending = true; setTimeout(finish, 300); }
    });
  }
  listen();

  // the ending takes the screen through these two feeds
  (function watchEnding() {
    if (typeof window.grokFeed !== "function") { setTimeout(watchEnding, 100); return; }
    var feed = window.grokFeed;
    window.grokFeed = function (view) {
      if (view === "train-saved" || view === "lost") ended = true;
      return feed.apply(this, arguments);
    };
  })();

  // --- the save file -----------------------------------------------------------------------------
  function snapshot(extra) {
    return {
      game: "grokwell", v: 1, saved: new Date().toISOString(), serial: serialNow(),
      score: scoreNow(), prompt: promptNow(),
      lines: extra === undefined ? lines.slice() : lines.concat([extra])
    };
  }
  function valid(s) {
    return !!s && s.game === "grokwell" && Array.isArray(s.lines) && s.lines.every(function (l) {
      return typeof l === "string" || (Array.isArray(l) && typeof l[0] === "string");
    });
  }
  function download(save) {
    var d = new Date(save.saved), two = function (n) { return (n < 10 ? "0" : "") + n; };
    var name = "grokwell-save-" + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) +
      "-" + two(d.getHours()) + two(d.getMinutes()) + ".json";
    var url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url; a.download = name; a.hidden = true;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
    return name;
  }
  // the site build's feedback layer (grok-beta.js) sends a copy to the author's log
  function saved(save) { document.dispatchEvent(new CustomEvent("grok-saved", { detail: save })); }
  // a file picker only opens straight from a click or key press, so callers run this in one
  function pick() {
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json,text/plain";
    input.onchange = function () { if (input.files && input.files[0]) load(input.files[0]); };
    input.click();
  }
  function load(file) {
    if (file.size > 5e6) { tell("That file is too big to be a Grokwell save."); return; }
    var r = new FileReader();
    r.onload = function () {
      var save = null;
      try { save = JSON.parse(r.result); } catch (e) {}
      if (!valid(save)) { tell("That isn't a Grokwell save file."); return; }
      try { sessionStorage.setItem(PENDING, JSON.stringify(save)); }
      catch (e) { tell("This browser won't keep the save across a reload, so it can't restore here."); return; }
      location.reload();
    };
    r.onerror = function () { tell("Couldn't read that file."); };
    r.readAsText(file);
  }

  // typed save / restore / load: act on the key press itself (downloads and pickers need one)
  window.addEventListener("keydown", function (e) {
    var el = e.target;
    if (restoring || e.key !== "Enter" || !el || el.tagName !== "INPUT" || !el.closest || !el.closest("#vorple")) return;
    var raw = String(el.value || ""), w = raw.trim().toLowerCase();
    if (/^save(\s|$)/.test(w)) { if (!ended) { var s = snapshot(raw); download(s); saved(s); } }
    else if (/^(restore|load)(\s|$)/.test(w)) pick();
  }, true);

  // --- restoring ---------------------------------------------------------------------------------
  var pending = null;
  try { pending = sessionStorage.getItem(PENDING); sessionStorage.removeItem(PENDING); } catch (e) {}
  try { pending = pending && JSON.parse(pending); } catch (e) { pending = null; }
  if (valid(pending) && pending.lines.length) {
    window.grokRestoring = true;   // grok-console skips start-at-top; grok-beta holds its log
    restoring = { save: pending, total: pending.lines.length, last: Date.now(), timer: 0 };
    // queued before the game starts, Vorple hands them over one per prompt
    (function queue() {
      if (!window.vorple || !vorple.prompt || !vorple.prompt.queueCommand) { setTimeout(queue, 50); return; }
      pending.lines.forEach(function (l) {
        if (typeof l === "string") vorple.prompt.queueCommand(l, false);
        else vorple.prompt.queueCommand(l[0], !!l[1]);
      });
    })();
    // a line that never comes back (the game changed under the save) shouldn't hang the page
    restoring.timer = setInterval(function () {
      if (restoring && Date.now() - restoring.last > 20000) stuck();
    }, 1000);
    // nothing typed or clicked reaches the game until it's done
    ["keydown", "keypress", "keyup"].forEach(function (t) {
      window.addEventListener(t, function (e) {
        if (window.grokRestoring) { e.stopImmediatePropagation(); e.preventDefault(); }
      }, true);
    });
  }
  function finish() {
    if (!restoring) return;   // stuck() got there first
    var s = restoring.save;
    clearInterval(restoring.timer); restoring = null; window.grokRestoring = false;
    var box = $("vorple"); if (box) box.scrollTop = box.scrollHeight;
    var same = (!s.score || s.score === scoreNow()) && (!s.prompt || !promptNow() || s.prompt === promptNow());
    var n = s.lines.length;
    if (same) {
      cover("Restored", "Back where you saved: " + n + (n === 1 ? " command" : " commands") + ", score " + scoreNow() + ".", false);
      setTimeout(uncover, 2500);
    } else {
      cover("Restored, with a difference",
        "The save was at score " + s.score + (s.prompt ? " (" + s.prompt + ")" : "") + "; the replay ended at " + scoreNow() +
        (promptNow() ? " (" + promptNow() + ")" : "") + "." + (s.serial && s.serial !== serialNow()
          ? " The save came from an older version of the game." : ""), true);
    }
    document.dispatchEvent(new CustomEvent("grok-restored", { detail: { lines: lines.slice() } }));
  }
  function stuck() {
    var r = restoring;
    clearInterval(r.timer); restoring = null; window.grokRestoring = false;
    if (window.vorple && vorple.prompt && vorple.prompt.clearCommandQueue) vorple.prompt.clearCommandQueue();
    cover("Restore stopped", "It got through " + lines.length + " of " + r.total + " commands, and the game is there now." +
      (r.save.serial && r.save.serial !== serialNow() ? " The save came from an older version of the game." : ""), true);
    document.dispatchEvent(new CustomEvent("grok-restored", { detail: { lines: lines.slice() } }));
  }

  // --- the restore screen --------------------------------------------------------------------------
  var shade = null;
  function cover(title, text, button) {
    if (!shade) {
      shade = document.createElement("div");
      shade.id = "grok-restore";
      shade.innerHTML = '<div class="gr-box" role="status" aria-live="polite"><h2 id="gr-title"></h2>' +
        '<div class="gr-bar"><i id="gr-fill"></i></div><p id="gr-text"></p>' +
        '<button type="button" id="gr-ok" hidden>Continue</button></div>';
      document.body.appendChild(shade);
      $("gr-ok").onclick = uncover;
    }
    shade.hidden = false;
    $("gr-title").textContent = title;
    $("gr-text").textContent = text;
    $("gr-ok").hidden = !button;
    if (button) $("gr-ok").focus();
  }
  function uncover() {
    if (shade) shade.hidden = true;
    var i = document.querySelector("#vorple input"); if (i) i.focus();
  }
  function paint() {
    if (!restoring) return;
    $("gr-fill").style.width = Math.round(100 * lines.length / restoring.total) + "%";
    $("gr-text").textContent = lines.length + " of " + restoring.total + " commands";
  }

  // --- the Save menu in the top row ----------------------------------------------------------------
  var menu = null, note = null;
  function tell(text) { if (!menu) return; open(); note.textContent = text; }
  function open() {
    menu.hidden = false;
    $("gs-down").disabled = ended;
    note.textContent = ended ? "The story's over, so there's nothing left to save." : "";
  }
  function mount() {
    if (typeof window.grokHudAdd !== "function" || !document.body) { setTimeout(mount, 100); return; }
    var pill = document.createElement("button");
    pill.type = "button"; pill.id = "grok-save"; pill.textContent = "Save";
    menu = document.createElement("div");
    menu.id = "grok-save-menu"; menu.hidden = true; menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", "Save or load");
    menu.innerHTML =
      '<div class="gs-actions"><button type="button" id="gs-down">Download save</button>' +
      '<button type="button" id="gs-load">Load a save…</button></div>' +
      '<p class="gs-note" id="gs-note" aria-live="polite"></p>' +
      '<p class="gs-fine">A save is a small file of the commands you typed. Loading one starts over and replays it. Typing save or restore does the same.' +
      (window.GROK_LOG_URL ? " A copy of each save goes to the game's author with the run log." : "") + '</p>';
    document.body.appendChild(pill);
    document.body.appendChild(menu);
    note = $("gs-note");
    window.grokHudAdd(pill);
    pill.onclick = function () {
      if (!menu.hidden) { menu.hidden = true; return; }
      menu.style.left = Math.round(pill.getBoundingClientRect().left) + "px";
      open();
    };
    $("gs-down").onclick = function () {
      if (ended) return;
      var s = snapshot();
      note.textContent = "Downloaded " + download(s) + ".";
      saved(s);
    };
    $("gs-load").onclick = pick;
    // clicks in the menu stay out of Vorple's "click anywhere to type"; a click elsewhere closes it
    [menu, pill].forEach(function (el) {
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach(function (t) {
        el.addEventListener(t, function (e) { e.stopPropagation(); });
      });
    });
    document.addEventListener("click", function () { menu.hidden = true; });
  }
  mount();
  if (restoring) {
    var show = function () { if (document.body) { cover("Restoring your game", "", false); paint(); } else setTimeout(show, 20); };
    show();
  }
})();
