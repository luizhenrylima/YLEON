import { describe, expect, it } from 'vitest';
import { formatCurrencyBRL, resetPriceConsultationState, summarizeProductPrices } from '@/lib/priceConsultant';
import { normalizePriceRows } from '@/lib/priceImport';

describe('price consultant helpers', () => {
  it('summarizes product price ranges and distinct options', () => {
    const summary = summarizeProductPrices([
      { price: 1000, variationId: 'v1', finishId: 'f1' },
      { price: 1800, variationId: 'v1', finishId: 'f2' },
      { price: 1500, variationId: 'v2', finishId: 'f2' },
    ]);

    expect(summary).toEqual({
      variationCount: 2,
      finishCount: 2,
      minPrice: 1000,
      maxPrice: 1800,
      priceCount: 3,
    });
  });

  it('formats BRL values and unavailable prices', () => {
    expect(formatCurrencyBRL(4567.12)).toBe('R$ 4.567,12');
    expect(formatCurrencyBRL(null)).toBe('Valor indisponivel');
  });

  it('resets all consultation filters', () => {
    expect(resetPriceConsultationState()).toEqual({
      brandId: null,
      categoryId: null,
      productId: null,
      variationId: null,
      selectedPriceId: null,
      productSearch: '',
      globalSearch: '',
    });
  });

  it('normalizes Tissot-like price rows and creates a placeholder finish', () => {
    const parsed = normalizePriceRows({
      categorias: [{ categoria_id: 'CADEIRA', nome_exibicao: 'Cadeira' }],
      produtos: [{ produto_id: 'PROD-1', slug: 'cadeira-alma' }],
      variacoes: [{ variacao_id: 'VAR-1', produto: 'CADEIRA ALMA', medidas: '50x50', observacoes_tecnicas: 'Base fixa' }],
      acabamentos: [],
      precos: [
        {
          preco_id: 'P1',
          produto_id: 'PROD-1',
          variacao_id: 'VAR-1',
          marca: 'Tissot',
          categoria: 'CADEIRA',
          produto: 'CADEIRA ALMA',
          codigo_variacao: 'CAD123',
          codigo_acabamento: '',
          acabamento_revestimento: '',
          valor_tabela: 1234.56,
          origem: 'Tabela',
        },
      ],
    });

    expect(parsed.invalidRows).toBe(0);
    expect(parsed.counts).toMatchObject({ brands: 1, categories: 1, products: 1, variations: 1, finishes: 1, prices: 1 });
    expect(parsed.rows[0]).toMatchObject({
      finishCode: 'SEM-ACABAMENTO',
      finishName: 'Sem acabamento especificado',
      productSlug: 'cadeira-alma',
      price: 1234.56,
    });
  });
});
