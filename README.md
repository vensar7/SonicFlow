# SonicFlow Studio

Desktop soundboard and realtime voice effects with a phone-based LAN controller.

## Run

```sh
npm install
npm run dev
```

`npm run dev` opens the Electron studio and exposes the phone controller on the local network. Scan the QR code in the studio; both devices must be on the same Wi-Fi. If Windows Firewall asks, allow SonicFlow on your private network.

## VB-CABLE

1. In SonicFlow, open **Voice** and choose your physical microphone as input.
2. Choose **CABLE Input** as the voice output.
3. In Discord, OBS, or another app, choose **CABLE Output** as its microphone.

For soundboard audio, choose **CABLE Input** in the Sound pad output selector as well.

## Build

```sh
npm run build
npm run package
```

`npm run package` creates a Windows installer. `npm run lint` checks renderer and Electron source files.
