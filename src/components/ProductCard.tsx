import React, { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles, Heart, StickyNote, GitCompareArrows } from 'lucide-react';
import { usePrefetchProduct } from '@/hooks/useProduct';
import { useCompare } from '@/contexts/CompareContext';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

interface ProductCardProps {
  product: Product;
  brandName: string;
  isFeatured?: boolean;
  isFavorite?: boolean;
  hasNote?: boolean;
  styleTags?: { id: string; name: string }[];
  onFavoriteClick?: (e: React.MouseEvent, product: Product) => void;
  showFavorite?: boolean;
}

const ProductCard = React.memo(function ProductCard({
  product,
  brandName,
  isFeatured = false,
  isFavorite = false,
  hasNote = false,
  styleTags = [],
  onFavoriteClick,
  showFavorite = false,
}: ProductCardProps) {
  const prefetch = usePrefetchProduct();
  const navigate = useNavigate();
  const { addItem, removeItem, isInCompare } = useCompare();
  const inCompare = isInCompare(product.id);

  const handleMouseEnter = useCallback(() => {
    prefetch(product.id);
  }, [product.id, prefetch]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    navigate(`/product/${product.id}`, {
      state: { product },
    });
  }, [navigate, product]);

  return (
    <div className="group relative" onMouseEnter={handleMouseEnter}>
      <a
        href={`/product/${product.id}`}
        onClick={handleClick}
        aria-label={`Ver detalhes de ${product.name}`}
      >
        <div
          className={`aspect-[4/5] bg-muted/30 mb-4 overflow-hidden rounded-xl flex items-center justify-center border transition-all duration-500 ${
            isFeatured
              ? 'border-accent/20 shadow-md hover:shadow-xl rounded-2xl'
              : 'border-border hover:border-accent/20 hover:shadow-lg'
          } relative card-hover`}
        >
          {isFeatured && (
            <div className="absolute top-3 left-3 z-10 bg-accent text-accent-foreground px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5 shadow-sm">
              <Sparkles size={10} aria-hidden="true" /> Destaque
            </div>
          )}
          <img
            src={product.images?.[0] || '/placeholder.svg'}
            loading="lazy"
            decoding="async"
            width={400}
            height={500}
            className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105"
            alt={`Foto do produto ${product.name}`}
          />
        </div>
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium text-foreground group-hover:text-accent transition-colors duration-200">
                {product.name}
              </h3>
              {hasNote && (
                <StickyNote size={12} className="text-accent/70 shrink-0" aria-label="Produto com anotação" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] mt-0.5">
              {brandName}
            </p>
            <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{product.category}</p>
            {styleTags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {styleTags.slice(0, 3).map(tag => (
                  <span
                    key={tag.id}
                    className={`text-[9px] px-2 py-0.5 rounded-full border ${
                      isFeatured
                        ? 'bg-accent/10 text-accent border-accent/20'
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span
            className="p-2 border border-border rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 group-hover:shadow-sm"
            aria-hidden="true"
          >
            <ChevronRight size={14} />
          </span>
        </div>
      </a>

      {showFavorite && onFavoriteClick && (
        <button
          onClick={(e) => onFavoriteClick(e, product)}
          data-onboarding="favorite-product"
          aria-label={isFavorite ? `Editar favorito ${product.name}` : `Favoritar ${product.name}`}
          aria-pressed={isFavorite}
          className={`absolute top-3 right-3 p-2 rounded-full border backdrop-blur-sm transition-all duration-200 z-10 ${
            isFavorite
              ? 'bg-destructive/10 border-destructive/30 text-destructive opacity-100'
              : 'bg-card/80 border-border text-muted-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:text-destructive'
          }`}
        >
          <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      )}

      {/* Compare button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (inCompare) removeItem(product.id);
          else addItem(product, brandName);
        }}
        aria-label={inCompare ? 'Remover da comparação' : 'Comparar'}
        className={`absolute top-3 ${showFavorite ? 'right-12' : 'right-3'} p-2 rounded-full border backdrop-blur-sm transition-all duration-200 z-10 ${
          inCompare
            ? 'bg-accent/10 border-accent/30 text-accent opacity-100'
            : 'bg-card/80 border-border text-muted-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:text-accent'
        }`}
      >
        <GitCompareArrows size={14} aria-hidden="true" />
      </button>
    </div>
  );
});

export default ProductCard;
