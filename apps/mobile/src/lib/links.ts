/** Notifications carry website paths. This maps them to app screens. */
export function appRoute(link?: string | null): string | null {
  if (!link) return null;
  const review = link.match(/^\/admin\/kyc\?org=([a-f\d]{24})/i);
  if (review) return `/admin-org/${review[1]}`;
  const game = link.match(/^\/me\/games\/([a-f\d]{24})/i);
  if (game) return `/game/${game[1]}`;
  const known: Record<string, string> = {
    '/me/games': '/(resident)/games',
    '/me/laundry': '/(resident)/laundry',
    '/me/payments': '/(resident)/payments',
    '/me/requests': '/(resident)/requests',
    '/app/dashboard': '/',
  };
  return known[link] ?? null;
}
