# Video Client — User Manual

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | v18 or higher |
| npm | v8 or higher |

Check your versions:
```bash
node --version
npm --version
```

---

## 1. Installation

Clone the repository and install dependencies:

```bash
git clone git@github.com:spnball018/simple-video-client.git
cd simple-video-client
npm install
```

---

## 2. Running the Application

> [!IMPORTANT]
> You **must** run with HTTPS. Browsers block microphone and camera access on plain HTTP (except `localhost`).

### Option A — HTTPS on localhost (recommended for development)

```bash
npx ng serve --ssl --port 4443
```

Open your browser at: **https://localhost:4443**

> The browser will show a certificate warning because it is self-signed.
> Click **Advanced → Proceed to localhost** to continue.

### Option B — Plain HTTP (localhost only)

```bash
npm start
```

Open: **http://localhost:4200**

> This only works on the same machine. Microphone/camera will work because `localhost` is treated as secure.

---

## 3. Joining a Meeting

You need the following information from the host (or your backend API):

| Field | Where to find it | Required |
|-------|-----------------|----------|
| **Meeting ID** | `CreateMeeting` response → `Meeting.MeetingId` | ✅ |
| **Attendee ID** | `CreateAttendee` response → `Attendee.AttendeeId` | ✅ |
| **Join Token** | `CreateAttendee` response → `Attendee.JoinToken` | ✅ |
| **Audio Host URL** | `Meeting.MediaPlacement.AudioHostUrl` | ✅ |
| **Signaling URL** | `Meeting.MediaPlacement.SignalingUrl` | ✅ |
| Other MediaPlacement URLs | `Meeting.MediaPlacement.*` | Optional |

### Steps

1. Open the app in your browser
2. Fill in all **required** fields
3. Click **▼ Show optional MediaPlacement URLs** to enter `AudioFallbackUrl`, `ScreenDataUrl`, etc. if you have them
4. Click **Join Meeting**
5. Allow microphone and camera access when prompted by the browser

---

## 4. In the Meeting

| Button | Action |
|--------|--------|
| 🎙️ Mute / 🔇 Unmute | Toggle your microphone |
| 📹 Stop Video / 📷 Start Video | Toggle your camera |
| 📵 Leave | End the call and return to the join form |

---

## 5. Troubleshooting

### Stuck at "Joining..." for more than 30 seconds
- An error message will appear automatically after 30 seconds
- Double-check all URLs and tokens — they expire when the meeting ends
- Make sure the meeting was created by the host and is still active
- Open browser **DevTools → Console** to see detailed error logs (`[Chime]` prefix)

### "Microphone access denied" error
- You must use **HTTPS** — plain HTTP does not allow microphone access
- Make sure you clicked **Allow** when the browser asked for permissions

### TypeScript error on another machine: `Could not find a declaration file`
```bash
npm install        # ensure all packages are installed
npx ng serve --ssl --port 4443
```

### Certificate warning in browser
This is expected with the self-signed certificate from `ng serve --ssl`.
Click **Advanced → Proceed** to bypass it in development.

---

## 6. Project Structure

```
src/
├── app/
│   ├── chime-join/
│   │   ├── chime-join.component.ts    # Chime SDK logic
│   │   ├── chime-join.component.html  # UI template
│   │   └── chime-join.component.css   # Styles
│   ├── app.component.ts
│   └── app.module.ts
├── index.html
├── main.ts
└── styles.css
```
