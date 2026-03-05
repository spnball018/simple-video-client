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

export interface MediaPlacement {
    AudioHostUrl: string;
    AudioFallbackUrl: string;
    ScreenDataUrl: string;
    ScreenSharingUrl: string;
    ScreenViewingUrl: string;
    SignalingUrl: string;
    TurnControlUrl: string;
    EventIngestionUrl?: string;
}

export interface MeetingInfo {
    MeetingId: string;
    ExternalMeetingId?: string;
    MediaRegion?: string;
    MediaPlacement: MediaPlacement;
}

export interface AttendeeInfo {
    AttendeeId: string;
    ExternalUserId?: string;
    JoinToken: string;
}

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

    async joinMeeting(): Promise<void> {
        if (!this.meetingId || !this.attendeeId || !this.joinToken || !this.audioHostUrl || !this.signalingUrl) {
            this.errorMessage = 'Please fill in all required fields.';
            return;
        }

        this.appState = 'joining';
        this.statusMessage = 'Connecting to meeting...';
        this.errorMessage = '';

        try {
            const logger = new ConsoleLogger('ChimeSDK', LogLevel.WARN);
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

            this.statusMessage = 'Setting up audio...';

            // Get audio devices and start
            const audioInputDevices = await this.meetingSession.audioVideo.listAudioInputDevices();
            if (audioInputDevices.length > 0) {
                await this.meetingSession.audioVideo.startAudioInput(audioInputDevices[0].deviceId);
            }

            // Get video devices
            const videoInputDevices = await this.meetingSession.audioVideo.listVideoInputDevices();

            // Observe tile updates
            this.meetingSession.audioVideo.addObserver({
                videoTileDidUpdate: (tileState: VideoTileState) => {
                    if (!tileState.boundVideoElement) {
                        if (tileState.localTile) {
                            this.localTileId = tileState.tileId ?? null;
                            const localVideoEl = this.localVideoEl?.nativeElement;
                            if (localVideoEl && tileState.tileId != null) {
                                this.meetingSession!.audioVideo.bindVideoElement(tileState.tileId, localVideoEl);
                            }
                        } else if (tileState.tileId != null) {
                            // Remote tile: create and bind a video element
                            const container = this.remoteContainerEl?.nativeElement;
                            if (container) {
                                const existingEl = container.querySelector(`[data-tile-id="${tileState.tileId}"]`);
                                if (!existingEl) {
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
                    }
                },
                videoTileWasRemoved: (tileId: number) => {
                    const container = this.remoteContainerEl?.nativeElement;
                    if (container) {
                        const el = container.querySelector(`[data-tile-id="${tileId}"]`);
                        el?.remove();
                    }
                    if (tileId === this.localTileId) {
                        this.localTileId = null;
                    }
                },
                audioVideoDidStart: () => {
                    this.statusMessage = 'Connected!';
                    this.appState = 'meeting';
                },
                audioVideoDidStop: (_sessionStatus: any) => {
                    if (this.appState === 'meeting') {
                        this.leaveMeeting();
                    }
                },
                audioVideoDidStartConnecting: (reconnecting: boolean) => {
                    if (reconnecting) {
                        this.statusMessage = 'Reconnecting...';
                    }
                }
            });

            // Start audio/video
            this.meetingSession.audioVideo.start();
            this.statusMessage = 'Joining...';

            // Start local video if camera available
            if (videoInputDevices.length > 0) {
                await this.meetingSession.audioVideo.startVideoInput(videoInputDevices[0].deviceId);
                this.meetingSession.audioVideo.startLocalVideoTile();
            }

        } catch (err: any) {
            this.appState = 'error';
            this.errorMessage = err?.message ?? 'An unknown error occurred.';
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
            const videoInputDevices = await this.meetingSession.audioVideo.listVideoInputDevices();
            if (videoInputDevices.length > 0) {
                await this.meetingSession.audioVideo.startVideoInput(videoInputDevices[0].deviceId);
                this.meetingSession.audioVideo.startLocalVideoTile();
            }
        } else {
            this.meetingSession.audioVideo.stopLocalVideoTile();
            await this.meetingSession.audioVideo.stopVideoInput();
        }
        this.isVideoOff = !this.isVideoOff;
    }

    leaveMeeting(): void {
        if (this.meetingSession) {
            this.meetingSession.audioVideo.stop();
            this.meetingSession = null;
        }
        this.appState = 'form';
        this.isMuted = false;
        this.isVideoOff = false;
        this.localTileId = null;
    }

    ngOnDestroy(): void {
        this.leaveMeeting();
    }
}
