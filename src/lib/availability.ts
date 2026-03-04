import type { Availability } from './types';
import { Timestamp } from 'firebase/firestore';

export function isInstantOnline(availability?: Availability | null): boolean {
  if (!availability || availability.status !== 'online') {
    return false;
  }
  
  const now = Timestamp.now();
  const until = availability.until;
  
  if (until && now.toMillis() > until.toMillis()) {
    return false; // expired
  }
  
  return true;
}
