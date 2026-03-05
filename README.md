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

## 3. Getting the Required Credentials

The values come from two AWS Chime SDK API calls that the **host/backend** must make.

### Flow Overview

```
Backend (host)                         Attendee (this app)
─────────────────────────────────────────────────────────────
1. CreateMeeting  ──►  Meeting object
2. CreateAttendee ──►  Attendee object
3. Share values   ──►  Paste into the Join form
```

---

### Step 1 — CreateMeeting

The host calls the [CreateMeeting](https://docs.aws.amazon.com/chime-sdk/latest/APIReference/API_meeting-chime_CreateMeeting.html) API to create a room.

**AWS CLI example:**
```bash
aws chime-sdk-meetings create-meeting \
  --client-request-token "$(uuidgen)" \
  --media-region "ap-southeast-1" \
  --external-meeting-id "my-meeting-001"
```

**Example response:**
```json
{
  "Meeting": {
    "MeetingId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ExternalMeetingId": "my-meeting-001",
    "MediaRegion": "ap-southeast-1",
    "MediaPlacement": {
      "AudioHostUrl": "wss://hgrfn5djj32s.k.m2.livekit.cloud:443/calls/...",
      "AudioFallbackUrl": "wss://hgrfn5djj32s.k.m2.livekit.cloud:443/calls/...",
      "ScreenDataUrl": "wss://hgrfn5djj32s.k.m2.livekit.cloud:443/calls/...",
      "ScreenSharingUrl": "wss://hgrfn5djj32s.k.m2.livekit.cloud:443/calls/...",
      "ScreenViewingUrl": "wss://hgrfn5djj32s.k.m2.livekit.cloud:443/calls/...",
      "SignalingUrl": "wss://signal.chime.aws/control/...",
      "TurnControlUrl": "https://2hm2n.turn.chime.aws/caller"
    }
  }
}
```

**Extract these values:**

| App field | JSON path |
|-----------|-----------|
| **Meeting ID** | `Meeting.MeetingId` |
| **Audio Host URL** | `Meeting.MediaPlacement.AudioHostUrl` |
| **Signaling URL** | `Meeting.MediaPlacement.SignalingUrl` |
| Audio Fallback URL *(optional)* | `Meeting.MediaPlacement.AudioFallbackUrl` |
| Screen Data URL *(optional)* | `Meeting.MediaPlacement.ScreenDataUrl` |
| Screen Sharing URL *(optional)* | `Meeting.MediaPlacement.ScreenSharingUrl` |
| Screen Viewing URL *(optional)* | `Meeting.MediaPlacement.ScreenViewingUrl` |
| TURN Control URL *(optional)* | `Meeting.MediaPlacement.TurnControlUrl` |

---

### Step 2 — CreateAttendee

For **each participant** who wants to join, the host calls [CreateAttendee](https://docs.aws.amazon.com/chime-sdk/latest/APIReference/API_meeting-chime_CreateAttendee.html).

**AWS CLI example:**
```bash
aws chime-sdk-meetings create-attendee \
  --meeting-id "a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  --external-user-id "user-john-doe"
```

**Example response:**
```json
{
  "Attendee": {
    "AttendeeId": "aa11bb22-cc33-dd44-ee55-ff6677889900",
    "ExternalUserId": "user-john-doe",
    "JoinToken": "QVFJREFIamdxTUV...very-long-base64-string...=="
  }
}
```

**Extract these values:**

| App field | JSON path |
|-----------|-----------|
| **Attendee ID** | `Attendee.AttendeeId` |
| **Join Token** | `Attendee.JoinToken` *(long base64 string)* |

> [!NOTE]
> Each attendee gets their own unique `AttendeeId` and `JoinToken`. Never reuse tokens between users.

---

### Step 3 — Combine and Fill the Form

Paste all values into the join form. A complete set looks like:

| Field | Value |
|-------|-------|
| Meeting ID | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| Attendee ID | `aa11bb22-cc33-dd44-ee55-ff6677889900` |
| Join Token | `QVFJREFIamdxTUV...==` |
| Audio Host URL | `wss://hgrfn5djj32s.k.m2.livekit.cloud:443/calls/...` |
| Signaling URL | `wss://signal.chime.aws/control/...` |

---

### Using AWS SDK (JavaScript/Node.js)

If you have a Node.js backend, you can call both APIs like this:

```javascript
const { ChimeSDKMeetingsClient, CreateMeetingCommand, CreateAttendeeCommand } = require("@aws-sdk/client-chime-sdk-meetings");
const { randomUUID } = require("crypto");

const client = new ChimeSDKMeetingsClient({ region: "ap-southeast-1" });

// 1. Create meeting
const meetingRes = await client.send(new CreateMeetingCommand({
  ClientRequestToken: randomUUID(),
  MediaRegion: "ap-southeast-1",
  ExternalMeetingId: "my-room-001"
}));
const meeting = meetingRes.Meeting;

// 2. Create attendee
const attendeeRes = await client.send(new CreateAttendeeCommand({
  MeetingId: meeting.MeetingId,
  ExternalUserId: "user-john"
}));
const attendee = attendeeRes.Attendee;

// 3. Share these with the frontend:
console.log({
  meetingId:    meeting.MeetingId,
  attendeeId:   attendee.AttendeeId,
  joinToken:    attendee.JoinToken,
  audioHostUrl: meeting.MediaPlacement.AudioHostUrl,
  signalingUrl: meeting.MediaPlacement.SignalingUrl,
  // optional:
  audioFallbackUrl: meeting.MediaPlacement.AudioFallbackUrl,
  screenDataUrl:    meeting.MediaPlacement.ScreenDataUrl,
  screenSharingUrl: meeting.MediaPlacement.ScreenSharingUrl,
  screenViewingUrl: meeting.MediaPlacement.ScreenViewingUrl,
  turnControlUrl:   meeting.MediaPlacement.TurnControlUrl,
});
```

> [!WARNING]
> The `JoinToken` and `MediaPlacement` URLs are **sensitive**. Do not expose your AWS credentials to the browser. Always generate them on the backend and pass only the values above to the frontend.

---

## 4. Joining a Meeting

1. Open the app in your browser (**https://localhost:4443**)
2. Paste the values from Step 3 above into the form
3. Click **▼ Show optional MediaPlacement URLs** to enter additional fields if available
4. Click **Join Meeting**
5. Allow microphone and camera access when the browser prompts you


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
