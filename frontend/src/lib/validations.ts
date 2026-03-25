import { z } from 'zod/v4'

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z
    .string()
    .email('Informe um email valido'),
  password: z
    .string()
    .min(1, 'A senha e obrigatoria'),
})

export type LoginForm = z.infer<typeof loginSchema>

// ─── Register ─────────────────────────────────────────────────────────────────
export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, 'O nome deve ter pelo menos 2 caracteres'),
    email: z
      .string()
      .email('Informe um email valido'),
    phone: z
      .string()
      .min(10, 'O telefone deve ter pelo menos 10 digitos')
      .max(15, 'O telefone deve ter no maximo 15 digitos'),
    password: z
      .string()
      .min(8, 'A senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z
      .string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas nao coincidem',
    path: ['confirmPassword'],
  })

export type RegisterForm = z.infer<typeof registerSchema>

// ─── Patient ──────────────────────────────────────────────────────────────────
export const patientSchema = z.object({
  name: z
    .string()
    .min(2, 'O nome deve ter pelo menos 2 caracteres'),
  phone: z
    .string()
    .min(10, 'O telefone deve ter pelo menos 10 digitos'),
  email: z
    .union([z.string().email('Informe um email valido'), z.literal('')])
    .optional(),
  notes: z
    .string()
    .optional(),
})

export type PatientForm = z.infer<typeof patientSchema>

// ─── Booking Patient (simplified for appointment flow) ────────────────────────
export const bookingPatientSchema = z.object({
  name: z
    .string()
    .min(2, 'O nome deve ter pelo menos 2 caracteres'),
  phone: z
    .string()
    .min(10, 'O telefone deve ter pelo menos 10 digitos'),
  email: z
    .union([z.string().email('Informe um email valido'), z.literal('')])
    .optional(),
})

export type BookingPatientForm = z.infer<typeof bookingPatientSchema>

// ─── Profile ──────────────────────────────────────────────────────────────────
export const profileSchema = z.object({
  name: z
    .string()
    .min(2, 'O nome deve ter pelo menos 2 caracteres'),
  phone: z
    .string()
    .min(10, 'O telefone deve ter pelo menos 10 digitos'),
  slug: z
    .union([
      z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minusculas e hifens'),
      z.literal(''),
    ])
    .optional(),
})

export type ProfileForm = z.infer<typeof profileSchema>
