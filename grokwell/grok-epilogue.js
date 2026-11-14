/* The end of the ending: what's on DarkSeek's laptop.

   GROK_SCREEN is what the laptop shows as the camera pushes in (web/grok-screen.js lays it
   over the footage): she's finishing an edit in vim, saves and quits (":wq"), and the shell
   comes back with some history above the prompt. It's soft and dim until the camera racks
   into focus in the last second of the clip.

   GROK_EPILOGUE is then typed onto that same screen, after the clip ends (DESIGN.md,
   "Epilogue"): she logs into SecOps as boss-lady with her own backdoor key, uses sudo vim to
   copy that key -- minus its give-away comment -- into root's authorized_keys and delete it
   from boss-lady's, then comes back in as root and hops to motion-control to pull stage 2.
   Each entry is typed at the prompt key by key, then:
     out      lines printed after Enter          prompt  the prompt from then on
     vim      a vim session (lines, info, keys)  pause   ms to wait before the next entry
     progress docker-pull-style layers           cut     hard cut to black: the end
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
  { type: "ssh -i ~/.ssh/id_backup boss-lady@10.42.7.30", pause: 900,
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
  { type: "exit", out: "logout\nConnection to 10.42.7.30 closed.", pause: 900,
    prompt: "d4rks33k@ohreally:~$ " },
  { type: "ssh root@10.42.7.30", pause: 900, prompt: "root@SecOps:~# " },
  { type: "unset HISTFILE", pause: 700 },
  { type: "ssh -i /home/boss-lady/.ssh/id_backup mover@10.42.7.20", pause: 900, prompt: "mover@motion-control:~$ " },
  { type: "unset HISTFILE", pause: 700 },
  { type: "docker pull darkseek/stage2:latest", out: "latest: Pulling from darkseek/stage2", gap: 400,
    progress: { layers: ["4f3a9c21d0be", "b81e07c6a952", "e2d5f8a1c370"], mb: 48.3, ms: 5200 }, cut: true }
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
