/* The laptop screen at the end of the ending footage (web/media/ending.mp4).

   The footage's own screen text is generated gibberish, so we lay our own terminal over it.
   Everything here is in the coordinates of one reference frame of the video (1920x1080, at
   track.refTime); web/media/ending-track.json, made by tools/track_screen.py, holds the
   perspective transform from that frame onto every frame at the end of the clip.

   Used two ways, from this one file so they can't drift apart:
   - live, by grok-console.js: the layer is drawn over the playing video ("overlay" mode);
   - offline, by tools/bake_screen.py, which renders the same layer and burns it into a copy
     of the video ("baked" mode).
   Either way, when the clip ends the live layer sits frozen on the last frame and the
   epilogue carries on typing into it.

   Content is in window.GROK_SCREEN (web/grok-epilogue.js). */
(function () {
  // The screen's display area and text grid, measured on the reference frame.
  var REF = { w: 1920, h: 1080, x: 236, y: 92, sw: 1510, sh: 813, padX: 46, padY: 14, font: 24, line: 28.7, rows: 27 };

  // What the screen shows at video time t: it fades in over the footage's own text, sits
  // soft and dim while the camera pushes in, and racks into focus at the very end. Meanwhile
  // vim is closed (":wq") and the shell comes back.
  function smooth(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
  var T = { show: 15.3, faded: 15.8, focusFrom: 16.5, focused: 19.3, colon: 17.6, w: 17.8, q: 18.0, shell: 18.35 };
  function at(t) {
    var f = smooth((t - T.focusFrom) / (T.focused - T.focusFrom));
    return {
      show: t >= T.show,
      back: smooth((t - T.show) / (T.faded - T.show)),           // the dark backing that hides the gibberish
      text: smooth((t - T.show) / (T.faded - T.show)) * (0.42 + 0.58 * f),
      blur: 7 * (1 - f),                                          // px, in reference-frame pixels
      state: t < T.colon ? "vim:info" : t < T.w ? "vim::" : t < T.q ? "vim::w" : t < T.shell ? "vim::wq" : "shell",
      cursor: Math.floor(t * 2) % 2 === 0
    };
  }

  function S() { return window.GROK_SCREEN || { prompt: "$ ", vim: { lines: [], info: "" }, shell: [] }; }
  function pad(n) { var s = String(n); while (s.length < 3) s = " " + s; return s + " "; }

  // A vim screen as rows: the buffer (soft-wrapped at cols, numbered if o.number), "~" below
  // it, and the command line at the bottom. o.cursor: {row, col} block in the buffer.
  function vimRows(lines, bottom, o) {
    o = o || {};
    var out = [], cols = o.cols || 1e9, gut = o.number ? 4 : 0, i, j, cur = o.cursor;
    for (i = 0; i < lines.length && out.length < REF.rows - 1; i++) {
      var t = lines[i];
      if (cur && cur.row === i) t = t.slice(0, cur.col) + "█" + t.slice(cur.col + 1);
      for (j = 0; j === 0 || j < t.length; j += cols - gut)
        out.push({ n: o.number ? (j ? "    " : pad(i + 1)) : "", t: t.slice(j, j + cols - gut) });
    }
    while (out.length < REF.rows - 1) out.push({ t: "~", dim: true });
    out.length = REF.rows - 1;
    out.push({ t: bottom });
    return out;
  }

  // rows of { t: text, dim: bool } for a state
  function rowsFor(state, cursorOn) {
    var sc = S(), out = [], i;
    if (state.indexOf("vim:") === 0) {
      var cmd = state.slice(4);
      return vimRows(sc.vim.lines, cmd === "info" ? sc.vim.info : cmd + (cursorOn ? "█" : " "), { number: true });
    } else {
      for (i = 0; i < sc.shell.length; i++) out.push({ t: sc.shell[i] });
      out.push({ t: sc.prompt + (cursorOn ? "█" : " ") });
    }
    return out;
  }

  // Build the layer: a fixed 1920x1080 box in reference pixels. parts: "both" | "back" | "text"
  // k: drawn k times larger and scaled back down by place(). Chrome rasterises a layer under a
  // perspective transform at its own size and then stretches the bitmap, so on a big screen a
  // 1x layer comes out soft and smeared; the live game uses k=3. (The bake renders at k=1.)
  function build(parent, parts, k) {
    parts = parts || "both"; k = k || 1;
    var px = function (v) { return v * k + "px"; };
    var root = document.createElement("div");
    root.className = "grok-screen";
    root.style.cssText = "position:absolute;left:0;top:0;width:" + px(REF.w) + ";height:" + px(REF.h) + ";transform-origin:0 0;pointer-events:none";
    var back = document.createElement("div");
    back.style.cssText = "position:absolute;left:" + px(REF.x) + ";top:" + px(REF.y) + ";width:" + px(REF.sw) + ";height:" + px(REF.sh) + ";" +
      "background:#030504;border-radius:" + px(10) + ";box-shadow:0 0 " + px(18) + " " + px(14) + " #030504";
    var pre = document.createElement("pre");
    pre.style.cssText = "position:absolute;margin:0;left:" + px(REF.x + REF.padX) + ";top:" + px(REF.y + REF.padY) + ";" +
      "width:" + px(REF.sw - REF.padX * 2) + ";height:" + px(REF.rows * REF.line) + ";overflow:hidden;white-space:pre;" +
      "font:400 " + px(REF.font) + "/" + px(REF.line) + " Consolas,'SF Mono',Menlo,ui-monospace,'Courier New',monospace;" +
      "color:#1fe05a;text-shadow:0 0 " + px(3) + " rgba(31,224,90,.35)";
    if (parts !== "text") root.appendChild(back);
    if (parts !== "back") root.appendChild(pre);
    parent.appendChild(root);
    var cols = 98;   // terminal width in characters, measured from the font actually used
    if (parts !== "back") {
      var probe = document.createElement("span"); probe.textContent = new Array(51).join("M");
      pre.appendChild(probe);
      if (probe.offsetWidth) cols = Math.floor((REF.sw - REF.padX * 2) * k / (probe.offsetWidth / 50));
      pre.removeChild(probe);
    }
    var extra = [];   // epilogue lines typed after the clip
    function paint(rows) {
      var all = rows.concat(extra), keep = all.slice(Math.max(0, all.length - REF.rows));
      pre.innerHTML = keep.map(function (r) {
        var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
        return (r.n ? '<span style="color:#128a3a">' + esc(r.n) + "</span>" : "") +
               (r.dim ? '<span style="color:#128a3a">' + esc(r.t) + "</span>" : esc(r.t));
      }).join("\n");
    }
    var api = {
      el: root,
      at: at,
      // apply the look for video time t (state, fade, focus)
      show: function (t) {
        var a = at(t);
        root.style.display = a.show ? "" : "none";
        back.style.opacity = a.back;
        pre.style.opacity = a.text;
        pre.style.filter = a.blur > 0.05 ? "blur(" + (a.blur * k).toFixed(2) + "px)" : "none";
        paint(rowsFor(a.state, a.cursor));
        return a;
      },
      cols: cols,
      // after the clip: any rows, in focus (the epilogue draws its shell and vim screens with this)
      rows: function (rows) {
        root.style.display = ""; back.style.opacity = 1; pre.style.opacity = 1; pre.style.filter = "none";
        extra = []; paint(rows);
      },
      // after the clip: the shell, in focus, with lines typed onto it
      shell: function (typedLines, cursorOn) {
        root.style.display = ""; back.style.opacity = 1; pre.style.opacity = 1; pre.style.filter = "none";
        extra = [];
        var rows = rowsFor("shell", false); rows.pop();                     // drop the bare prompt row...
        var sc = S(), lines = typedLines.slice();
        if (!lines.length) lines.push(sc.prompt);
        lines[lines.length - 1] += cursorOn ? "█" : " ";
        paint(rows.concat(lines.map(function (t) { return { t: t }; })));   // ...the typed lines carry on from it
      },
      // place the layer: H is the 3x3 reference->video homography (row-major), mapped into a
      // box showing the video with object-fit:cover at (boxW x boxH)
      place: function (H, vidW, vidH, boxW, boxH) {
        var s = Math.max(boxW / vidW, boxH / vidH), ox = (boxW - vidW * s) / 2, oy = (boxH - vidH * s) / 2;
        // M = [s 0 ox; 0 s oy; 0 0 1] * H * [1/k 0 0; 0 1/k 0; 0 0 1]
        var m = [(s * H[0] + ox * H[6]) / k, (s * H[1] + ox * H[7]) / k, s * H[2] + ox * H[8],
                 (s * H[3] + oy * H[6]) / k, (s * H[4] + oy * H[7]) / k, s * H[5] + oy * H[8],
                 H[6] / k, H[7] / k, H[8]];
        root.style.transform = m[6] === 0 && m[7] === 0 && m[8] === 1
          ? "matrix(" + [m[0], m[3], m[1], m[4], m[2], m[5]].join(",") + ")"      // flat: drawn sharp everywhere
          : "matrix3d(" + [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, m[8]].join(",") + ")";
      }
    };
    return api;
  }

  // The closest flat (affine, no perspective) version of H over the screen area, as a
  // homography with bottom row 0 0 1. A still layer under a perspective transform is tiled by
  // Firefox, which slices and offsets the text; once the clip has ended the screen is frozen,
  // so the layer glides onto this and is drawn with a plain 2D transform instead.
  function flat(H) {
    var S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bu = [0, 0, 0], bv = [0, 0, 0], i, j, r, c;
    for (i = 0; i <= 10; i++) for (j = 0; j <= 10; j++) {
      var x = REF.x + REF.sw * i / 10, y = REF.y + REF.sh * j / 10, w = H[6] * x + H[7] * y + H[8];
      var u = (H[0] * x + H[1] * y + H[2]) / w, v = (H[3] * x + H[4] * y + H[5]) / w, p = [x, y, 1];
      for (r = 0; r < 3; r++) { bu[r] += p[r] * u; bv[r] += p[r] * v; for (c = 0; c < 3; c++) S[r][c] += p[r] * p[c]; }
    }
    var det = function (M) { return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]); };
    var solve = function (b) {   // Cramer's rule
      var d = det(S), out = [];
      for (c = 0; c < 3; c++) out.push(det(S.map(function (row, r) { return row.map(function (v, k) { return k === c ? b[r] : v; }); })) / d);
      return out;
    };
    var a = solve(bu), b = solve(bv);
    return [a[0], a[1], a[2], b[0], b[1], b[2], 0, 0, 1];
  }

  window.GrokScreen = { REF: REF, at: at, rowsFor: rowsFor, vimRows: vimRows, build: build, flat: flat };
})();
