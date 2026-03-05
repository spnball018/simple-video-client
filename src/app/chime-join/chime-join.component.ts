import {
    Component,
    OnDestroy,
    ElementRef,
    ViewChild
} from '@angular/core';
import {
    ConsoleLogger,
    DefaultDeviceController,
    DefaultMeetingSession,
    LogLevel,
    MeetingSessionConfiguration,
    VideoTileState
} from 'amazon-chime-sdk-js';

type AppState = 'form' | 'joining' | 'meeting' | 'error';

@Component({
    selector: 'app-chime-join',
    templateUrl: './chime-join.component.html',
    styleUrls: ['./chime-join.component.css']
})
export class ChimeJoinComponent implements OnDestroy {

    @ViewChild('localVideo') localVideoEl!: ElementRef<HTMLVideoElement>;
    @ViewChild('remoteVideosContainer') remoteContainerEl!: ElementRef<HTMLDivElement>;

    // Form fields
    meetingId = '';
    attendeeId = '';
    joinToken = '';
    audioHostUrl = '';
    audioFallbackUrl = '';
    screenDataUrl = '';
    screenSharingUrl = '';
    screenViewingUrl = '';
    signalingUrl = '';
    turnControlUrl = '';

    // State
    appState: AppState = 'form';
    errorMessage = '';
    statusMessage = '';
    isMuted = false;
    isVideoOff = false;
    showAdvanced = false;

    private meetingSession: DefaultMeetingSession | null = null;
    private localTileId: number | null = null;
    private joinTimeoutHandle: any = null;

    async joinMeeting(): Promise<void> {
        if (!this.meetingId || !this.attendeeId || !this.joinToken || !this.audioHostUrl || !this.signalingUrl) {
            this.errorMessage = 'Please fill in all required fields.';
            return;
        }

        this.appState = 'joining';
        this.statusMessage = 'Initializing...';
        this.errorMessage = '';

        try {
            const logger = new ConsoleLogger('ChimeSDK', LogLevel.INFO);
            const deviceController = new DefaultDeviceController(logger);

            const meetingResponse = {
                Meeting: {
                    MeetingId: this.meetingId,
                    MediaPlacement: {
                        AudioHostUrl: this.audioHostUrl,
                        AudioFallbackUrl: this.audioFallbackUrl || this.audioHostUrl,
                        ScreenDataUrl: this.screenDataUrl || '',
                        ScreenSharingUrl: this.screenSharingUrl || '',
                        ScreenViewingUrl: this.screenViewingUrl || '',
                        SignalingUrl: this.signalingUrl,
                        TurnControlUrl: this.turnControlUrl || ''
                    }
                }
            };

            const attendeeResponse = {
                Attendee: {
                    AttendeeId: this.attendeeId,
                    JoinToken: this.joinToken
                }
            };

            const configuration = new MeetingSessionConfiguration(meetingResponse, attendeeResponse);
            this.meetingSession = new DefaultMeetingSession(configuration, logger, deviceController);

            // --- Bind audio output BEFORE starting ---
            const audioOutputEl = document.createElement('audio');
            audioOutputEl.id = 'chime-audio-output';
            document.body.appendChild(audioOutputEl);
            await this.meetingSession.audioVideo.bindAudioElement(audioOutputEl);

            // --- Setup observer ---
            this.meetingSession.audioVideo.addObserver({
                audioVideoDidStart: () => {
                    console.log('[Chime] audioVideoDidStart fired ✅');
                    if (this.joinTimeoutHandle) {
                        clearTimeout(this.joinTimeoutHandle);
                        this.joinTimeoutHandle = null;
                    }
                    this.statusMessage = 'Connected!';
                    this.appState = 'meeting';

                    // Start video after we're in meeting state
                    this.startLocalVideoIfAvailable();
                },
                audioVideoDidStop: (sessionStatus: any) => {
                    console.log('[Chime] audioVideoDidStop:', sessionStatus);
                    if (this.appState === 'meeting') {
                        this.leaveMeeting();
                    } else if (this.appState === 'joining') {
                        this.appState = 'error';
                        this.errorMessage = `Session stopped before connecting (status: ${sessionStatus?.statusCode ?? 'unknown'}). Check your credentials and URLs.`;
                    }
                },
                audioVideoDidStartConnecting: (reconnecting: boolean) => {
                    console.log('[Chime] audioVideoDidStartConnecting, reconnecting=', reconnecting);
                    this.statusMessage = reconnecting ? 'Reconnecting...' : 'Connecting to Chime...';
                },
                videoTileDidUpdate: (tileState: VideoTileState) => {
                    if (tileState.localTile) {
                        this.localTileId = tileState.tileId ?? null;
                        const el = this.localVideoEl?.nativeElement;
                        if (el && tileState.tileId != null) {
                            this.meetingSession!.audioVideo.bindVideoElement(tileState.tileId, el);
                        }
                    } else if (tileState.tileId != null) {
                        const container = this.remoteContainerEl?.nativeElement;
                        if (container) {
                            const existing = container.querySelector(`[data-tile-id="${tileState.tileId}"]`);
                            if (!existing) {
                                const videoEl = document.createElement('video');
                                videoEl.setAttribute('data-tile-id', String(tileState.tileId));
                                videoEl.autoplay = true;
                                videoEl.playsInline = true;
                                videoEl.className = 'remote-video';
                                container.appendChild(videoEl);
                                this.meetingSession!.audioVideo.bindVideoElement(tileState.tileId, videoEl);
                            }
                        }
                    }
                },
                videoTileWasRemoved: (tileId: number) => {
                    const container = this.remoteContainerEl?.nativeElement;
                    if (container) {
                        container.querySelector(`[data-tile-id="${tileId}"]`)?.remove();
                    }
                    if (tileId === this.localTileId) this.localTileId = null;
                }
            });

            // --- Start audio input (mic) ---
            this.statusMessage = 'Requesting microphone...';
            try {
                const audioInputDevices = await this.meetingSession.audioVideo.listAudioInputDevices();
                if (audioInputDevices.length > 0) {
                    await this.meetingSession.audioVideo.startAudioInput(audioInputDevices[0].deviceId);
                }
            } catch (micErr: any) {
                console.warn('[Chime] Mic access failed (continuing without mic):', micErr);
                // Don't block joining if mic is unavailable
            }

            // --- Start the session ---
            this.statusMessage = 'Joining session...';
            this.meetingSession.audioVideo.start();

            // 30-second timeout safety net
            this.joinTimeoutHandle = setTimeout(() => {
                if (this.appState === 'joining') {
                    this.appState = 'error';
                    this.errorMessage =
                        'Timed out waiting to connect (30s). Check that your Meeting ID, Attendee ID, Join Token, Audio Host URL, and Signaling URL are all correct and the meeting is still active.';
                    this.leaveMeeting();
                }
            }, 30000);

        } catch (err: any) {
            this.appState = 'error';
            this.errorMessage = err?.message ?? 'An unknown error occurred.';
        }
    }

    private async startLocalVideoIfAvailable(): Promise<void> {
        if (!this.meetingSession) return;
        try {
            const videoInputDevices = await this.meetingSession.audioVideo.listVideoInputDevices();
            if (videoInputDevices.length > 0) {
                await this.meetingSession.audioVideo.startVideoInput(videoInputDevices[0].deviceId);
                this.meetingSession.audioVideo.startLocalVideoTile();
            }
        } catch (e) {
            console.warn('[Chime] Could not start local video:', e);
        }
    }

    async toggleMute(): Promise<void> {
        if (!this.meetingSession) return;
        if (this.isMuted) {
            this.meetingSession.audioVideo.realtimeUnmuteLocalAudio();
        } else {
            this.meetingSession.audioVideo.realtimeMuteLocalAudio();
        }
        this.isMuted = !this.isMuted;
    }

    async toggleVideo(): Promise<void> {
        if (!this.meetingSession) return;
        if (this.isVideoOff) {
            await this.startLocalVideoIfAvailable();
        } else {
            this.meetingSession.audioVideo.stopLocalVideoTile();
            await this.meetingSession.audioVideo.stopVideoInput();
        }
        this.isVideoOff = !this.isVideoOff;
    }

    leaveMeeting(): void {
        if (this.joinTimeoutHandle) {
            clearTimeout(this.joinTimeoutHandle);
            this.joinTimeoutHandle = null;
        }
        if (this.meetingSession) {
            try { this.meetingSession.audioVideo.stop(); } catch (_) { }
            this.meetingSession = null;
        }
        // Remove dynamically created audio element
        document.getElementById('chime-audio-output')?.remove();
        this.appState = 'form';
        this.isMuted = false;
        this.isVideoOff = false;
        this.localTileId = null;
    }

    ngOnDestroy(): void {
        this.leaveMeeting();
    }
}
