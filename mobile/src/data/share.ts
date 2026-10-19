// Writes text to the cache directory and opens the system share sheet (save to Files, AirDrop, ...).
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Returns false when sharing is not available on this device. */
export async function shareFile(fileName: string, content: string, mimeType = 'application/json'): Promise<boolean> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Drift results' });
  return true;
}
