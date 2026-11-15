/* The end of the ending: what's on DarkSeek's laptop.

   GROK_SCREEN is what the laptop shows as the camera pushes in (web/grok-screen.js lays it
   over the footage): she's finishing an edit in vim, saves and quits (":wq"), and the shell
   comes back with some history above the prompt. It's soft and dim until the camera racks
   into focus in the last second of the clip.

   GROK_EPILOGUE is then typed onto that same screen, after the clip ends (DESIGN.md,
   "Epilogue"): she logs into SecOps as boss-lady with her own backdoor key, uses sudo vim to
   copy that key -- minus its give-away comment -- into root's authorized_keys and delete it
   from boss-lady's. Then stage 2: after the player's reflash, motion-control has no sshd or
   Docker (both came with Luna), so she copies a Luna 2.0 image from her laptop to SecOps as
   root and on to the Flux Agent's firmware store with boss-lady's own key; the Agent flashes
   motion-control over the serial link. It cuts as the copy lands (user's call, 2026-11-15).
   Each entry is typed at the prompt key by key, then:
     out      lines printed after Enter          prompt  the prompt from then on
     vim      a vim session (lines, info, keys)  pause   ms to wait before the next entry
     progress a copy or docker bars: style "scp"  cut     hard cut to black: the end
              (file, mb, ms), "load" or a pull
   Keys are made up; their endings match what the player can cat in act 2. */
window.GROK_SCREEN = {
  prompt: "d4rks33k@ohreally:~$ ",
  vim: {
    lines: [
      "# stage2.py -- draft",
      "import time",
      "",
      "def wait_for(train):",
      "    while not train.on_schedule():",
      "        time.sleep(20)",
      "    return \"smile and wave\"",
      "",
      "if __name__ == \"__main__\":",
      "    print(wait_for(TRAIN))"
    ],
    info: "\"stage2.py\" 10L, 196B"
  },
  shell: [                      // already on screen when vim closes: earlier history
    "d4rks33k@ohreally:~$ ls",
    "notes  photos  stage2.py",
    "d4rks33k@ohreally:~$ cat notes/today.txt",
    "- ride the train home",
    "- watch them fix it",
    "- smile and wave",
    "d4rks33k@ohreally:~$ vim stage2.py"
  ]
};

var BL_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIpTyGJMuHbEL31IeL2HPcHyGcFRl1SPnXNYvQoph8tx3",
    DS_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMIHa/2o76umfXfKm/r5kJP1VrT+1FJors/69fL1kR2v";
window.GROK_EPILOGUE = [
  { type: "ssh -i ~/.ssh/id_backup boss-lady@secops", pause: 900,
    prompt: "boss-lady@SecOps:~$ " },
  { type: "sudo vim ~/.ssh/authorized_keys", pause: 900,
    vim: {
      lines: [BL_KEY + " boss-lady@secops", DS_KEY + " root@facehugger-relay"],
      info: "\"~/.ssh/authorized_keys\" 2L, 201B",
      keys: [
        { wait: 1400 },
        { row: 1, del: " root@facehugger-relay" },                 // the comment that gave her away
        { cmd: ":.w >> /root/.ssh/authorized_keys", pause: 1600,     // this line, from the buffer, to root
          msg: "\"/root/.ssh/authorized_keys\" 1L, 81B appended" },
        { dd: 1 },                                                 // and gone from boss-lady's
        { cmd: ":wq", pause: 300 }
      ] } },
  { type: "exit", out: "logout\nConnection to secops closed.", pause: 900,
    prompt: "d4rks33k@ohreally:~$ " },
  // Stage 2 rides in the way she got in: SecOps is dual-homed (Kylie's unofficial
  // work-from-home jump box, not on the network map). "secops" is her own name for the public
  // address the LTE modem forwards to it (the one in player1's dispatch), so no IP shows. Root on SecOps, then boss-lady's own key
  // to the Agent ("agent" in her ssh config). Each line stays under the screen's ~98 columns.
  { type: "scp ~/.fw/FLX-8.8-Luna2.0.enc root@secops:/tmp/",
    out: "FLX-8.8-Luna2.0.enc                           100%   23MB  10.4MB/s   00:02", pause: 900 },
  { type: "ssh root@secops", pause: 900, prompt: "root@SecOps:~# " },
  { type: "unset HISTFILE", pause: 700 },
  { type: "su boss-lady -c 'scp /tmp/FLX-8.8-Luna2.0.enc agent:/opt/grokwell/firmware/'",
    progress: { style: "scp", file: "FLX-8.8-Luna2.0.enc", mb: 23, ms: 3000 }, cut: true }
];

/* The footage between the in-engine push-in and the laptop screen, and how its screen text
   is replaced:
   - "overlay": play ending.mp4 and draw GROK_SCREEN over it live;
   - "baked":   play ending-baked.mp4, which has GROK_SCREEN burned in by
                tools/bake_screen.py (re-run that after changing GROK_SCREEN).
   play.html#ending-overlay / #ending-baked preview either one. */
window.GROK_SCREEN_MODE = "overlay";
window.GROK_CLIPS = {
  overlay: ["media/ending.mp4"],         // Google Vids: through the window, over her shoulder, onto the laptop
  baked: ["media/ending-baked.mp4"]
};
window.GROK_TRACK = "media/ending-track.json";
