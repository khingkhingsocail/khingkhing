export function isPublicFeedDeepLink(hash: string) {
  return /^#feed-public-[a-f0-9]{32}$/.test(hash);
}
