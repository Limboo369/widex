# Wi-Dex: Android igre na PC-u (miš + tastatura, preko Wi-Fi-ja)

Wi-Dex prikazuje ekran telefona na računaru, u browseru ili kao Windows aplikacija. Android igre možeš da igraš mišem i tastaturom: **WASD** za kretanje, **miš** za kameru, **klik** za pucanje. Sve ide preko Wi-Fi-ja, a na telefon ne treba instalirati nikakvu aplikaciju.

Pravljeno i testirano za **Pixel 7 Pro** sa najnovijim Androidom (testirano na Android 17 emulatoru, API 37).

---

## Šta dobijaš

- 🎞️ **Slika u realnom vremenu**: telefon hardverski enkodira H.264, a browser hardverski dekodira (WebCodecs). 60 FPS (može 90/120), malo kašnjenje.
- 🔊 **Zvuk igre na računaru** (Android 12+). Dok je Wi-Dex povezan, telefon je nem.
- 🎮 **Pravi multitouch za igre**: istovremeno možeš da držiš W, pomeraš kameru mišem, pucaš i nišaniš.
- ⌨️ **Editor mapiranja** (`F9`) sa šablonima (pucačine, MOBA, osnovni). Profil se čuva po igri i sam se učita kad otvoriš tu igru.
- 💡 **Ekran telefona može da bude ugašen** dok igraš. Igra radi dalje, telefon se manje greje.
- 🖱️ **Normalno korišćenje telefona**: klik je dodir, desni klik je Nazad, točkić skroluje. Kucanje radi, i sa š, ć, č, đ, ž. Radi i Ctrl+C / Ctrl+V između PC-a i telefona.
- 🖥️ **Poseban desktop (eksperimentalno)**: telefon pravi dodatni 1920×1080 ekran sa taskbar-om, kao Samsung DeX. Aplikacije se otvaraju u prozorima.
- 🔄 **Samo se ponovo poveže** ako Wi-Fi zakaže usred igre.

## Šta ti treba

| | |
|---|---|
| Računar | Windows sa **Node.js** (imaš v22) i **adb** iz Android SDK (imaš preko Android Studio) |
| Prikaz | **Windows aplikacija** (prečica `Wi-Dex`) ili **Chrome/Edge** |
| Telefon | Android 11+ (Pixel 7 Pro ✅). Zvuk traži Android 12+ |
| Mreža | Telefon i PC na **istoj Wi-Fi mreži**, najbolje 5 GHz |

## Pokretanje

- **Prečica `Wi-Dex`** (tip „Shortcut“, sa plavom ikonicom) ili `Wi-Dex (aplikacija).bat` otvara Windows aplikaciju. Ovo se preporučuje za igre, jer prečice browsera ne smetaju: Ctrl+W neće zatvoriti prozor dok čučiš i ideš napred.
- **`Wi-Dex (browser).bat`** otvara Wi-Dex u browseru na `http://localhost:3000`. Crni prozor (server) ostavi otvoren dok igraš.

Posle prvog povezivanja Wi-Dex se sam poveže na telefon čim ga pokreneš (ako je na telefonu uključeno Bežično otklanjanje grešaka).

## Prvo povezivanje telefona (radi se samo jednom)

1. **Uključi Opcije za programere**: *Podešavanja → O telefonu* → 7 puta dodirni **Broj verzije** (*Build number*).
2. *Podešavanja → Sistem → Opcije za programere* → uključi **Bežično otklanjanje grešaka** (*Wireless debugging*).
3. Uđi u **Bežično otklanjanje grešaka** → **Upari uređaj pomoću koda za uparivanje** (*Pair device with pairing code*).
4. U Wi-Dex-u (prozor **Povezivanje**) unesi 6-cifreni kod i klikni **Upari**. Adresa telefona se obično pojavi sama. Ako se ne pojavi, prepiši *IP adresu i port* sa tog prozora na telefonu.
5. Telefon se pojavi u listi. Klikni **▶ Pokreni**.

> Posle restarta telefona ponovo uključi *Bežično otklanjanje grešaka*. Uparivanje ne treba ponavljati.
> Ako se telefon ne pojavi sam, unesi *IP adresu i port* sa ekrana *Bežično otklanjanje grešaka* i klikni **Poveži**. Port se menja svaki put kad uključiš tu opciju.
> Može i preko USB kabla (uključi *USB otklanjanje grešaka*).

## Igranje

1. Otvori igru iz menija **⚡ Start** (lista aplikacija sa telefona) ili direktno na slici.
2. Pritisni **`F8`** (ili 🎮 Igra): tastatura i miš postaju kontrole. **Klikni na sliku** da miš „uhvati“ kameru.
3. Prvi put pritisni **`F9`** (mapiranje). Izaberi šablon, prevuci oznake tačno preko dugmadi u igri, pa klikni **Sačuvaj**. Profil se pamti za tu igru.
4. Taster **`` ` ``** (levo od 1) oslobađa miš za klik po menijima. Ponovo **`` ` ``** vraća miš u igru.
5. **`F10`** je ceo ekran. U celom ekranu Esc ide igri; **drži Esc** za izlaz.

### Šablon „Pucačina“ (PUBG, CoD, Free Fire...)

| Taster | Radnja | Taster | Radnja |
|---|---|---|---|
| W A S D | kretanje (džojstik) | Shift | trčanje |
| miš | kamera | levi klik | pucaj |
| desni klik | nišan | Space | skok |
| C / Z | čučni / legni | R | punjenje |
| F | uzmi | 1 / 2 | oružje |
| G / H | bomba / lečenje | Q / E | viri levo / desno |
| M / Tab | mapa / ranac | `` ` `` | slobodan kursor |
| L-Alt + miš | slobodan pogled (oko 👁) | | |

Pozicije u šablonu su približne. Uvek ih poravnaj sa svojom igrom (`F9`), jer svaka igra (i svaki raspored HUD-a) ima dugmad na drugom mestu.

### Vrste kontrola u editoru

- **Dugme**: taster ili klik miša dodiruje tu tačku. *Drži* znači da prst stoji dok držiš taster. *Dodir* je kratak klik. Opcija *Miš pomera ovo dugme* služi za slobodan pogled: dok držiš taster, miš vuče to dugme umesto kamere.
- **Džojstik**: 4 tastera pomeraju „prst“ od centra. Trčanje ga gura dalje.
- **Kamera**: pomeranje miša prevlači „prst“ po praznom delu ekrana. Kad stigne do ivice zone, prst se podigne i vrati na početak. Postavi je na mesto gde prevlačenje okreće kameru u igri.

## Saveti za što manje kašnjenje

- Wi-Fi na **5 GHz** (ili 6 GHz), telefon blizu rutera, PC po mogućstvu na kablu.
- *Podešavanja*: kvalitet **Brzo** (1280, 8 Mb/s) ako slika kasni. **Balans** (1920, 12 Mb/s) je podrazumevan.
- Za igre koristi **Windows aplikaciju** i ceo ekran (`F10`).
- Uključi **Ugasi ekran telefona**: telefon se manje greje, a igra radi isto.
- Ping (📶 dole desno) pokazuje kašnjenje do telefona. Preko Wi-Fi-ja je obično 3–15 ms.

## Problemi i rešenja

| Problem | Rešenje |
|---|---|
| Telefon se ne pojavljuje | Ista Wi-Fi mreža? Isključi pa uključi *Bežično otklanjanje grešaka* ili unesi IP i port ručno. |
| „Čeka dozvolu“ | Na telefonu prihvati „Dozvoliti otklanjanje grešaka?“ (označi *Uvek dozvoli*). |
| Nema slike u browseru | Koristi Chrome/Edge i adresu `http://localhost:3000` (ne IP adresu), ili Windows aplikaciju. |
| Nema zvuka | Klikni bilo gde na stranici (browser traži klik pre zvuka). Zvuk traži Android 12+. |
| Slika seče ili kasni | *Podešavanja*: manji protok ili rezolucija. Proveri Wi-Fi signal. |
| Kontrole promašuju | `F9` dok je igra otvorena, pa poravnaj oznake sa dugmadima. |
| Miš se ne hvata | Klikni na sliku. U režimu igre `` ` `` menja kursor ↔ igra. |
| Ekran telefona ostao ugašen | Pritisni dugme za napajanje dva puta. Wi-Dex ga inače sam vrati kad se veza prekine. |
| Igra ne prihvata tastaturu | Neke igre imaju anti-cheat protiv mapiranja. Koristi na svoju odgovornost. |

*Podešavanja → Dijagnostika → Prikaži log* pokazuje šta se dešava na telefonu.

## Kako radi (tehnički)

```
 Telefon (Android)                          Računar (Windows)
 ┌───────────────────────────────┐   adb    ┌──────────────────────────┐  WebSocket  ┌─────────────────────────┐
 │ widex-server.jar (app_process │◄────────►│ web-desktop/server.js    │◄───────────►│ Browser / Wi-Dex.exe    │
 │ sa „shell“ pravima):          │  Wi-Fi   │ (Node.js)                │  localhost  │ - WebCodecs (H.264)     │
 │ - ekran: DisplayManager →     │ (forward)│ - adb: uparivanje, veza  │             │ - AudioWorklet (zvuk)   │
 │   MediaCodec H.264 (hardver)  │          │ - pokreće server na tel. │             │ - miš/tastatura →       │
 │ - zvuk: REMOTE_SUBMIX (PCM)   │          │ - prosleđuje video/zvuk  │             │   dodiri (mapiranje)    │
 │ - dodiri: InputManager        │          │ - profili, podešavanja   │             │ - desktop, prozori      │
 │   (pravi multitouch)          │          └──────────────────────────┘             └─────────────────────────┘
 │ - gašenje ekrana, lista app   │
 └───────────────────────────────┘
```

Wi-Dex koristi isti pristup kao [scrcpy](https://github.com/Genymobile/scrcpy): mali Java server se preko adb-a pošalje na telefon i pokrene sa pravima `shell` korisnika. Zato mu ne treba aplikacija na telefonu ni Accessibility. Tako može da šalje prave multitouch događaje (neophodno za igre), snima ekran bez pitanja i gasi ekran dok igra radi dalje.

Podaci (profili tastera, podešavanja) su u `%APPDATA%\Wi-Dex`. Dele ih browser verzija i aplikacija.
Server na računaru sluša samo na `localhost`, pa niko drugi sa mreže ne može da upravlja telefonom.

## Struktura projekta

```
Pex/
├── Wi-Dex (prečica)            otvara Windows aplikaciju (Wi-Dex.exe)
├── Wi-Dex (aplikacija).bat     pokreće Windows aplikaciju (prvi put je napravi)
├── Wi-Dex (browser).bat        pokreće server i otvara browser
├── android-server/             Java server za telefon
│   ├── build.js                build bez Gradle-a (javac + d8 iz Android SDK)
│   └── src/com/widex/server/   video, zvuk, kontrola, pomoćne klase
├── web-desktop/
│   ├── server.js               Node.js server (HTTP API + WebSocket)
│   ├── lib/                    adb, sesija, protokol, aplikacije, podaci
│   ├── public/                 web interfejs (desktop, video, zvuk, režim igre, editor)
│   ├── presets/                šabloni mapiranja (pucačina, MOBA, osnovni)
│   ├── bin/widex-server.jar    izgrađen server (šalje se na telefon)
│   ├── app/                    Windows aplikacija (Electron)
│   ├── scripts/                pakovanje u .exe, ikonica
│   └── dist/                   Wi-Dex.exe (napravi se komandom `npm run package-win`)
└── legacy/                     stara verzija (Android aplikacija), ne koristi se
```

## Razvoj

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

- `android-server/build.js` ponovo pravi `web-desktop/bin/widex-server.jar`. Treba mu JDK iz Android Studio i Android SDK.
- `npm run server` pokreće server bez otvaranja browsera, a `npm run app` pokreće Electron bez pakovanja.
- `npm run package-win` pravi `dist/Wi-Dex-win32-x64/Wi-Dex.exe`.

Za testiranje bez telefona postoji emulator **WiDex_Test** (Android 17). Pokreće se iz Android Studio (*Device Manager*) i u Wi-Dex-u se pojavi kao 🖥️ uređaj.
Zauzima oko 10.5 GB. Ako ti ne treba, obriši ga u Android Studio: *Device Manager* → WiDex_Test → *Delete*, pa *SDK Manager* → *SDK Platforms* → *Show Package Details* → Android 37.2 „Google Play Intel x86_64 … 16 KB Page Size“ → skini kvačicu → *Apply*.

## Stara verzija

Prvi prototip (Android aplikacija sa MediaProjection + Accessibility) je u `legacy/` i u prvom git commit-u. Zamenjen je jer taj pristup nije mogao da pruži multitouch za igre, rad sa ugašenim ekranom ni pravi zvuk.

Vraćanje stare verzije:

```bash
git checkout b31c427
```
