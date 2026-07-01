type NewProjectOptions = {
  clientName: string;
  initialNotes?: string;
  sellerUserId?: string | null;
  architectProfileId?: string | null;
  architectName?: string | null;
  consultantName?: string | null;
  customerId?: string | null;
  tags?: string[];
};

export function buildNewProjectPayload(userId: string, name: string, options: NewProjectOptions) {
  return {
    user_id: userId,
    name,
    client_name: options.clientName,
    initial_notes: options.initialNotes || null,
    seller_user_id: options.sellerUserId || null,
    crm_architect_profile_id: options.architectProfileId || null,
    architect_name: options.architectName || null,
    consultant_name: options.consultantName || null,
    crm_customer_id: options.customerId || null,
    crm_tags: options.tags || [],
    crm_status: 'novo_atendimento',
    crm_quote_status: 'sem_orcamento',
    crm_order_status: 'sem_pedido',
    crm_delivery_status: 'sem_entrega',
    crm_approval_status: 'pendente',
    crm_risk_level: 'baixo',
  };
}
