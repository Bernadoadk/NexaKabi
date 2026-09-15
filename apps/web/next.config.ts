import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,

  /**
   * Le design system est distribué en source TypeScript : il est transpilé par
   * l'application, ce qui évite une étape de build intermédiaire et conserve
   * le tree-shaking.
   */
  transpilePackages: ['@nexakabi/ui'],

  images: {
    // AVIF d'abord : la cible de 150 Ko sur le premier écran l'impose.
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    optimizePackageImports: ['@nexakabi/ui', 'date-fns'],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            // La caméra n'est ouverte que par l'écran de contrôle d'accès.
            value: 'camera=(self), microphone=(), geolocation=(self), payment=()',
          },
        ],
      },
    ];
  },
};

export default config;
