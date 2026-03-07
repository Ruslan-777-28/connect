import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { config } from '../config';

/**
 * DailyBot handles the WebRTC connection to the Daily room.
 * For Commit 8.1, it focuses on joining and identifying participants.
 */
export class DailyBot {
  private callObject: DailyCall | null = null;
  private callId: string;

  constructor(callId: string) {
    this.callId = callId;
  }

  async join(roomUrl: string) {
    console.log(`[DailyBot] Joining room: ${roomUrl}`);
    
    // In a real Node environment, we might need a meeting token with room owner permissions
    // to access all raw audio tracks reliably.
    this.callObject = DailyIframe.createCallObject({
      audioSource: false, // Bot doesn't need its own mic for now
      videoSource: false, // Bot doesn't need its own camera
    });

    this.setupEvents();

    await this.callObject.join({
      url: roomUrl,
      userName: config.dailyBotName,
    });

    console.log(`[DailyBot] Joined successfully as ${config.dailyBotName}`);
  }

  private setupEvents() {
    if (!this.callObject) return;

    this.callObject.on('participant-joined', (event) => {
      console.log(`[DailyBot] Participant joined: ${event.participant.user_name} (${event.participant.session_id})`);
    });

    this.callObject.on('participant-updated', (event) => {
      const p = event.participant;
      const hasAudio = !!p.tracks.audio.persistentTrack;
      console.log(`[DailyBot] Participant updated: ${p.user_name}. Audio track: ${hasAudio ? 'ACTIVE' : 'NONE'}`);
      
      // COMMIT 8.1: In a production environment with raw audio access,
      // we would use callObject.getDailyStreams() or specialized media listeners here.
    });

    this.callObject.on('left-meeting', () => {
      console.log(`[DailyBot] Left meeting`);
    });

    this.callObject.on('error', (event) => {
      console.error(`[DailyBot] Error:`, event.errorMsg);
    });
  }

  async leave() {
    if (this.callObject) {
      console.log(`[DailyBot] Leaving room...`);
      await this.callObject.leave();
      await this.callObject.destroy();
      this.callObject = null;
    }
  }
}
