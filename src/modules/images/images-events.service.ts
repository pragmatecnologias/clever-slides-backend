import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';

export type ImageEventPayload = {
  slideId: string;
  status: string;
  imageUrl?: string | null;
  churchId: string;
  target?: 'background' | 'content';
};

@Injectable()
export class ImagesEventsService {
  private subjects = new Map<string, Subject<MessageEvent>>();

  private getSubject(churchId: string) {
    if (!this.subjects.has(churchId)) {
      this.subjects.set(churchId, new Subject<MessageEvent>());
    }
    return this.subjects.get(churchId)!;
  }

  emit(event: ImageEventPayload) {
    const subject = this.getSubject(event.churchId);
    subject.next({ data: event });
  }

  stream(churchId: string) {
    return this.getSubject(churchId).asObservable();
  }
}
