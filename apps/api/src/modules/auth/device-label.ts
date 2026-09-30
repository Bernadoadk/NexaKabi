/**
 * Libellé lisible d'un appareil : « Chrome sur Android ».
 *
 * Partagé par les sessions et les abonnements aux notifications : dans les deux
 * cas, c'est la réponse à « sur quel appareil ? », posée par quelqu'un qui ne
 * lit pas un `User-Agent`.
 */
export function describeDevice(userAgent?: string): string | undefined {
  if (!userAgent) return undefined;

  const browsers: Array<[RegExp, string]> = [
    [/Edg\//, 'Edge'],
    [/OPR\//, 'Opera'],
    [/Chrome\//, 'Chrome'],
    [/Firefox\//, 'Firefox'],
    [/Safari\//, 'Safari'],
  ];

  const platforms: Array<[RegExp, string]> = [
    [/Android/, 'Android'],
    [/iPhone|iPad|iOS/, 'iOS'],
    [/Windows/, 'Windows'],
    [/Mac OS/, 'macOS'],
    [/Linux/, 'Linux'],
  ];

  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Navigateur';
  const platform = platforms.find(([pattern]) => pattern.test(userAgent))?.[1];

  return platform ? `${browser} sur ${platform}` : browser;
}
