export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed';
/** Never fall through to clipboard after cancel/failure. Each fallback is explicit. */
export async function shareWithDevice(
  data: ShareData,
  nav: Pick<Navigator, 'share' | 'canShare'> = navigator,
): Promise<ShareOutcome> {
  if (!nav.share) return 'unsupported';
  try {
    if (data.files && (!nav.canShare || !nav.canShare({ files: data.files }))) return 'unsupported';
    await nav.share(data);
    return 'shared';
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
