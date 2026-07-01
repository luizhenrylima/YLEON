import { z } from "zod";

export const appRoles = ["admin", "gestor", "vendedor", "arquiteto", "user"] as const;

const optionalText = (max = 500) =>
  z.string().trim().max(max, `Use no maximo ${max} caracteres.`).optional().or(z.literal(""));

export const emailSchema = z.string().trim().toLowerCase().email("Informe um e-mail valido.").max(254);

export const passwordSchema = z.string().min(6, "A senha precisa ter pelo menos 6 caracteres.").max(128);

export const phoneSchema = z
  .string()
  .trim()
  .max(32, "Telefone muito longo.")
  .refine(value => !value || /^[0-9+\-()\s.]{8,32}$/.test(value), "Informe um telefone valido.");

export const isoDateSchema = z
  .string()
  .trim()
  .refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Informe uma data valida.");

export const authLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const authRegisterSchema = authLoginSchema.extend({
  fullName: z.string().trim().min(3, "Informe o nome completo.").max(120, "Nome muito longo."),
  birthDate: isoDateSchema.refine(Boolean, "Informe a data de nascimento."),
  sellerId: z.string().uuid("Vendedor invalido.").optional().or(z.literal("")),
});

export const projectNameSchema = z.string().trim().min(2, "Informe o nome do projeto.").max(120, "Nome do projeto muito longo.");

export const projectDetailsSchema = z.object({
  client_name: optionalText(120),
  client_phone: phoneSchema.optional().or(z.literal("")),
  client_email: z.string().trim().toLowerCase().email("E-mail do cliente invalido.").optional().or(z.literal("")),
  client_city: optionalText(80),
  client_address: optionalText(220),
  construction_status: optionalText(80),
  construction_deadline: isoDateSchema.optional().or(z.literal("")),
  move_in_deadline: isoDateSchema.optional().or(z.literal("")),
  architect_name: optionalText(120),
  consultant_name: optionalText(120),
});

export const projectItemUpdateSchema = z.object({
  environment_label: optionalText(80),
  price: z.coerce.number().nonnegative("Preco nao pode ser negativo.").max(999999999, "Preco muito alto.").nullable().optional(),
  discount_price: z.coerce.number().nonnegative("Preco com desconto nao pode ser negativo.").max(999999999, "Preco muito alto.").nullable().optional(),
  quantity: z.coerce.number().int("Quantidade precisa ser inteira.").min(1, "Quantidade minima 1.").max(999, "Quantidade muito alta."),
  presentation_image_2_index: z.coerce.number().int().min(0).max(99).nullable().optional(),
  presentation_dimensions: optionalText(160),
});

export const agendaEventSchema = z.object({
  projectId: z.string().uuid("Projeto invalido.").optional().or(z.literal("")),
  title: z.string().trim().min(2, "Informe o titulo.").max(120, "Titulo muito longo."),
  eventType: z.enum(["entrega", "reuniao", "atendimento", "visita", "followup", "cobranca_fabrica", "pos_venda", "outro"]),
  scheduledAt: z.string().trim().min(1, "Informe data e horario."),
  location: optionalText(160),
  notes: optionalText(1000),
});

export const markupSchema = z.coerce.number().min(0, "Markup nao pode ser negativo.").max(1000, "Markup muito alto.");

export const uploadFileSchema = z.object({
  name: z.string().max(180),
  size: z.number().positive().max(8 * 1024 * 1024, "Arquivo maior que 8MB."),
  type: z.string().refine(
    type => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type),
    "Envie apenas imagens JPG, PNG, WEBP ou GIF.",
  ),
});

export function firstZodMessage(error: z.ZodError) {
  return error.issues[0]?.message || "Confira os campos e tente novamente.";
}

export function sanitizePlainText(value: string, max = 500) {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
