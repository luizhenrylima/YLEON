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

export function projectMutationErrorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : String(error || '');
  const details = error && typeof error === 'object' && 'details' in error
    ? String((error as { details?: unknown }).details || '')
    : '';
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const text = `${code} ${message} ${details}`.toLowerCase();

  if (text.includes('nome do cliente') || text.includes('client_name') || text.includes('cliente')) {
    return 'Cliente final e obrigatorio para criar o projeto.';
  }
  if (text.includes('row-level security') || code === '42501') {
    return 'Erro de permissao no Supabase/RLS ao criar projeto. Verifique se o vendedor, arquiteto e cliente estao dentro das regras do seu perfil.';
  }
  if (text.includes('foreign key') || code === '23503') {
    return 'Nao foi possivel salvar o projeto porque existe um vinculo invalido com cliente, arquiteto ou vendedor.';
  }
  if (text.includes('rate') || text.includes('muitas tentativas') || code === 'p0001') {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }
  if (text.includes('not-null') || text.includes('null value') || code === '23502') {
    return 'Nao foi possivel salvar o projeto porque faltam campos obrigatorios.';
  }

  return message || 'Nao foi possivel criar o projeto. Confira os dados e tente novamente.';
}
