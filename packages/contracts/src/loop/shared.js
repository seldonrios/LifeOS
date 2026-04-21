import { z } from 'zod';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const DateOnlySchema = z.string().regex(DATE_ONLY_PATTERN);
//# sourceMappingURL=shared.js.map