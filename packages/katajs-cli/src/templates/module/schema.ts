import { z } from 'zod';

// Add Zod schemas for this module's request bodies, query params, and route
// params. Example:
//
//   export const Create{{Pascal}}Schema = z.object({
//     name: z.string().min(1),
//   });
//   export type Create{{Pascal}}Input = z.infer<typeof Create{{Pascal}}Schema>;

export const {{Pascal}}IdParam = z.object({
  id: z.uuid(),
});
export type {{Pascal}}IdParamInput = z.infer<typeof {{Pascal}}IdParam>;
