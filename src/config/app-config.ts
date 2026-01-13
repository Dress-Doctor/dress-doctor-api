import * as path from 'path';

export default {
  defaultLanguage: 'fr',
  otpBaseCoolDownMin: 5,
  supportedLanguage: ['fr', 'en'],
  baseDir: path.join(process.cwd(), 'src'),
};
