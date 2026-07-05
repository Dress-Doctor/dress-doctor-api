import { SetMetadata } from '@nestjs/common';

export const SKIP_API_KEY = 'skipApiKeyCheck';
export const SkipApiKeyCheck = () => SetMetadata(SKIP_API_KEY, true);
