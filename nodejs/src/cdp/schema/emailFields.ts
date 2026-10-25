import { z } from 'zod'

export const BareEmailAddressSchema = z
    .string()
    .regex(/^[^\s@"<>,;:()[\]\\]+@[^\s@"<>,;:()[\]\\]+\.[^\s@"<>,;:()[\]\\]+$/)
