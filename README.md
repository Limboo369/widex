# Wi-Dex - Universal Samsung DeX Alternative over Wi-Fi ⚡📱💻

**Wi-Dex** turns **ANY Android phone** (Samsung, Xiaomi, Pixel, OnePlus, Motorola, etc.) into a powerful desktop computing host connected over high-speed Wi-Fi (LAN).

Your phone runs all apps, games, and processing in the background (even with its screen locked or turned off), while your PC browser provides a full windowed Desktop Environment with complete Keyboard and Mouse controls (including WASD Pointer Lock Game Mode).

---

## 🌟 Core Features

- 🌐 **Universal Android Support**: Works on **ALL Android devices** (Android 7.0 to Android 14+). No Samsung Knox or specific hardware required!
- ⚡ **Ultra-Low Latency Wi-Fi Display**: 60 FPS hardware accelerated stream over local LAN network.
- 🔒 **Screen Off / Lock Operation**: Phone display can be turned off or dimmed to 0% to save battery and reduce heat while the processor powers the desktop experience.
- 🎮 **WASD & Mouse Game Mode**: Full `Pointer Lock API` support for mobile FPS/3D games (PUBG, Call of Duty, Genshin Impact, Wild Rift) with custom touch-mapping nodes for keyboard & mouse look.
- 🪟 **Modern DeX Desktop UI**: Glassmorphic window manager (draggable, resizable, maximize/minimize), Start Menu App Drawer, Dock, Battery/Ping Monitor.

---

## 🚀 Quick Setup & Usage Guide

### 1. Launch Web Desktop on PC
Make sure Node.js is installed on your PC:
```bash
cd web-desktop
npm start
```
Then open `http://localhost:3000` in your PC browser (Chrome, Edge, Opera, Brave).

### 2. Run Android Host App on Phone
1. Open the `/android` folder in **Android Studio**.
2. Connect your phone via USB or Wi-Fi debugging and click **Run / Install APK**.
3. On the phone:
   - Tap **ENABLE** next to *Mouse & Keyboard Accessibility Service* and turn on **Wi-Dex Host**.
   - Tap **START WI-DEX SERVER** and grant Screen Capture permission.
4. Note your phone's LAN IP address shown on screen (e.g. `http://192.168.1.105:8080`).

### 3. Connect PC to Phone
- In the PC Web Desktop, click **Wi-Fi Settings** or the **Phone Mirror** icon.
- Enter your phone's IP address and click **Connect**.
- You can now control your Android phone directly from your PC browser!

---

## 🎮 Game Controls & Pointer Lock Setup

1. Open any game from the **Start Menu App Drawer**.
2. Click **🎮 Game Mode** in the window toolbar or taskbar.
3. Click inside the phone display canvas to capture raw mouse movement (`Pointer Lock`).
4. Controls:
   - **W / A / S / D**: Virtual Joystick movement.
   - **Left Click**: Fire / Primary Touch.
   - **Right Click**: Aim / Secondary Action (or Android BACK).
   - **Space**: Jump.
   - **Shift**: Sprint.
   - **F8 / ESC**: Release mouse pointer lock.

---

## 📂 Project Structure

```
Pex/
├── android/               # Android App Source (Kotlin, MediaProjection, Accessibility)
│   ├── app/src/main/
│   │   ├── java/com/widex/host/
│   │   │   ├── MainActivity.kt               # Setup UI & IP display
│   │   │   ├── service/ScreenStreamService.kt# Display Encoder & Web Server
│   │   │   ├── service/RemoteInputService.kt # Mouse & Touch Injection Engine
│   │   │   └── server/DexWebServer.kt        # Embedded WebSocket Server
│   │   └── AndroidManifest.xml
│   └── build.gradle
├── web-desktop/           # PC Browser Desktop Environment
│   ├── public/
│   │   ├── index.html     # DeX Desktop HTML Layout
│   │   ├── css/style.css  # Modern Glassmorphic CSS System
│   │   └── js/
│   │       ├── desktop.js # Window Manager & Dock
│   │       ├── streamer.js# Low-Latency Canvas Video Decoder
│   │       ├── input-mapper.js # WASD & Mouse Input Mapper
│   │       └── app.js     # Main Client Controller
│   ├── server.js          # Express & WebSocket Relay Server
│   └── package.json
└── README.md
```
