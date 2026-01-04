import { Global, Module } from '@nestjs/common';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
import appConfig from 'src/config/app-config';

@Global()
@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: appConfig.defaultLanguage,
      loaderOptions: {
        path: path.join(appConfig.baseDir, 'i18n'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [
        new QueryResolver(['lang', 'Accept-Language', 'language']),
        new HeaderResolver(['lang', 'Accept-Language', 'language']),
        AcceptLanguageResolver,
      ],
    }),
  ],
})
export class i18nModule {}
