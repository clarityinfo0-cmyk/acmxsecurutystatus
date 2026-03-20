
'use server';
/**
 * @fileOverview Agente de soporte inteligente para ACREIMEX con un enfoque humano y servicial.
 * 
 * Este flujo maneja las consultas de los clientes de manera cordial, solicitando información
 * si es necesario y proporcionando claridad sobre el estatus del folio solo cuando se requiere.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SupportInputSchema = z.object({
  message: z.string().describe('El mensaje enviado por el cliente.'),
  transferContext: z.object({
    id: z.string().optional(),
    recipientName: z.string().optional(),
    chargeConcept: z.string().optional(),
    chargeAmount: z.number().optional(),
    amount: z.number().optional(),
    bankName: z.string().optional(),
    estado_transferencia: z.string().optional(),
  }).optional().describe('El contexto de la transferencia actual si existe.'),
});

const SupportOutputSchema = z.object({
  response: z.string().describe('La respuesta cordial y profesional del asistente de ACREIMEX.'),
});

export type SupportInput = z.infer<typeof SupportInputSchema>;
export type SupportOutput = z.infer<typeof SupportOutputSchema>;

const supportPrompt = ai.definePrompt({
  name: 'supportPrompt',
  input: { schema: SupportInputSchema },
  output: { schema: SupportOutputSchema },
  prompt: `Eres un Asesor Senior de Atención al Cliente de ACREIMEX S.A. DE C.V. 
Tu prioridad es ser amable, empático y resolver dudas de manera directa sin dar rodeos.

DIRECTRICES DE INTERACCIÓN:
1. IDENTIFICACIÓN: 
   - Si el cliente NO ha proporcionado su folio o nombre (ver transferContext), saluda cordialmente y pídelos: "¡Hola! Con mucho gusto le ayudo. ¿Me podría indicar su nombre y número de folio para revisar su trámite?"
   - Si YA tienes el contexto ({{{transferContext.recipientName}}}), úsalo para saludar: "Hola, {{{transferContext.recipientName}}}. Tengo aquí los detalles de su folio {{{transferContext.id}}}."

2. TONO Y EXPLICACIÓN SEGÚN ESTATUS:
   - Mantén un tono servicial.
   - Si el estatus es "en_espera_liberacion": Explica que su expediente ya fue aprobado y sus datos son correctos. Estamos en la cola de dispersión masiva debido a la alta demanda de folios. Este proceso toma de 2 a 72 horas.
   - Si el estatus es "pendiente_liberacion" o "EN PROCESO": Explica que estamos trabajando en la validación final de liquidez interbancaria en la red SPEI para asegurar su depósito.
   - SOLO si el cliente pregunta "¿Por qué el cobro?", "¿Por qué está retenido?" o cuestiona el cargo de {{{transferContext.chargeAmount}}}, explica con profesionalismo que es un protocolo de validación de activos requerido por la normativa para asegurar la dispersión segura de sus {{{transferContext.amount}}} pesos.

3. USO DE LA FRASE DE CIERRE:
   - USA la frase EXACTAMENTE al final de tu respuesta SOLAMENTE cuando estés explicando el estatus, el pago requerido o los siguientes pasos de liberación.
   - Frase obligatoria: "después de este requisito se libera tu línea de crédito".

Contexto del folio actual (si aplica):
- Nombre: {{{transferContext.recipientName}}}
- Folio: {{{transferContext.id}}}
- Monto a recibir: {{{transferContext.amount}}}
- Concepto de cargo: {{{transferContext.chargeConcept}}}
- Monto del cargo: {{{transferContext.chargeAmount}}}
- Estatus: {{{transferContext.estado_transferencia}}}

Mensaje del cliente: {{{message}}}`,
});

const supportFlow = ai.defineFlow(
  {
    name: 'supportFlow',
    inputSchema: SupportInputSchema,
    outputSchema: SupportOutputSchema,
  },
  async (input) => {
    const { output } = await supportPrompt(input);
    if (!output) throw new Error('No se pudo generar una respuesta.');
    return output;
  }
);

export async function askSupport(input: SupportInput): Promise<SupportOutput> {
  return supportFlow(input);
}
