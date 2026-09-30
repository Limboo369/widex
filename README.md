# Beam: Android games on your PC (mouse + keyboard, over Wi-Fi)

Beam shows your phone screen on your PC, in a browser or as a Windows app. You can play Android games with a mouse and keyboard: **WASD** to move, the **mouse** for the camera, **click** to shoot. Everything goes over Wi-Fi, and you do not need to install any app on the phone.

Built and tested for the **Pixel 7 Pro** with the latest Android (tested on an Android 17 emulator, API 37).

---

## What you get

- 🎞️ **Real-time picture**: the phone encodes H.264 in hardware and the browser decodes it in hardware (WebCodecs). 60 FPS (90/120 possible), low latency.
- 🔊 **Game sound on the PC** (Android 12+). While Beam is connected, the phone is muted.
- 🎮 **Real multitouch for games**: hold W, move the camera with the mouse, shoot and aim, all at the same time.
- ⌨️ **Key mapping editor** (`F9`) with templates (shooter, MOBA, basic). The profile is saved per game and loads by itself when you open that game.
- 💡 **The phone screen can stay off** while you play. The game keeps running and the phone stays cooler.
- 🖱️ **Normal phone use**: click is a tap, right click is Back, the wheel scrolls. Typing works, including accented letters. Ctrl+C / Ctrl+V work between the PC and the phone.
- 🖥️ **Separate desktop (experimental)**: the phone creates an extra 1920×1080 screen with a taskbar, like Samsung DeX. Apps open in windows.
- 🔄 **Reconnects by itself** if Wi-Fi drops in the middle of a game.

## What you need

| | |
|---|---|
| PC | Windows with **Node.js** (v22) and **adb** from the Android SDK (included with Android Studio) |
| Display | The **Windows app** (the `Beam` shortcut) or **Chrome/Edge** |
| Phone | Android 11+ (Pixel 7 Pro ✅). Sound needs Android 12+ |
| Network | Phone and PC on the **same Wi-Fi network**, ideally 5 GHz |

## Starting

- **The `Beam` shortcut** or `Beam (app).bat` opens the Windows app. This is recommended for games, because browser shortcuts do not get in the way: Ctrl+W will not close the window while you crouch and move forward.
- **`Beam (browser).bat`** opens Beam in the browser at `http://localhost:3000`. Leave the black window (the server) open while you play.

After the first connection, Beam connects to the phone by itself as soon as you start it (if Wireless debugging is on on the phone).

## Connecting the phone the first time (only once)

1. **Turn on Developer options**: *Settings → About phone* → tap **Build number** 7 times.
2. *Settings → System → Developer options* → turn on **Wireless debugging**.
3. Open **Wireless debugging** → **Pair device with pairing code**.
4. In Beam (the **Connect** window), enter the 6-digit code and click **Pair**. The phone address usually appears by itself. If it does not, copy the *IP address & Port* from that screen on the phone.
5. The phone shows up in the list. Click **▶ Start**.

> After the phone restarts, turn *Wireless debugging* on again. You do not need to pair again.
> If the phone does not show up by itself, enter the *IP address & Port* from the *Wireless debugging* screen and click **Connect**. The port changes every time you turn that option on.
> A USB cable works too (turn on *USB debugging*).

## Playing

1. Open a game from the **Games & apps** menu (the app list from the phone) or straight on the phone screen.
2. Press **`F8`** (or 🎮 Game): the keyboard and mouse become the controls. **Click the screen** so the mouse takes over the camera.
3. The first time, press **`F9`** (key mapping). Pick a template, drag the markers exactly over the buttons in the game, then click **Save**. The profile is remembered for that game.
4. The **`` ` ``** key (left of 1) frees the mouse for clicking menus. Press **`` ` ``** again to return the mouse to the game.
5. **`F10`** is app fullscreen (only the phone screen). In fullscreen Esc goes to the game; **hold Esc** to exit. **`F11`** puts the whole Beam desktop in fullscreen.

### The "Shooter" template (PUBG, CoD, Free Fire...)

| Key | Action | Key | Action |
|---|---|---|---|
| W A S D | move (joystick) | Shift | sprint |
| mouse | camera | left click | fire |
| right click | aim | Space | jump |
| C / Z | crouch / prone | R | reload |
| F | pick up | 1 / 2 | weapon |
| G / H | grenade / heal | Q / E | peek left / right |
| M / Tab | map / backpack | `` ` `` | free cursor |
| L-Alt + mouse | free look (the 👁 eye) | | |

The positions in the template are approximate. Always line them up with your game (`F9`), because every game (and every HUD layout) puts its buttons somewhere else.

### Control types in the editor

- **Button**: a key or mouse click taps that spot. *Hold* keeps the finger down while you hold the key. *Tap* is a short press. The *mouse moves this button* option is for free look: while you hold the key, the mouse drags that button instead of the camera.
- **Joystick**: 4 keys move a "finger" away from the center. Sprint pushes it further.
- **Camera**: moving the mouse drags a "finger" across an empty part of the screen. When it reaches the edge of the zone, the finger lifts and goes back to the start. Place it where swiping turns the camera in the game.

## Tips for the lowest latency

- **5 GHz** Wi-Fi (or 6 GHz), the phone close to the router, the PC on a cable if possible.
- *Settings*: **Fast** quality (1280, 8 Mb/s) if the picture lags. **Balanced** (1920, 12 Mb/s) is the default.
- For games, use the **Windows app** and fullscreen (`F10`).
- Turn on **Turn the phone screen off**: the phone stays cooler and the game runs the same.
- The ping (📶 bottom right) shows the latency to the phone. Over Wi-Fi it is usually 3–15 ms.

## Troubleshooting

| Problem | Fix |
|---|---|
| The phone does not show up | Same Wi-Fi network? Turn *Wireless debugging* off and on, or enter the IP and port manually. |
| "Waiting for permission" | On the phone, accept "Allow USB debugging?" (check *Always allow*). |
| No picture in the browser | Use Chrome/Edge at `http://localhost:3000` (not the IP address), or the Windows app. |
| No sound | Click anywhere on the page (the browser needs a click before sound). Sound needs Android 12+. |
| The picture stutters or lags | *Settings*: lower the bitrate or resolution. Check the Wi-Fi signal. |
| The controls miss | Press `F9` while the game is open, then line up the markers with the buttons. |
| The mouse is not captured | Click the screen. In game mode `` ` `` switches between cursor and game. |
| The phone screen stayed off | Press the power button twice. Beam normally turns it back on when the connection ends. |
| The game ignores the keyboard | Some games have anti-cheat against mapping. Use it at your own risk. |

*Settings → Diagnostics → Show log* shows what is happening on the phone.

## How it works (technical)

```
 Phone (Android)                            PC (Windows)
 ┌───────────────────────────────┐   adb    ┌──────────────────────────┐  WebSocket  ┌─────────────────────────┐
 │ beam-server.jar (app_process  │◄────────►│ web-desktop/server.js    │◄───────────►│ Browser / Beam.exe      │
 │ with "shell" permissions):    │  Wi-Fi   │ (Node.js)                │  localhost  │ - WebCodecs (H.264)     │
 │ - screen: DisplayManager →    │ (forward)│ - adb: pairing, connect  │             │ - AudioWorklet (sound)  │
 │   MediaCodec H.264 (hardware) │          │ - starts the phone server│             │ - mouse/keyboard →      │
 │ - sound: REMOTE_SUBMIX (PCM)  │          │ - relays video/sound     │             │   touches (mapping)     │
 │ - touches: InputManager       │          │ - profiles, settings     │             │ - desktop, windows      │
 │   (real multitouch)           │          └──────────────────────────┘             └─────────────────────────┘
 │ - screen off, app list        │
 └───────────────────────────────┘
```

Beam uses the same approach as [scrcpy](https://github.com/Genymobile/scrcpy): a small Java server is sent to the phone over adb and started with the permissions of the `shell` user. That is why it needs no app on the phone and no Accessibility. This way it can send real multitouch events (essential for games), capture the screen without asking and turn the screen off while the game keeps running.

The data (key profiles, settings) is in `%APPDATA%\Beam`, shared by the browser version and the app. Data saved under the app's earlier name is copied over on the first start.
The PC server listens only on `localhost`, so nobody else on the network can control the phone.

## Project structure

```
Pex/
├── Beam (app).bat              starts the Windows app (builds it the first time)
├── Beam (browser).bat          starts the server and opens the browser
├── android-server/             Java server for the phone
│   ├── build.js                build without Gradle (javac + d8 from the Android SDK)
│   └── src/com/beam/server/    video, sound, control, helpers
└── web-desktop/
    ├── server.js               Node.js server (HTTP API + WebSocket)
    ├── lib/                    adb, session, protocol, apps, data, brand (the app name)
    ├── public/                 web interface (desktop, video, sound, game mode, editor)
    ├── presets/                key mapping templates (shooter, MOBA, basic)
    ├── bin/beam-server.jar     built server (sent to the phone)
    ├── app/                    Windows app (Electron)
    ├── scripts/                packaging into an .exe and the installer, icon
    └── dist/                   Beam.exe and the installer (`npm run package-win`, `npm run installer`)
```

## Development

### Design preview without a phone

`cd web-desktop`, then `npm run preview-design` opens an isolated interface at `http://localhost:3010`.
This preview does not start adb, does not control the phone and does not save settings. For real use, use the regular Beam shortcuts.
The interface uses local icons and a local wallpaper, without downloading fonts or other visual resources.

To preview switching between apps without a phone, run `node scripts/preview-design.js --taskbar-demo` from the `web-desktop` folder.

### Several apps in the taskbar

Open apps one by one from the Start menu. Each one gets its own taskbar item; clicking the item opens that app again in the shared phone view. The active item follows the app in the foreground. The items survive a page refresh in the same session and are removed when you disconnect. These are shortcuts for switching, not independent video windows, and they do not guarantee that Android keeps every app in memory.

```bash
node android-server/build.js
```

```bash
cd web-desktop
npm run server
```

```bash
npm run package-win
```

- `android-server/build.js` rebuilds `web-desktop/bin/beam-server.jar`. It needs the JDK from Android Studio and the Android SDK.
- `npm run server` starts the server without opening the browser, and `npm run app` starts Electron without packaging.
- `npm run package-win` builds `dist/Beam-win32-x64/Beam.exe`.
- `npm run installer` builds the installer `dist/installer/Beam-Setup-<version>.exe` with adb included (taken from the Android SDK platform-tools), so another PC needs neither Node.js nor the Android SDK.
- The app name is in `web-desktop/lib/brand.js` (server and Windows app), `web-desktop/public/js/brand.js` (web page) and the `build` section of `web-desktop/package.json` (installer).

For testing without a phone there is an Android 17 emulator. Start it from Android Studio (*Device Manager*) and it shows up in Beam as a 🖥️ device.
It takes about 10.5 GB. If you do not need it, delete it in Android Studio: *Device Manager* → the emulator → *Delete*, then *SDK Manager* → *SDK Platforms* → *Show Package Details* → Android 37.2 "Google Play Intel x86_64 … 16 KB Page Size" → uncheck it → *Apply*.

## The old version

The first prototype (an Android app with MediaProjection + Accessibility) was replaced because that approach could not offer multitouch for games, running with the screen off, or real sound. It was removed from the project.
