export function audioSelectionError(file: File): string | null {
  if (file.size === 0)
    return "This recording is empty. Record again or choose another audio file.";
  if (file.size > 10 * 1024 * 1024)
    return "This file exceeds the 10 MiB limit. Choose a smaller audio file up to 60 seconds long.";
  return null;
}
