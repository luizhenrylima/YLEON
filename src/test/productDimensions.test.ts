import { describe, expect, it } from 'vitest';
import { extractDimensionsFromDescription } from '@/components/ProductDimensions';

describe('extractDimensionsFromDescription', () => {
  it('extracts explicit dimension labels', () => {
    expect(extractDimensionsFromDescription('Altura 83 cm, largura 80 cm, profundidade 80 cm')).toEqual({
      height: '83',
      width: '80',
      depth: '80',
    });
  });

  it('extracts generic three-value measurements in height, width and depth order', () => {
    expect(extractDimensionsFromDescription('Medidas: 83 x 80 x 80 cm')).toEqual({
      height: '83',
      width: '80',
      depth: '80',
    });
  });

  it('extracts abbreviated labels with the unit only at the end', () => {
    expect(extractDimensionsFromDescription('Dimensões: A 83cm x L 80cm x P 80cm')).toEqual({
      height: '83',
      width: '80',
      depth: '80',
    });

    expect(extractDimensionsFromDescription('Dimensões: A 83 x L 80 x P 80 cm')).toEqual({
      height: '83',
      width: '80',
      depth: '80',
    });
  });

  it('extracts value before label sentences', () => {
    expect(extractDimensionsFromDescription('83 cm de altura, 80 cm de largura e 80 cm de profundidade')).toEqual({
      height: '83',
      width: '80',
      depth: '80',
    });
  });

  it('extracts pipe-separated compact labels', () => {
    expect(extractDimensionsFromDescription('L: 80cm | A: 83cm | P: 80cm')).toEqual({
      height: '83',
      width: '80',
      depth: '80',
    });
  });

  it('returns an empty object when no dimensions are found', () => {
    expect(extractDimensionsFromDescription()).toEqual({});
    expect(extractDimensionsFromDescription('Produto com acabamento em madeira natural.')).toEqual({});
  });
});
