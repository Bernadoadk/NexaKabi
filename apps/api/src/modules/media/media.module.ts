import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { LocalStorageProvider, StorageProvider } from './storage.provider';
import type { Env } from '../../config/env';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: StorageProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): StorageProvider => {
        // Cloudinary dès que les trois valeurs sont renseignées (voir env.ts —
        // `assertConsistency` refuse un sous-ensemble) ; sinon, stockage local
        // de développement, interdit en production par son propre constructeur.
        const configured = config.get('CLOUDINARY_CLOUD_NAME', { infer: true }).length > 0;
        return configured ? new CloudinaryStorageProvider(config) : new LocalStorageProvider(config);
      },
    },
  ],
  exports: [MediaService, StorageProvider],
})
export class MediaModule {}
